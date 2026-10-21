import type { CameraViewMode, TimeOfDay, WeatherType } from '../constants';

/**
 * Plain-data snapshot the audio engine consumes each frame. AudioBridge (or the
 * /dev/audio page) fills it; nothing in lib/game/audio/** reads the sim directly,
 * which keeps every layer testable and tunable in isolation.
 */
export interface PlayerFrame {
  /** Sim-space position (world x,y -> audio x,z) and heading. */
  x: number;
  y: number;
  a: number;
  vf: number;
  vl: number;
  steer: number;
  rpm: number;
  gear: number | string;
  kmh: number;
  throttle: number;
  brake: number;
  boosting: boolean;
  driftIntensity: number;
  wheelSlipFront: number;
  wheelSlipRear: number;
  /** Spline index of the player car. */
  idx: number;
  /** Signed lateral offset from the centreline (sim units). */
  lateral: number;
  /** Smoothed spline curvature at idx. */
  curvature: number;
  onTrack: boolean;
  gravel: boolean;
  sparks: number;
  inPit: boolean;
}

export interface AIFrame {
  id: number;
  x: number;
  y: number;
  rpm: number;
  throttle: number;
  kmh: number;
}

export interface AudioFrame {
  dt: number;
  paused: boolean;
  /** Results screen is up: engines fade out. */
  results: boolean;
  /** Race phase: 'grid' | 'lights' | 'racing' | 'finished' ... */
  phase: string;
  camera: CameraViewMode;
  weather: WeatherType;
  timeOfDay: TimeOfDay;
  player: PlayerFrame;
  ai: AIFrame[];
  aiCount: number;
}

export function createPlayerFrame(): PlayerFrame {
  return {
    x: 0,
    y: 0,
    a: 0,
    vf: 0,
    vl: 0,
    steer: 0,
    rpm: 4000,
    gear: 'N',
    kmh: 0,
    throttle: 0,
    brake: 0,
    boosting: false,
    driftIntensity: 0,
    wheelSlipFront: 0,
    wheelSlipRear: 0,
    idx: 0,
    lateral: 0,
    curvature: 0,
    onTrack: true,
    gravel: false,
    sparks: 0,
    inPit: false,
  };
}

export function createAudioFrame(maxAi = 24): AudioFrame {
  const ai: AIFrame[] = [];
  for (let i = 0; i < maxAi; i++) ai.push({ id: -1, x: 0, y: 0, rpm: 4000, throttle: 0, kmh: 0 });
  return {
    dt: 1 / 60,
    paused: false,
    results: false,
    phase: 'racing',
    camera: 'chase',
    weather: 'sunny',
    timeOfDay: 'day',
    player: createPlayerFrame(),
    ai,
    aiCount: 0,
  };
}
