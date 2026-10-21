import type { AIConfig, Livery, TyreCompound } from '../constants';
import type { ControlState } from '../controls';
import type { CarPhysicsState } from '../physics';

/** Timing checkpoints per lap — resolution of gaps and live delta (~23 m apart). */
export const CHECKPOINTS_PER_LAP = 200;
/** Hard cap on laps tracked by checkpoint arrays. */
export const MAX_TRACKED_LAPS = 60;

export interface CarTiming {
  /** Unwrapped arc-length distance since the start line. Negative on the grid. */
  progress: number;
  /** Arc-length position on the current lap (0..TRACK_LENGTH), last step. */
  lastS: number;
  /** Laps completed. -1 until the car first crosses the line after the start. */
  lapsCompleted: number;
  /** Race time at which the current lap started; null while on an untimed out-lap. */
  lapStartTime: number | null;
  lapTimes: number[];
  lastLap: number | null;
  bestLap: number | null;
  currentSector: number;
  sectorStartTime: number | null;
  /** Sector times of the lap in progress. */
  sectorTimes: (number | null)[];
  /** Sector times of the most recently completed lap. */
  lastSectorTimes: (number | null)[];
  bestSectors: (number | null)[];
  /** Race time when the car passed global checkpoint g (index offset by one lap so the grid lap is 0..CP-1). NaN = not yet. */
  checkpointTimes: Float64Array;
  /** Time-into-lap at each checkpoint for the lap in progress / personal best lap. */
  currentLapTrace: Float32Array;
  bestLapTrace: Float32Array | null;
  /** Latest global checkpoint passed (-1 = none). */
  lastCheckpoint: number;
  finished: boolean;
  finishTime: number | null;
  penaltySec: number;
  trackLimitWarnings: number;
  pitStops: number;
}

export interface DriverInfo {
  name: string;
  code: string;
  team: string;
  livery: Livery;
}

export interface SurfaceInfo {
  onTrack: boolean;
  gravel: boolean;
  /** Distance from the centreline (unsigned). */
  dist: number;
}

/** Per-car AI memory. Owned by sim/ai.ts — extend freely there. */
export interface AIBrain {
  lane: number; // desired lateral offset from centreline (world units)
  targetSpeed: number;
  noisePhase: number;
  [key: string]: unknown;
}

export interface CarStats {
  topSpeedKmh: number;
  drsUses: number;
  ersUses: number;
  overtakes: number;
}

export interface WorldCar {
  id: number;
  isPlayer: boolean;
  driver: DriverInfo;
  skill: AIConfig | null;
  phys: CarPhysicsState;
  ctrl: ControlState;
  compound: TyreCompound;
  timing: CarTiming;
  ai: AIBrain | null;
  surface: SurfaceInfo;
  /** Signed lateral offset from the centreline (+ = along track normal). */
  lateral: number;
  inPit: boolean;
  /** 1-based race position (updated every step). */
  position: number;
  stats: CarStats;
}
