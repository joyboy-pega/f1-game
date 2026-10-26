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
  /** False if track limits or a chicane cut occurred during this lap (PLAN-v3 §8 R1). */
  lapValid: boolean;
  /** True if an infraction in the final sector carries over to invalidate the next lap. */
  nextLapInvalid: boolean;
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

/** Per-car AI memory. Owned by sim/ai.ts. */
export interface AIBrain {
  lane: number; // legacy: desired lateral offset from centreline (unused by the racing-line driver)
  targetSpeed: number;
  noisePhase: number;
  /** Seeded random source (deterministic per race seed). */
  rng: () => number;
  /** Lateral shift away from the racing line (overtake / defend / mistakes), smoothed. */
  shift: number;
  passSide: -1 | 0 | 1;
  passStart: number;
  decisionTimer: number;
  defendUntil: number;
  defendCooldown: number;
  defendShift: number;
  /** Active driver error: 0 none, 1 lock-up (late braking), 2 running wide. */
  mistakeKind: 0 | 1 | 2;
  mistakeUntil: number;
  mistakeShift: number;
  wasBraking: boolean;
  ersOn: boolean;
  stuckTime: number;
  prevOffsetTarget: number;
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
  /** Pose before the last fixed step; renderPose() blends it with `phys` for smooth drawing (see interp.ts). */
  prevX: number;
  prevY: number;
  prevA: number;
  ctrl: ControlState;
  compound: TyreCompound;
  timing: CarTiming;
  ai: AIBrain | null;
  surface: SurfaceInfo;
  /** Signed lateral offset from the centreline (+ = along track normal). */
  lateral: number;
  inPit: boolean;
  /** DRS may be opened (within 1 s of car ahead at detection, zone active). Set by sim. */
  drsAvailable: boolean;
  /** Player/AI asked to pit at the next pit entry. */
  pitRequest: boolean;
  nextCompound: TyreCompound;
  /** 1-based race position (updated every step). */
  position: number;
  stats: CarStats;
  /** Pit stop state machine; null when on track. */
  pit: PitState | null;
  /** 0..1 accumulated front-end damage from collisions (settings.damage). */
  damage: number;
  /** Current fuel mass in kg (0..110 kg, burns down over the race). */
  fuelKg: number;
  /** Race time of the most recent collision (for track-limit grace). */
  lastCollisionTime: number;
  /** Slipstream strength applied this step (0..1). */
  draft: number;
  /** Track-limit incident tracking. */
  limits: LimitsState;
  /** DRS detection bookkeeping. */
  drsDetect: { lastG: number; zoneActive: number };
  /** Seconds spent off the asphalt (outside the pit lane); diagnostics and tests. */
  offTrackTime: number;
}

export type PitStage = 'enter' | 'approach' | 'service' | 'depart' | 'exit';

export interface PitState {
  stage: PitStage;
  /** Spline index of the car's box. */
  boxIdx: number;
  /** Lateral offset (signed, world) when the car was taken over at the pit entry. */
  entryLateral: number;
  /** Seconds left in the stationary service. */
  serviceLeft: number;
  /** Total stationary time of this stop. */
  serviceTime: number;
  /** Compound that will be fitted. */
  fit: TyreCompound;
  /** Time spent stationary in the box (for the event). */
  stationary: number;
  /** Race time at pit entry. */
  enteredAt: number;
}

export interface LimitsState {
  offTime: number;
  counted: boolean;
  /** Corner id in which the last warning was issued (-1 none). */
  lastCornerId: number;
  exempt: boolean;
  /** Arc position when leaving track (for chicane cut detection). */
  cutStartS: number;
  cutStartTime: number;
}
