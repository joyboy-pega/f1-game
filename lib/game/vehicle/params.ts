/**
 * Vehicle parameters, SI units (m, s, kg, N, rad, W). PLAN-v3 §5.
 * R3: every number says where it comes from. "approximate" = a public real-world ballpark (PLAN-v3 §11.1);
 * "tuned" = chosen in this repo to hit a §11 target and re-tuned in V2 against the probe; none of these is a measurement.
 */

export const GRAVITY = 9.81; // m/s²
export const AIR_DENSITY = 1.225; // kg/m³, ISA sea level (Buddh is ~240 m up: ~3 % thinner; ignored)

export interface CarParams {
  /** Car + driver, no fuel (§11.1 / 2022-25 minimum weight). */
  massKg: number;
  /** approximate; 2022-25 regulations cap wheelbase at 3.6 m. */
  wheelbaseM: number;
  /** Static share of weight on the front axle: approximate (rear-heavy, ~46 %). */
  frontWeightFraction: number;
  /** Centre of gravity height: approximate. */
  cgHeightM: number;
  /** Track (left-right wheel centre distance): approximate. */
  trackWidthM: number;
  /** Loaded tyre radius (rear), approximate. */
  wheelRadiusM: number;
  /** Yaw moment of inertia: approximate ballpark for a ~800 kg single-seater. */
  yawInertiaKgM2: number;
  /** Rolling resistance coefficient on total vertical load: approximate. */
  rollingResistance: number;
}

export const CAR: CarParams = {
  massKg: 798,
  wheelbaseM: 3.6,
  frontWeightFraction: 0.455,
  cgHeightM: 0.28,
  trackWidthM: 1.6,
  wheelRadiusM: 0.34,
  yawInertiaKgM2: 1100,
  rollingResistance: 0.015,
};

export interface AeroParams {
  /** Lift coefficient × reference area (downforce positive), m². Tuned: ~1.8 × weight at 250 km/h (§11.1 band 1.5-2.2). */
  clA: number;
  /** Drag coefficient × reference area, m². Tuned (1-D straight-line sim, vehicle.test.ts) for 322 km/h without DRS with the 560 kW engine (§11.1 band 315-330). */
  cdA: number;
  /** Share of downforce on the front axle: approximate (~45 %). */
  frontBalance: number;
  /** DRS open: drag × this (rear wing flap): tuned for ~330 km/h with DRS (§11.1 band 325-340; ~+8 km/h). */
  drsCdAScale: number;
  /** DRS open: downforce × this (mostly rear): tuned. */
  drsClAScale: number;
  /** Slipstream: at full draft (1.0) drag × (1 - this). Existing v2 behaviour carried over (reduces drag only). */
  draftDragReduction: number;
  /** Dirty air: at full effect (1.0) downforce × (1 - this). PLAN-v3 §5.2.5: up to -10 %. */
  dirtyAirDownforceLoss: number;
}

export const AERO: AeroParams = {
  clA: 4.8,
  cdA: 1.0,
  frontBalance: 0.45,
  drsCdAScale: 0.9,
  drsClAScale: 0.86,
  draftDragReduction: 0.12,
  dirtyAirDownforceLoss: 0.1,
};

export interface EngineParams {
  idleRpm: number;
  limiterRpm: number;
  peakPowerW: number;
  /** [rpm, fraction of peak power]: tuned shape with the peak near 11 500 rpm (§5.2.6). */
  powerCurve: [number, number][];
  /** Drivetrain efficiency engine -> wheels: approximate. */
  drivelineEfficiency: number;
  upshiftRpm: number;
  /** Downshift below this rpm under braking (keeps the engine in its window). */
  downshiftBrakingRpm: number;
  /** Downshift below this rpm off the brakes. */
  downshiftRpm: number;
  /** Torque cut during a shift, seconds (§5.2.6: 30-50 ms). */
  shiftTimeS: number;
  /** Top speed in each forward gear at the rev limiter, km/h: tuned so 8th tops out ~340 km/h (§5.2.6). */
  gearTopKmh: number[];
}

export const ENGINE: EngineParams = {
  idleRpm: 4000,
  limiterRpm: 15000,
  peakPowerW: 560_000, // approximate ICE share of a ~750 kW power unit
  powerCurve: [
    [4000, 0.3],
    [6000, 0.52],
    [8000, 0.74],
    [10000, 0.93],
    [11500, 1.0],
    [13000, 0.97],
    [14000, 0.92],
    [15000, 0.84],
  ],
  drivelineEfficiency: 0.95,
  upshiftRpm: 11800,
  downshiftBrakingRpm: 9000,
  downshiftRpm: 7500,
  shiftTimeS: 0.04,
  gearTopKmh: [110, 150, 190, 225, 255, 285, 312, 340],
};

export interface ErsParams {
  /** MGU-K deploy power while boosting, W (§5.2.6: up to 120 kW). */
  deployPowerW: number;
  /** Battery energy that may be deployed per lap, J (4 MJ, DRS-era rule). */
  deployPerLapJ: number;
  /** Energy that may be harvested per lap, J (2 MJ MGU-K, DRS-era rule). */
  harvestPerLapJ: number;
  /** Peak MGU-K harvest power, W (120 kW). */
  harvestPowerW: number;
  /** Battery state of charge window, J. */
  capacityJ: number;
}

export const ERS: ErsParams = {
  deployPowerW: 120_000,
  deployPerLapJ: 4_000_000,
  harvestPerLapJ: 2_000_000,
  harvestPowerW: 120_000,
  capacityJ: 4_000_000,
};
