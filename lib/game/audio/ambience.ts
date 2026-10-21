import type { TimeOfDay, WeatherType } from '../constants';
import type { AudioCore } from './core';
import { clamp01, crowdProximity } from './helpers';

/**
 * Ambient beds, built once:
 *
 *  crowd : pink -> bandpass(760) ─┐
 *          pink -> bandpass(1850) ┴> crowdSwell (two slow LFOs) -> crowdGain -> bus.amb
 *  rain  : white -> highpass(2.4k) -> lowpass(9k) -> rainHiss ─┐
 *          pink -> bandpass(650) -> rainBody ──────────────────┴> rainGain -> bus.amb
 *  birds : scheduled sine chirps -> StereoPanner -> bus.amb (day, dry only; very quiet)
 *  cheer : one-shot pink bursts through sweeping bandpasses
 */
export class Ambience {
  private readonly core: AudioCore;
  private readonly crowdGain: GainNode;
  private readonly crowdLpf: BiquadFilterNode;
  private readonly rainGain: GainNode;
  private birdTimer = 2;
  private crowdLevel = 0;

  constructor(core: AudioCore) {
    this.core = core;
    const { ctx, noise, bus } = core;

    // crowd
    this.crowdGain = ctx.createGain();
    this.crowdGain.gain.value = 0;
    const swell = ctx.createGain();
    swell.gain.value = 0.72;
    this.crowdLpf = ctx.createBiquadFilter();
    this.crowdLpf.type = 'lowpass';
    this.crowdLpf.frequency.value = 3200;
    for (const [freq, q, gain] of [
      [760, 0.6, 1.0],
      [1850, 0.5, 0.55],
    ] as const) {
      const src = noise.loop(noise.pink);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = freq;
      bp.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(bp).connect(g).connect(swell);
    }
    for (const [rate, depth] of [
      [0.07, 0.2],
      [0.16, 0.1],
    ] as const) {
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = rate;
      const d = ctx.createGain();
      d.gain.value = depth;
      lfo.connect(d).connect(swell.gain);
      lfo.start();
    }
    swell.connect(this.crowdLpf).connect(this.crowdGain).connect(bus.amb);

    // rain
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    const hissSrc = noise.loop(noise.white);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2400;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 9000;
    const hissGain = ctx.createGain();
    hissGain.gain.value = 0.5;
    hissSrc.connect(hp).connect(lp).connect(hissGain).connect(this.rainGain);
    const bodySrc = noise.loop(noise.pink);
    const bodyBp = ctx.createBiquadFilter();
    bodyBp.type = 'bandpass';
    bodyBp.frequency.value = 650;
    bodyBp.Q.value = 0.5;
    const bodyGain = ctx.createGain();
    bodyGain.gain.value = 0.6;
    bodySrc.connect(bodyBp).connect(bodyGain).connect(this.rainGain);
    this.rainGain.connect(bus.amb);
  }

  update(opts: {
    dt: number;
    idx: number;
    kmh: number;
    weather: WeatherType;
    timeOfDay: TimeOfDay;
    running: boolean;
  }) {
    const { ctx } = this.core;
    const now = ctx.currentTime;

    // Crowd: murmur everywhere, roar at the grandstands. Quieter as speed rises (we pass them).
    const prox = crowdProximity(opts.idx);
    const wet = opts.weather === 'rain' ? 0.75 : 1;
    this.crowdLevel = (0.035 + 0.17 * prox) * wet;
    this.crowdGain.gain.setTargetAtTime(this.crowdLevel, now, 0.6);
    this.crowdLpf.frequency.setTargetAtTime(1800 + prox * 2400, now, 0.5);

    // Rain.
    this.rainGain.gain.setTargetAtTime(opts.weather === 'rain' ? 0.1 : 0, now, 1.2);

    // Birds: only by day, only dry, only if the car isn't screaming past.
    if (opts.running && opts.timeOfDay === 'day' && opts.weather !== 'rain') {
      this.birdTimer -= opts.dt;
      if (this.birdTimer <= 0) {
        this.birdTimer = 1.5 + Math.random() * 4.5;
        if (opts.kmh < 220) this.chirp(0.012 * (1 - clamp01(opts.kmh / 260)));
      }
    }
  }

  get crowdBase() {
    return this.crowdLevel;
  }

  /** Crowd cheer one-shot, `strength` 0..1. */
  cheer(strength: number) {
    const { ctx, noise, bus } = this.core;
    const now = ctx.currentTime;
    const s = clamp01(strength);
    if (s < 0.02) return;
    const dur = 2.0;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.5 * s, now + 0.3);
    g.gain.setValueAtTime(0.5 * s, now + 0.65);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    for (const [f0, f1, q] of [
      [850, 1300, 1.1],
      [1700, 2300, 0.9],
    ] as const) {
      const src = noise.burst(noise.pink, now, dur);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = q;
      bp.frequency.setValueAtTime(f0, now);
      bp.frequency.linearRampToValueAtTime(f1, now + 0.5);
      bp.frequency.linearRampToValueAtTime(f0 * 1.1, now + dur);
      src.connect(bp).connect(g);
    }
    g.connect(bus.amb);
  }

  private chirp(peak: number) {
    const { ctx, bus } = this.core;
    if (peak < 0.001) return;
    const now = ctx.currentTime;
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.random() * 2 - 1;
    pan.connect(bus.amb);
    const notes = 2 + Math.floor(Math.random() * 4);
    const base = 2800 + Math.random() * 2400;
    let t = now;
    for (let i = 0; i < notes; i++) {
      const len = 0.05 + Math.random() * 0.07;
      const o = ctx.createOscillator();
      o.type = 'sine';
      const f0 = base * (0.9 + Math.random() * 0.4);
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * (0.7 + Math.random() * 0.9), t + len);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(peak, t + len * 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g).connect(pan);
      o.start(t);
      o.stop(t + len + 0.02);
      t += len + 0.03 + Math.random() * 0.05;
    }
  }
}
