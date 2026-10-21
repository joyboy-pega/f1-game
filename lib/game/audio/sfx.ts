import type { AudioCore } from './core';
import { clamp01 } from './helpers';

type Bus = 'ui' | 'sfx';

interface ToneOpts {
  type?: OscillatorType;
  gain?: number;
  /** Seconds from now. */
  at?: number;
  slideTo?: number;
  attack?: number;
  bus?: Bus;
  lowpass?: number;
}

/**
 * One-shot sounds: race cues (UI bus) and impacts / pit (sfx bus).
 * Each call creates a few short-lived nodes that are garbage-collected after `stop()`;
 * noise comes from the shared NoiseBank so nothing is allocated per hit.
 */
export class Sfx {
  private readonly core: AudioCore;

  constructor(core: AudioCore) {
    this.core = core;
  }

  private tone(freq: number, dur: number, o: ToneOpts = {}) {
    const { ctx, bus } = this.core;
    const t = ctx.currentTime + (o.at ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t + dur);
    const g = ctx.createGain();
    const peak = o.gain ?? 0.2;
    const atk = o.attack ?? 0.008;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + atk);
    g.gain.setValueAtTime(peak, t + Math.max(atk, dur - 0.04));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const dest = bus[o.bus ?? 'ui'];
    if (o.lowpass) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = o.lowpass;
      osc.connect(lp).connect(g).connect(dest);
    } else {
      osc.connect(g).connect(dest);
    }
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noiseHit(
    dur: number,
    o: { at?: number; freq: number; q?: number; type?: BiquadFilterType; gain: number; buf?: 'white' | 'pink' | 'brown'; bus?: Bus; sweepTo?: number }
  ) {
    const { ctx, noise, bus } = this.core;
    const t = ctx.currentTime + (o.at ?? 0);
    const src = noise.burst(noise[o.buf ?? 'white'], t, dur);
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.Q.value = o.q ?? 1;
    f.frequency.setValueAtTime(o.freq, t);
    if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(o.sweepTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(bus[o.bus ?? 'sfx']);
  }

  // --- start lights -----------------------------------------------------------------

  /** Each light gets the same pip; the fifth is a touch higher to feel "complete". */
  startLight(count: number) {
    this.tone(count >= 5 ? 1046 : 880, 0.2, { type: 'sine', gain: 0.22 });
    this.tone(count >= 5 ? 2092 : 1760, 0.2, { type: 'sine', gain: 0.04 });
  }

  /** Lights out: a rising two-note "go" that is clearly different from the pips. */
  lightsOut() {
    this.tone(660, 0.12, { type: 'triangle', gain: 0.22 });
    this.tone(990, 0.12, { type: 'triangle', gain: 0.22, at: 0.1 });
    this.tone(1320, 0.34, { type: 'triangle', gain: 0.26, at: 0.2 });
    this.tone(2640, 0.3, { type: 'sine', gain: 0.05, at: 0.2 });
  }

  // --- DRS / timing -------------------------------------------------------------------

  drs(open: boolean) {
    if (open) {
      this.tone(880, 0.09, { gain: 0.16 });
      this.tone(1318, 0.16, { gain: 0.16, at: 0.07 });
    } else {
      this.tone(698, 0.08, { gain: 0.13 });
      this.tone(466, 0.14, { gain: 0.13, at: 0.06 });
    }
  }

  lapBeep() {
    this.tone(1200, 0.07, { type: 'square', gain: 0.07, lowpass: 3500 });
    this.tone(1200, 0.07, { type: 'square', gain: 0.07, lowpass: 3500, at: 0.1 });
  }

  /** Sector beep; `status` mirrors the timing-screen colour (overall = purple). */
  sectorBeep(status: 'none' | 'personal' | 'overall' | 'slower') {
    if (status === 'overall') {
      this.tone(1175, 0.08, { type: 'triangle', gain: 0.16 });
      this.tone(1480, 0.08, { type: 'triangle', gain: 0.16, at: 0.08 });
      this.tone(1760, 0.2, { type: 'triangle', gain: 0.18, at: 0.16 });
    } else if (status === 'personal') {
      this.tone(1100, 0.07, { type: 'triangle', gain: 0.13 });
      this.tone(1400, 0.1, { type: 'triangle', gain: 0.13, at: 0.07 });
    } else {
      this.tone(900, 0.09, { type: 'sine', gain: 0.1 });
    }
  }

  /** Fastest-lap mini fanfare: major arpeggio with a bright top. */
  fastestLap() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => {
      this.tone(f, i === notes.length - 1 ? 0.5 : 0.11, { type: 'triangle', gain: 0.16, at: i * 0.1 });
      this.tone(f * 2, i === notes.length - 1 ? 0.5 : 0.11, { type: 'sine', gain: 0.05, at: i * 0.1 });
    });
  }

  penalty() {
    for (let i = 0; i < 2; i++) {
      this.tone(155, 0.17, { type: 'sawtooth', gain: 0.17, at: i * 0.22, lowpass: 900 });
      this.tone(160, 0.17, { type: 'square', gain: 0.08, at: i * 0.22, lowpass: 700 });
    }
  }

  pitLimiterTick() {
    this.tone(1650, 0.06, { type: 'square', gain: 0.07, lowpass: 3000 });
  }

  /** Short team-radio squelch: opens and closes with a noise tick + a soft tone. */
  radioBlip() {
    this.noiseHit(0.05, { freq: 2200, q: 0.8, gain: 0.07, bus: 'ui' });
    this.tone(1800, 0.05, { type: 'sine', gain: 0.05, at: 0.045 });
    this.noiseHit(0.04, { freq: 2600, q: 0.8, gain: 0.05, bus: 'ui', at: 0.1 });
  }

  biasTick() {
    this.tone(1400, 0.04, { type: 'triangle', gain: 0.1, slideTo: 400, attack: 0.002 });
  }

  // --- pit -------------------------------------------------------------------------------

  /** Wheel-gun burst x4 (one per corner) + a release hiss. */
  pitStop() {
    for (let i = 0; i < 4; i++) {
      const at = i * 0.12;
      for (let k = 0; k < 5; k++) {
        this.noiseHit(0.025, { at: at + k * 0.022, freq: 1800 + (k % 2) * 700, q: 2.5, gain: 0.16 });
      }
      this.tone(520, 0.1, { type: 'sawtooth', gain: 0.04, at, lowpass: 1500, bus: 'sfx' });
    }
    this.noiseHit(0.5, { at: 0.55, freq: 5000, q: 0.7, type: 'highpass', gain: 0.05, sweepTo: 3000 });
  }

  // --- impacts -----------------------------------------------------------------------------

  /** Car-to-car contact. `intensity` 0..1+, `atten` 0..1 distance attenuation. */
  collision(intensity: number, atten = 1) {
    const i = clamp01(intensity);
    const a = clamp01(atten);
    const peak = (0.15 + 0.6 * i) * a;
    this.tone(120 + 40 * (1 - i), 0.18 + 0.15 * i, { type: 'sine', gain: peak, slideTo: 38, bus: 'sfx', attack: 0.003 });
    this.noiseHit(0.1 + 0.12 * i, { freq: 700 + 800 * i, q: 0.9, gain: peak * 0.9, bus: 'sfx' });
    // Carbon "crack"
    this.noiseHit(0.05, { freq: 3200, q: 1.2, gain: peak * 0.5 * i, bus: 'sfx' });
  }

  /** Barrier hit: heavier, with a metallic ring. */
  wallHit(intensity: number) {
    const i = clamp01(intensity);
    const peak = 0.2 + 0.55 * i;
    this.tone(90, 0.3 + 0.2 * i, { type: 'sine', gain: peak, slideTo: 32, bus: 'sfx', attack: 0.003 });
    this.noiseHit(0.18 + 0.15 * i, { freq: 500 + 500 * i, q: 0.7, gain: peak * 0.9, bus: 'sfx' });
    this.noiseHit(0.1, { freq: 2400, q: 2, gain: peak * 0.4, bus: 'sfx' });
    this.tone(1180, 0.35, { type: 'sine', gain: 0.03 * i, bus: 'sfx', attack: 0.002 });
  }
}
