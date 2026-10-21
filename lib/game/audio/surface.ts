import type { AudioCore } from './core';
import { CAMERA_MIX, clamp01, kerbFactor, surfaceKind, tyreSqueal, type CameraMix } from './helpers';
import type { PlayerFrame } from './types';

/**
 * Continuous road layers for the player car, all built once and gated by gain:
 *
 *  squeal : white -> bandpass A (Q10) ─┐
 *           white -> bandpass B (1.5x) ┼-> squealGain -> bus.tyre   (+ triangle whine through bandpass)
 *  kerb   : brown -> lowpass(140) + sine(52 Hz) -> AM(square LFO, speed-locked) -> kerbGain -> bus.tyre
 *  gravel : white -> bandpass(2.2k) -> AM(random-ish 17 Hz LFO) -> gravelGain
 *  grass  : brown -> lowpass(320) -> grassGain
 *  wind   : pink -> bandpass (moves with speed) -> windGain (speed^2 * camera.wind)
 *  scrape : white -> bandpass(2.4k) + saw(310 Hz) through lowpass -> scrapeGain
 */
export class SurfaceLayers {
  private readonly core: AudioCore;
  private readonly squealBpA: BiquadFilterNode;
  private readonly squealBpB: BiquadFilterNode;
  private readonly squealTone: OscillatorNode;
  private readonly squealGain: GainNode;
  private readonly kerbLfo: OscillatorNode;
  private readonly kerbSine: OscillatorNode;
  private readonly kerbGain: GainNode;
  private readonly gravelLfo: OscillatorNode;
  private readonly gravelGain: GainNode;
  private readonly gravelBp: BiquadFilterNode;
  private readonly grassGain: GainNode;
  private readonly windBp: BiquadFilterNode;
  private readonly windGain: GainNode;
  private readonly scrapeGain: GainNode;
  private readonly scrapeBp: BiquadFilterNode;
  private readonly scrapeSaw: OscillatorNode;
  private wob = 0;
  private offAmount = 0;

  constructor(core: AudioCore) {
    this.core = core;
    const { ctx, noise, bus } = core;
    const out = bus.tyre;

    // --- squeal -------------------------------------------------------------
    this.squealGain = ctx.createGain();
    this.squealGain.gain.value = 0;
    this.squealBpA = ctx.createBiquadFilter();
    this.squealBpA.type = 'bandpass';
    this.squealBpA.Q.value = 10;
    this.squealBpB = ctx.createBiquadFilter();
    this.squealBpB.type = 'bandpass';
    this.squealBpB.Q.value = 7;
    const sa = noise.loop(noise.white);
    const sb = noise.loop(noise.white);
    const bGain = ctx.createGain();
    bGain.gain.value = 0.6;
    sa.connect(this.squealBpA).connect(this.squealGain);
    sb.connect(this.squealBpB).connect(bGain).connect(this.squealGain);
    this.squealTone = ctx.createOscillator();
    this.squealTone.type = 'triangle';
    const toneGain = ctx.createGain();
    toneGain.gain.value = 0.07;
    this.squealTone.connect(toneGain).connect(this.squealGain);
    this.squealGain.connect(out);

    // --- kerb rumble ----------------------------------------------------------
    const kerbNoise = noise.loop(noise.brown);
    const kerbLp = ctx.createBiquadFilter();
    kerbLp.type = 'lowpass';
    kerbLp.frequency.value = 160;
    this.kerbSine = ctx.createOscillator();
    this.kerbSine.type = 'sine';
    this.kerbSine.frequency.value = 52;
    const kerbSineGain = ctx.createGain();
    kerbSineGain.gain.value = 0.9;
    const kerbAm = ctx.createGain();
    kerbAm.gain.value = 0.55;
    this.kerbLfo = ctx.createOscillator();
    this.kerbLfo.type = 'square';
    this.kerbLfo.frequency.value = 18;
    const kerbDepth = ctx.createGain();
    kerbDepth.gain.value = 0.45;
    this.kerbLfo.connect(kerbDepth).connect(kerbAm.gain);
    this.kerbGain = ctx.createGain();
    this.kerbGain.gain.value = 0;
    kerbNoise.connect(kerbLp).connect(kerbAm);
    this.kerbSine.connect(kerbSineGain).connect(kerbAm);
    kerbAm.connect(this.kerbGain).connect(out);

    // --- gravel crunch --------------------------------------------------------------
    const gSrc = noise.loop(noise.white);
    this.gravelBp = ctx.createBiquadFilter();
    this.gravelBp.type = 'bandpass';
    this.gravelBp.frequency.value = 2200;
    this.gravelBp.Q.value = 0.8;
    const gravelAm = ctx.createGain();
    gravelAm.gain.value = 0.6;
    this.gravelLfo = ctx.createOscillator();
    this.gravelLfo.type = 'sawtooth';
    this.gravelLfo.frequency.value = 17;
    const gravelDepth = ctx.createGain();
    gravelDepth.gain.value = 0.4;
    this.gravelLfo.connect(gravelDepth).connect(gravelAm.gain);
    this.gravelGain = ctx.createGain();
    this.gravelGain.gain.value = 0;
    gSrc.connect(this.gravelBp).connect(gravelAm).connect(this.gravelGain).connect(out);

    // --- grass rumble ---------------------------------------------------------------
    const grSrc = noise.loop(noise.brown);
    const grLp = ctx.createBiquadFilter();
    grLp.type = 'lowpass';
    grLp.frequency.value = 320;
    this.grassGain = ctx.createGain();
    this.grassGain.gain.value = 0;
    grSrc.connect(grLp).connect(this.grassGain).connect(out);

    // --- wind -------------------------------------------------------------------------
    const wSrc = noise.loop(noise.pink);
    this.windBp = ctx.createBiquadFilter();
    this.windBp.type = 'bandpass';
    this.windBp.frequency.value = 500;
    this.windBp.Q.value = 0.45;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wSrc.connect(this.windBp).connect(this.windGain).connect(out);

    // --- wall scrape --------------------------------------------------------------------
    const scSrc = noise.loop(noise.white);
    this.scrapeBp = ctx.createBiquadFilter();
    this.scrapeBp.type = 'bandpass';
    this.scrapeBp.frequency.value = 2400;
    this.scrapeBp.Q.value = 1.4;
    this.scrapeSaw = ctx.createOscillator();
    this.scrapeSaw.type = 'sawtooth';
    this.scrapeSaw.frequency.value = 310;
    const scrapeLp = ctx.createBiquadFilter();
    scrapeLp.type = 'lowpass';
    scrapeLp.frequency.value = 1800;
    const sawGain = ctx.createGain();
    sawGain.gain.value = 0.25;
    this.scrapeGain = ctx.createGain();
    this.scrapeGain.gain.value = 0;
    scSrc.connect(this.scrapeBp).connect(this.scrapeGain);
    this.scrapeSaw.connect(sawGain).connect(scrapeLp).connect(this.scrapeGain);
    this.scrapeGain.connect(out);

    for (const o of [this.squealTone, this.kerbLfo, this.kerbSine, this.gravelLfo, this.scrapeSaw]) o.start();
  }

  update(f: PlayerFrame, dt: number, mix: CameraMix = CAMERA_MIX.chase) {
    const now = this.core.ctx.currentTime;
    const speedN = clamp01(f.kmh / 330);
    this.wob += dt;

    // Squeal: pitch rises with slip, slight random flutter keeps it organic.
    const lockSlip = Math.max(f.wheelSlipFront, f.wheelSlipRear);
    const sq = tyreSqueal({
      vf: f.vf,
      vl: f.vl,
      steer: f.steer,
      driftIntensity: f.driftIntensity,
      lockSlip,
      brake: f.brake,
      kmh: f.kmh,
    });
    const flutter = 1 + 0.03 * Math.sin(this.wob * 23) + 0.02 * Math.sin(this.wob * 37 + 1);
    const base = (1350 + sq * 1500 + speedN * 400) * flutter;
    this.squealBpA.frequency.setTargetAtTime(base, now, 0.04);
    this.squealBpB.frequency.setTargetAtTime(base * 1.52, now, 0.04);
    this.squealTone.frequency.setTargetAtTime(base * 0.62, now, 0.04);
    this.squealGain.gain.setTargetAtTime(0.5 * Math.pow(sq, 1.3), now, sq > 0.05 ? 0.05 : 0.12);

    // Kerb: thump rate locked to road speed (about one ridge every 0.75 m), only on corners.
    const kerb = kerbFactor(f.lateral, f.curvature);
    const kerbRate = 8 + (f.kmh / 3.6) * 1.3;
    this.kerbLfo.frequency.setTargetAtTime(Math.min(48, kerbRate), now, 0.05);
    this.kerbSine.frequency.setTargetAtTime(44 + speedN * 30, now, 0.1);
    this.kerbGain.gain.setTargetAtTime(kerb * clamp01(f.kmh / 60) * 0.55, now, 0.04);

    // Off-track surfaces.
    const kind = surfaceKind(f.onTrack, f.gravel);
    const moving = clamp01(f.kmh / 50);
    this.gravelLfo.frequency.setTargetAtTime(10 + speedN * 26, now, 0.1);
    this.gravelBp.frequency.setTargetAtTime(1800 + speedN * 1400, now, 0.1);
    this.gravelGain.gain.setTargetAtTime(kind === 'gravel' ? 0.3 * moving : 0, now, 0.08);
    this.grassGain.gain.setTargetAtTime(kind === 'grass' ? 0.5 * moving * (0.4 + 0.6 * speedN) : 0, now, 0.1);
    this.offAmount = kind === 'track' ? 0 : moving;

    // Wind: speed^2 so it only really arrives at high speed; less in the cockpit.
    this.windBp.frequency.setTargetAtTime(450 + speedN * 1900, now, 0.15);
    this.windGain.gain.setTargetAtTime(0.01 + 0.34 * speedN * speedN * mix.wind, now, 0.15);

    // Wall scrape.
    const sc = f.sparks > 0.02 ? clamp01(f.sparks) : 0;
    this.scrapeBp.frequency.setTargetAtTime(1600 + speedN * 1800, now, 0.05);
    this.scrapeSaw.frequency.setTargetAtTime(220 + speedN * 300, now, 0.05);
    this.scrapeGain.gain.setTargetAtTime(sc * (0.18 + 0.3 * speedN), now, 0.04);
  }

  get offTrackAmount() {
    return this.offAmount;
  }
}
