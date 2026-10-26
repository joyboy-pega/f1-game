import type {
  WeatherType,
  CameraViewMode,
  VehicleModelType,
  TyreCompound,
  GameMode,
  Difficulty,
  TimeOfDay,
  Livery,
} from './constants';

export type { WeatherType, CameraViewMode, VehicleModelType, TyreCompound, GameMode, Difficulty, TimeOfDay, Livery };

/** Race session phase. `paused` is a separate flag so the phase survives pausing. */
export type RacePhase = 'grid' | 'lights' | 'racing' | 'finished';

export type ToastType = 'overtake' | 'lap' | 'bias' | 'tire' | 'drs' | 'penalty' | 'pit' | 'info' | 'fastest';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  subtitle?: string;
  duration: number; // seconds
}

export type SectorStatus = 'none' | 'personal' | 'overall' | 'slower'; // none = not set this lap

export interface TimingRow {
  position: number;
  carId: number;
  code: string;
  name: string;
  team: string;
  color: string;
  isPlayer: boolean;
  gapToLeader: string; // "LEADER", "+1.234", "+1 LAP"
  interval: string; // to car ahead
  lap: number;
  bestLap: number | null;
  lastLap: number | null;
  compound: TyreCompound;
  inPit: boolean;
  finished: boolean;
  penaltySec: number;
}

/** UI-rate (~10 Hz) snapshot of the player's race, written by GameLoop into the store. */
export interface HudSnapshot {
  lap: number; // current lap (1-based, clamped to totalLaps)
  totalLaps: number;
  position: number;
  carCount: number;
  raceTime: number;
  currentLapTime: number;
  lastLap: number | null;
  bestLap: number | null;
  deltaToBest: number | null; // live delta vs personal best at same track position
  sectors: { time: number | null; status: SectorStatus }[];
  currentSector: number; // 0..2
  order: TimingRow[];
  penaltySec: number;
  trackLimitWarnings: number;
  compound: TyreCompound;
  drsAvailable: boolean;
  boxRequested: boolean;
  nextCompound: TyreCompound;
  inPitLane: boolean;
  tyreWear: number; // 0..1 average
}

export const EMPTY_HUD: HudSnapshot = {
  lap: 1,
  totalLaps: 5,
  position: 1,
  carCount: 1,
  raceTime: 0,
  currentLapTime: 0,
  lastLap: null,
  bestLap: null,
  deltaToBest: null,
  sectors: [
    { time: null, status: 'none' },
    { time: null, status: 'none' },
    { time: null, status: 'none' },
  ],
  currentSector: 0,
  order: [],
  penaltySec: 0,
  trackLimitWarnings: 0,
  compound: 'soft',
  drsAvailable: false,
  boxRequested: false,
  nextCompound: 'medium',
  inPitLane: false,
  tyreWear: 0,
};

export interface ClassificationRow {
  position: number;
  carId: number;
  code: string;
  name: string;
  team: string;
  color: string;
  isPlayer: boolean;
  totalTime: number | null; // null = not finished (lapped / DNF)
  gapText: string;
  bestLap: number | null;
  laps: number;
  pitStops: number;
  penaltySec: number;
}

export interface RaceResults {
  mode: GameMode;
  classification: ClassificationRow[];
  playerPosition: number;
  playerLapTimes: number[];
  fastestLap: { carId: number; code: string; time: number } | null;
  topSpeed: number;
  overtakes: number;
  drsUses: number;
  ersUses: number;
  totalTime: number;
}

export interface Assists {
  racingLine: 'off' | 'corners' | 'full';
  brakingAssist: boolean;
  steeringAssist: boolean;
  tractionControl: boolean;
  abs?: boolean;
  stabilityControl?: boolean;
}

export interface InputSettings {
  keyboardSteerRate: number; // attack multiplier, default 1.0
  keyboardReturnRate: number; // return multiplier, default 1.0
  keyboardSteeringSpeed: number; // speed sensitivity factor, default 1.0
  gamepadDeadzone: number; // stick deadzone, default 0.08
  gamepadLinearity: number; // response curve exponent, default 1.4
  gamepadTriggerDeadzone: number; // trigger deadzone, default 0.05
  invertSteerAxis: boolean; // default false
  invertThrottleAxis: boolean; // default false
  invertBrakeAxis: boolean; // default false
  throttleAxis: number; // default -1 (use RT button)
  brakeAxis: number; // default -1 (use LT button)
  steerAxis: number; // default 0 (left stick X)
  customKeys: Record<string, string>; // action -> KeyboardEvent.code
  customButtons: Record<string, number>; // action -> gamepad button index
}

export const DEFAULT_INPUT_SETTINGS: InputSettings = {
  keyboardSteerRate: 1.0,
  keyboardReturnRate: 1.0,
  keyboardSteeringSpeed: 1.0,
  gamepadDeadzone: 0.08,
  gamepadLinearity: 1.4,
  gamepadTriggerDeadzone: 0.05,
  invertSteerAxis: false,
  invertThrottleAxis: false,
  invertBrakeAxis: false,
  throttleAxis: -1,
  brakeAxis: -1,
  steerAxis: 0,
  customKeys: {},
  customButtons: {},
};

export type QualityChoice = 'AUTO' | 'LOW' | 'MEDIUM' | 'HIGH';

export interface GameSettings {
  /** Circuit id (lib/game/track registry). */
  trackId: string;
  mode: GameMode;
  totalLaps: number;
  aiCount: number;
  difficulty: Difficulty;
  gridPosition: number; // 1-based
  weather: WeatherType;
  timeOfDay: TimeOfDay;
  carModel: VehicleModelType;
  cameraView: CameraViewMode;
  startCompound: TyreCompound;
  driverName: string;
  driverCode: string;
  livery: Livery;
  assists: Assists;
  input: InputSettings;
  damage: boolean;
  audioEnabled: boolean;
  volume: number;
  steeringSensitivity: number;
  brakeForce: number;
  tireWearRate: number;
  quality: QualityChoice;
  showTelemetry: boolean;
  showMinimap: boolean;
  showGhost: boolean;
  qualifyingFormat?: 'oneshot' | 'short';
  qualifyingGrid?: string[];
}

export const DEFAULT_SETTINGS: GameSettings = {
  trackId: 'buddh',
  mode: 'race',
  totalLaps: 5,
  aiCount: 9,
  difficulty: 'pro',
  gridPosition: 10,
  qualifyingFormat: 'oneshot',
  weather: 'sunny',
  timeOfDay: 'day',
  carModel: 'f1',
  cameraView: 'chase',
  startCompound: 'soft',
  driverName: 'You',
  driverCode: 'YOU',
  livery: { body: '#e10600', accent: '#121212', rim: '#c0c0c0', number: 7 },
  assists: {
    racingLine: 'corners',
    brakingAssist: false,
    steeringAssist: false,
    tractionControl: true,
    abs: true,
    stabilityControl: false,
  },
  input: DEFAULT_INPUT_SETTINGS,
  damage: true,
  audioEnabled: true,
  volume: 0.75,
  steeringSensitivity: 1.0,
  brakeForce: 1.0,
  tireWearRate: 1.0,
  quality: 'AUTO',
  showTelemetry: false,
  showMinimap: true,
  showGhost: true,
};

export function formatLapTime(seconds: number | null): string {
  if (seconds === null || isNaN(seconds) || seconds <= 0) return '--:--.---';
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}

export function formatDelta(seconds: number | null): string {
  if (seconds === null || isNaN(seconds)) return '--.---';
  const sign = seconds < 0 ? '-' : '+';
  return `${sign}${Math.abs(seconds).toFixed(3)}`;
}
