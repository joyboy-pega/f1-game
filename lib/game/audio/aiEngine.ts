import type { AudioCore } from './core';
import { assignVoices, clamp, clamp01, dopplerRatio, firingFreq, harmonicSeries, rpmNorm, type VoiceCandidate } from './helpers';
import type { AIFrame, AudioFrame } from './types';

const VOICES = 4;
const REASSIGN_EVERY = 0.25;
/** Audible range in sim units (1 unit = 0.1 m). */
const MAX_DIST = 3200;
const FADE_START = 2200;
const UNIT_M = 0.1;

interface Voice {
  carId: number;
  osc: OscillatorNode;
  sub: OscillatorNode;
  lp: BiquadFilterNode;
  gain: GainNode;
  panner: PannerNode;
  lastX: number;
  lastY: number;
  hasLast: boolean;
}

/**
 * Cheap positional voices for the nearest AI cars.
 *
 *   osc (PeriodicWave, 7 harmonics, f0*doppler) ─┐
 *   sub (saw, f0/2) ─────────────────────────────┴> lowpass -> gain -> PannerNode(equalpower, inverse) -> bus.ai
 *
 * Listener = player car (sim x,y -> audio x,z, heading from phys.a). Doppler is derived
 * from the finite-difference closing speed of each car, so it works regardless of what the
 * sim exposes as velocity.
 */
export class AIEngineBank {
  private readonly core: AudioCore;
  private readonly voices: Voice[] = [];
  private timer = 0;
  private assigned: number[] = new Array(VOICES).fill(-1);
  private prevPlayerX = 0;
  private prevPlayerY = 0;
  private hasPrevPlayer = false;
  private cands: VoiceCandidate[] = [];

  constructor(core: AudioCore) {
    this.core = core;
    const { ctx } = core;
    const amps = harmonicSeries(7, 0.95);
    const wave = ctx.createPeriodicWave(new Float32Array(amps.length + 1), new Float32Array([0, ...amps]));
    for (let i = 0; i < VOICES; i++) {
      const osc = ctx.createOscillator();
      osc.setPeriodicWave(wave);
      const sub = ctx.createOscillator();
      sub.type = 'sawtooth';
      const subGain = ctx.createGain();
      subGain.gain.value = 0.35;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 0.7;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const panner = ctx.createPanner();
      panner.panningModel = 'equalpower';
      panner.distanceModel = 'inverse';
      panner.refDistance = 10;
      panner.rolloffFactor = 1.5;
      panner.maxDistance = 1000;
      osc.connect(lp);
      sub.connect(subGain).connect(lp);
      lp.connect(gain).connect(panner).connect(core.bus.ai);
      osc.start();
      sub.start();
      this.voices.push({ carId: -1, osc, sub, lp, gain, panner, lastX: 0, lastY: 0, hasLast: false });
    }
  }

  reset() {
    this.assigned.fill(-1);
    this.timer = 0;
    this.hasPrevPlayer = false;
    for (const v of this.voices) {
      v.carId = -1;
      v.hasLast = false;
      v.gain.gain.cancelScheduledValues(0);
      v.gain.gain.value = 0;
    }
  }

  update(f: AudioFrame, dt: number) {
    const { ctx } = this.core;
    const now = ctx.currentTime;
    const p = f.player;

    this.updateListener(p.x, p.y, p.a);

    // Player velocity (finite difference) for the Doppler term.
    let pvx = 0;
    let pvy = 0;
    if (this.hasPrevPlayer && dt > 1e-4) {
      pvx = ((p.x - this.prevPlayerX) / dt) * UNIT_M;
      pvy = ((p.y - this.prevPlayerY) / dt) * UNIT_M;
    }
    this.prevPlayerX = p.x;
    this.prevPlayerY = p.y;
    this.hasPrevPlayer = true;

    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = REASSIGN_EVERY;
      this.reassign(f);
    }

    for (let i = 0; i < VOICES; i++) {
      const v = this.voices[i];
      const car = v.carId >= 0 ? this.find(f, v.carId) : null;
      if (!car) {
        v.gain.gain.setTargetAtTime(0, now, 0.06);
        v.hasLast = false;
        continue;
      }
      this.driveVoice(v, car, p.x, p.y, pvx, pvy, dt, now);
    }
  }

  private find(f: AudioFrame, id: number): AIFrame | null {
    for (let i = 0; i < f.aiCount; i++) if (f.ai[i].id === id) return f.ai[i];
    return null;
  }

  private reassign(f: AudioFrame) {
    const p = f.player;
    const c = this.cands;
    c.length = 0;
    for (let i = 0; i < f.aiCount; i++) {
      const a = f.ai[i];
      const d = Math.hypot(a.x - p.x, a.y - p.y);
      if (d < MAX_DIST) c.push({ id: a.id, dist: d });
    }
    c.sort((a, b) => a.dist - b.dist);
    this.assigned = assignVoices(this.assigned, c);
    for (let i = 0; i < VOICES; i++) {
      const v = this.voices[i];
      if (v.carId !== this.assigned[i]) {
        v.carId = this.assigned[i];
        v.hasLast = false;
        // A newly assigned voice starts silent; driveVoice fades it in at the new position.
        v.gain.gain.cancelScheduledValues(this.core.ctx.currentTime);
        v.gain.gain.value = 0;
      }
    }
  }

  private driveVoice(v: Voice, a: AIFrame, px: number, py: number, pvx: number, pvy: number, dt: number, now: number) {
    // Car world velocity in m/s via finite difference.
    let vx = 0;
    let vy = 0;
    if (v.hasLast && dt > 1e-4) {
      vx = ((a.x - v.lastX) / dt) * UNIT_M;
      vy = ((a.y - v.lastY) / dt) * UNIT_M;
    }
    const first = !v.hasLast;
    v.lastX = a.x;
    v.lastY = a.y;
    v.hasLast = true;

    const dx = (a.x - px) * UNIT_M;
    const dy = (a.y - py) * UNIT_M;
    const dist = Math.hypot(dx, dy) || 0.001;
    // Closing speed = -(relative velocity . direction to source)
    const closing = -(((vx - pvx) * dx + (vy - pvy) * dy) / dist);
    const doppler = dopplerRatio(closing);

    const pos = v.panner;
    if (pos.positionX) {
      if (first) {
        pos.positionX.value = a.x * UNIT_M;
        pos.positionZ.value = a.y * UNIT_M;
      }
      pos.positionX.setTargetAtTime(a.x * UNIT_M, now, 0.03);
      pos.positionY.value = 0.4;
      pos.positionZ.setTargetAtTime(a.y * UNIT_M, now, 0.03);
    } else {
      pos.setPosition(a.x * UNIT_M, 0.4, a.y * UNIT_M);
    }

    const rpm = clamp(a.rpm, 3500, 11000);
    const rn = rpmNorm(rpm);
    const thr = clamp01(a.throttle);
    const f0 = firingFreq(rpm) * doppler;
    v.osc.frequency.setTargetAtTime(f0, now, 0.05);
    v.sub.frequency.setTargetAtTime(f0 * 0.5, now, 0.05);
    v.lp.frequency.setTargetAtTime(900 + rn * 1500 + thr * 2800, now, 0.08);
    const range = 1 - clamp01((Math.hypot(a.x - px, a.y - py) - FADE_START) / (MAX_DIST - FADE_START));
    // Panner handles distance rolloff; this is the per-voice loudness + range fade.
    v.gain.gain.setTargetAtTime((0.35 + 0.65 * thr) * 0.55 * range, now, first ? 0.15 : 0.08);
  }

  private updateListener(x: number, y: number, a: number) {
    const l = this.core.ctx.listener;
    const px = x * UNIT_M;
    const pz = y * UNIT_M;
    const fx = Math.cos(a);
    const fz = Math.sin(a);
    if (l.positionX) {
      l.positionX.value = px;
      l.positionY.value = 0.8;
      l.positionZ.value = pz;
      l.forwardX.value = fx;
      l.forwardY.value = 0;
      l.forwardZ.value = fz;
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    } else {
      l.setPosition(px, 0.8, pz);
      l.setOrientation(fx, 0, fz, 0, 1, 0);
    }
  }
}
