import type { AudioCore } from './core';
import {
  CAMERA_MIX,
  clamp,
  clamp01,
  crackleRate,
  detectShift,
  firingFreq,
  harmonicSeries,
  mguWhineFreq,
  rpmNorm,
  softClipCurve,
  turboWhistleFreq,
  type CameraMix,
} from './helpers';
import type { PlayerFrame } from './types';

const BASE_LEVEL = 0.42;

/**
 * Player power unit: V6 turbo-hybrid.
 *
 * Signal graph (all nodes built once, per-frame only AudioParam smoothing):
 *
 *   fund (PeriodicWave, 14 harmonics, f0 = rpm/60*3) ─┐
 *   rough (same wave, f0*1.006 -> beating/rasp) ──────┤
 *   bite (square, 2*f0) ──────────────────────────────┼─> preDrive -> WaveShaper(tanh) -> lowpass -> body(peaking)
 *   sub (saw, f0/3 = crank order -> burble) ──────────┘                                                │
 *   rasp: white -> bandpass -> AM(f0 sine) ────────────────────────────────────────────────────────────┤
 *                                                                                                     v
 *                                            shiftGain -> limiterGain -> loadGain -> camIn
 *   turbo: sine whistle + bandpassed hiss -> turboGain ─────────────────────────────────────> camIn
 *   MGU-K: two sines -> ersGain ────────────────────────────────────────────────────────────> camIn
 *   crackle/pop/shift one-shots -> crackleGain ─────────────────────────────────────────────> camIn
 *   camIn -> lowShelf -> highShelf -> lowpass -> bus.engine
 */
export class PlayerEngine {
  private readonly ctx: AudioContext;
  private readonly core: AudioCore;

  private readonly fund: OscillatorNode;
  private readonly rough: OscillatorNode;
  private readonly bite: OscillatorNode;
  private readonly sub: OscillatorNode;
  private readonly gRough: GainNode;
  private readonly gBite: GainNode;
  private readonly gSub: GainNode;
  private readonly preDrive: GainNode;
  private readonly lp: BiquadFilterNode;
  private readonly raspBp: BiquadFilterNode;
  private readonly raspGain: GainNode;
  private readonly raspAmOsc: OscillatorNode;
  private readonly shiftGain: GainNode;
  private readonly limiterGain: GainNode;
  private readonly loadGain: GainNode;
  private readonly turboOsc: OscillatorNode;
  private readonly turboGain: GainNode;
  private readonly hissBp: BiquadFilterNode;
  private readonly hissGain: GainNode;
  private readonly mguA: OscillatorNode;
  private readonly mguB: OscillatorNode;
  private readonly ersGain: GainNode;
  private readonly crackleGain: GainNode;
  private readonly lowShelf: BiquadFilterNode;
  private readonly highShelf: BiquadFilterNode;
  private readonly camLp: BiquadFilterNode;

  private lastGear: number | string | null = null;
  private lastMix: CameraMix | null = null;
  private spool = 0;
  private boost = 0;
  private prevThrottle = 0;
  private sinceLift = 10;
  private blowCooldown = 0;
  private wob = 0;
  private limCut = false;
  private limTimer = 0;
  private activePops = 0;

  constructor(core: AudioCore) {
    this.core = core;
    const ctx = (this.ctx = core.ctx);
    const { noise } = core;

    // --- tonal core -------------------------------------------------------
    const amps = harmonicSeries(14, 0.85);
    const wave = ctx.createPeriodicWave(new Float32Array(amps.length + 1), new Float32Array([0, ...amps]));
    this.fund = ctx.createOscillator();
    this.fund.setPeriodicWave(wave);
    this.rough = ctx.createOscillator();
    this.rough.setPeriodicWave(wave);
    this.bite = ctx.createOscillator();
    this.bite.type = 'square';
    this.sub = ctx.createOscillator();
    this.sub.type = 'sawtooth';

    const gFund = ctx.createGain();
    gFund.gain.value = 0.5;
    this.gRough = ctx.createGain();
    this.gBite = ctx.createGain();
    this.gSub = ctx.createGain();
    this.preDrive = ctx.createGain();
    const shaper = ctx.createWaveShaper();
    shaper.curve = softClipCurve(1024, 2.2) as Float32Array<ArrayBuffer>;
    shaper.oversample = '2x';
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.Q.value = 0.9;
    const body = ctx.createBiquadFilter();
    body.type = 'peaking';
    body.frequency.value = 950;
    body.Q.value = 1.1;
    body.gain.value = 4;

    this.fund.connect(gFund).connect(this.preDrive);
    this.rough.connect(this.gRough).connect(this.preDrive);
    this.bite.connect(this.gBite).connect(this.preDrive);
    this.sub.connect(this.gSub).connect(this.preDrive);
    this.preDrive.connect(shaper).connect(this.lp).connect(body);

    // --- rasp: noise gated at the firing rate ---------------------------------
    const raspSrc = noise.loop(noise.white);
    this.raspBp = ctx.createBiquadFilter();
    this.raspBp.type = 'bandpass';
    this.raspBp.Q.value = 0.9;
    const raspAm = ctx.createGain();
    raspAm.gain.value = 0.5;
    this.raspAmOsc = ctx.createOscillator();
    this.raspAmOsc.type = 'sine';
    const raspAmDepth = ctx.createGain();
    raspAmDepth.gain.value = 0.5;
    this.raspAmOsc.connect(raspAmDepth).connect(raspAm.gain);
    this.raspGain = ctx.createGain();
    raspSrc.connect(this.raspBp).connect(raspAm).connect(this.raspGain);

    // --- engine bus: shift cut -> rev limiter -> load ---------------------------
    this.shiftGain = ctx.createGain();
    this.limiterGain = ctx.createGain();
    this.loadGain = ctx.createGain();
    this.loadGain.gain.value = 0;
    body.connect(this.shiftGain);
    this.raspGain.connect(this.shiftGain);
    this.shiftGain.connect(this.limiterGain).connect(this.loadGain);

    // --- camera chain -------------------------------------------------------
    const camIn = ctx.createGain();
    this.lowShelf = ctx.createBiquadFilter();
    this.lowShelf.type = 'lowshelf';
    this.lowShelf.frequency.value = 220;
    this.highShelf = ctx.createBiquadFilter();
    this.highShelf.type = 'highshelf';
    this.highShelf.frequency.value = 3500;
    this.camLp = ctx.createBiquadFilter();
    this.camLp.type = 'lowpass';
    this.camLp.frequency.value = 16000;
    this.camLp.Q.value = 0.5;
    camIn.connect(this.lowShelf).connect(this.highShelf).connect(this.camLp).connect(core.bus.engine);
    this.loadGain.connect(camIn);

    // --- turbo whistle + hiss ----------------------------------------------------
    this.turboOsc = ctx.createOscillator();
    this.turboOsc.type = 'sine';
    this.turboGain = ctx.createGain();
    this.turboGain.gain.value = 0;
    this.turboOsc.connect(this.turboGain).connect(camIn);
    const hissSrc = noise.loop(noise.white);
    this.hissBp = ctx.createBiquadFilter();
    this.hissBp.type = 'bandpass';
    this.hissBp.Q.value = 4;
    this.hissGain = ctx.createGain();
    this.hissGain.gain.value = 0;
    hissSrc.connect(this.hissBp).connect(this.hissGain).connect(camIn);

    // --- MGU-K whine --------------------------------------------------------------
    this.mguA = ctx.createOscillator();
    this.mguA.type = 'sine';
    this.mguB = ctx.createOscillator();
    this.mguB.type = 'triangle';
    const mguBGain = ctx.createGain();
    mguBGain.gain.value = 0.35;
    this.ersGain = ctx.createGain();
    this.ersGain.gain.value = 0;
    this.mguA.connect(this.ersGain);
    this.mguB.connect(mguBGain).connect(this.ersGain);
    this.ersGain.connect(camIn);

    // --- one-shots (crackles, shifts) --------------------------------------------
    this.crackleGain = ctx.createGain();
    this.crackleGain.gain.value = 0.8;
    this.crackleGain.connect(camIn);

    for (const o of [this.fund, this.rough, this.bite, this.sub, this.raspAmOsc, this.turboOsc, this.mguA, this.mguB]) o.start();
  }

  setCamera(mix: CameraMix) {
    if (this.lastMix === mix) return;
    this.lastMix = mix;
    const now = this.ctx.currentTime;
    this.lowShelf.gain.setTargetAtTime(mix.lowDb, now, 0.15);
    this.highShelf.gain.setTargetAtTime(mix.highDb, now, 0.15);
    this.camLp.frequency.setTargetAtTime(mix.lpHz, now, 0.15);
  }

  /** Per-frame update from the player's state. */
  update(f: PlayerFrame, dt: number, mix: CameraMix = CAMERA_MIX.chase) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    this.setCamera(mix);

    const thr = clamp01(f.throttle);
    const load = Math.pow(thr, 0.8);
    const rpm = clamp(f.rpm, 3500, 11300);
    const rn = rpmNorm(rpm);
    const speedN = clamp01(f.kmh / 330);

    // Rev limiter: while pinned, alternate fuel cut / fire in ~85 ms cycles.
    if (rpm > 10800 && thr > 0.5) {
      this.limTimer -= dt;
      if (this.limTimer <= 0) {
        this.limCut = !this.limCut;
        this.limTimer = this.limCut ? 0.034 : 0.05;
      }
    } else {
      this.limCut = false;
      this.limTimer = 0;
    }
    this.limiterGain.gain.setTargetAtTime(this.limCut ? 0.28 : 1, now, 0.006);

    // Living pitch: idle lope + overrun flutter.
    this.wob += dt;
    const lope = 0.004 * Math.sin(this.wob * 7.3) + 0.003 * Math.sin(this.wob * 13.1 + 1);
    const flutter = (1 - load) * 0.01 * Math.sin(this.wob * 31.7 + 2.1);
    const f0 = firingFreq(Math.min(rpm, 11000)) * (1 + lope + flutter) * (this.limCut ? 0.955 : 1);
    this.fund.frequency.setTargetAtTime(f0, now, 0.022);
    this.rough.frequency.setTargetAtTime(f0 * 1.006, now, 0.022);
    this.bite.frequency.setTargetAtTime(f0 * 2, now, 0.022);
    this.sub.frequency.setTargetAtTime(f0 / 3, now, 0.022);
    this.raspAmOsc.frequency.setTargetAtTime(f0, now, 0.022);

    // Load-dependent timbre: more harmonics + drive on throttle, burble on overrun.
    this.gRough.gain.setTargetAtTime(0.2 + 0.2 * load, now, 0.06);
    this.gBite.gain.setTargetAtTime(0.03 + 0.24 * load * (0.3 + 0.7 * rn), now, 0.06);
    this.gSub.gain.setTargetAtTime(0.14 + 0.34 * (1 - load) + 0.08 * rn, now, 0.08);
    this.preDrive.gain.setTargetAtTime(1.1 + 2.4 * load + 0.8 * rn, now, 0.05);
    this.lp.frequency.setTargetAtTime(650 + rn * 1800 + load * (2600 + rn * 3800), now, 0.05);
    this.raspBp.frequency.setTargetAtTime(1500 + rn * 2800, now, 0.06);
    this.raspGain.gain.setTargetAtTime((0.012 + 0.08 * load * (0.4 + 0.6 * rn)) * mix.exhaust, now, 0.06);
    this.loadGain.gain.setTargetAtTime((0.3 + 0.7 * load) * BASE_LEVEL * mix.engine, now, 0.07);
    this.crackleGain.gain.setTargetAtTime(0.8 * mix.exhaust, now, 0.1);

    // Turbo: spool lags throttle*rpm, falls slower.
    const spoolTarget = load * clamp01((rn - 0.15) / 0.85);
    const tc = spoolTarget > this.spool ? 0.45 : 0.9;
    this.spool += (spoolTarget - this.spool) * (1 - Math.exp(-dt / tc));
    const sp = this.spool;
    this.turboOsc.frequency.setTargetAtTime(turboWhistleFreq(sp), now, 0.05);
    this.turboGain.gain.setTargetAtTime(0.03 * Math.pow(sp, 1.6) * mix.turbo, now, 0.08);
    this.hissBp.frequency.setTargetAtTime(4200 + sp * 2500, now, 0.08);
    this.hissGain.gain.setTargetAtTime(0.02 * sp * mix.turbo, now, 0.08);

    // Lift-off: blow-off flutter + crackle accounting.
    this.blowCooldown -= dt;
    if (this.prevThrottle > 0.7 && thr < 0.25 && sp > 0.45 && this.blowCooldown <= 0) {
      this.blowOff(sp, mix);
      this.blowCooldown = 0.8;
    }
    if (thr > 0.15) this.sinceLift = 0;
    else this.sinceLift += dt;
    this.prevThrottle = thr;

    const rate = crackleRate(rpm, thr, this.sinceLift);
    if (rate > 0 && this.activePops < 10 && Math.random() < rate * dt) this.crackle(0.15 + Math.random() * 0.35);

    // MGU-K: rises with speed, surges when deploying, harvest whine under braking.
    this.boost += ((f.boosting ? 1 : 0) - this.boost) * (1 - Math.exp(-dt / 0.2));
    const harvest = f.brake > 0.3 ? 1 : 0;
    const whine = mguWhineFreq(f.kmh) * (1 + 0.08 * this.boost);
    this.mguA.frequency.setTargetAtTime(whine, now, 0.06);
    this.mguB.frequency.setTargetAtTime(whine * 1.5, now, 0.06);
    this.ersGain.gain.setTargetAtTime(
      (0.003 + 0.007 * speedN + 0.022 * this.boost + 0.006 * harvest * speedN) * mix.ers,
      now,
      0.08
    );

    // Gear changes.
    const shift = detectShift(this.lastGear, f.gear);
    if (shift === 'up') this.onUpshift(load, mix);
    else if (shift === 'down') this.onDownshift(load);
    this.lastGear = f.gear;
  }

  /** Reset edge detectors (new session). */
  reset() {
    this.lastGear = null;
    this.prevThrottle = 0;
    this.spool = 0;
    this.sinceLift = 10;
  }

  // ---------------------------------------------------------------------------

  private onUpshift(load: number, mix: CameraMix) {
    const now = this.ctx.currentTime;
    const g = this.shiftGain.gain;
    // ~50 ms of near-silence (ignition cut) then a quick recovery.
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0.15, now + 0.012);
    g.setValueAtTime(0.15, now + 0.05);
    g.linearRampToValueAtTime(1, now + 0.1);
    // Crisp transient as the next gear engages.
    this.burstNoise(now + 0.055, 0.045, 900 + Math.random() * 300, 1.1, (0.18 + 0.3 * load) * mix.exhaust);
    this.thump(now + 0.05, 100, 46, 0.075, 0.16 + 0.1 * load);
  }

  private onDownshift(load: number) {
    const now = this.ctx.currentTime;
    const g = this.shiftGain.gain;
    // Throttle blip: brief swell + a stutter of pops.
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(1.35, now + 0.03);
    g.linearRampToValueAtTime(1, now + 0.16);
    this.burstNoise(now + 0.01, 0.03, 700 + Math.random() * 500, 1.3, 0.22 + 0.15 * load);
    if (Math.random() < 0.6) this.crackle(0.3);
  }

  private blowOff(spool: number, mix: CameraMix) {
    const { ctx, core } = this;
    const now = ctx.currentTime;
    const src = core.noise.burst(core.noise.white, now, 0.5);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.6;
    bp.frequency.setValueAtTime(5200, now);
    bp.frequency.exponentialRampToValueAtTime(1800, now + 0.4);
    const g = ctx.createGain();
    const peak = 0.07 * spool * mix.turbo;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(peak, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
    src.connect(bp).connect(g).connect(this.crackleGain);
  }

  /** Overrun pop(s): randomised short band-passed noise, sometimes with a low "boom". */
  private crackle(strength: number) {
    const now = this.ctx.currentTime;
    const n = 1 + (Math.random() < 0.35 ? 1 : 0) + (Math.random() < 0.12 ? 1 : 0);
    let t = now;
    for (let i = 0; i < n; i++) {
      const dur = 0.012 + Math.random() * 0.033;
      this.burstNoise(t, dur, 600 + Math.random() * 2600, 0.7 + Math.random() * 1.5, strength * (0.5 + Math.random() * 0.8));
      if (Math.random() < 0.3) this.thump(t, 130, 55, 0.05, strength * 0.5);
      t += 0.02 + Math.random() * 0.05;
    }
  }

  private burstNoise(when: number, dur: number, freq: number, q: number, peak: number) {
    const { ctx, core } = this;
    const src = core.noise.burst(core.noise.white, when, dur);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), when + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(bp).connect(g).connect(this.crackleGain);
    this.activePops++;
    src.onended = () => {
      this.activePops = Math.max(0, this.activePops - 1);
    };
  }

  private thump(when: number, f0: number, f1: number, dur: number, peak: number) {
    const { ctx } = this;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, when);
    o.frequency.exponentialRampToValueAtTime(f1, when + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), when + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g).connect(this.crackleGain);
    o.start(when);
    o.stop(when + dur + 0.02);
  }
}
