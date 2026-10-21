import type { NoiseBank } from './noise';

export interface Buses {
  /** Player engine, turbo, MGU-K and crackles (camera-filtered). */
  engine: GainNode;
  /** Positional AI engine voices. */
  ai: GainNode;
  /** Tyres, surfaces, wind, scrapes. */
  tyre: GainNode;
  /** Crowd, rain, birds. */
  amb: GainNode;
  /** Impacts, pit sounds. */
  sfx: GainNode;
  /** Beeps, chimes, radio. */
  ui: GainNode;
}

/** Everything a layer needs; built once in AudioManager.init(). */
export interface AudioCore {
  ctx: AudioContext;
  noise: NoiseBank;
  bus: Buses;
}

/** Smooth AudioParam update that is cheap to call every frame. */
export function ramp(param: AudioParam, target: number, now: number, tc: number) {
  param.setTargetAtTime(target, now, tc);
}
