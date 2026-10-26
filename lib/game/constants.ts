// Car / physics configuration. Track geometry and metadata live in lib/game/track (PLAN-v3 T1); the active track is
// `track.current` from '@/lib/game/track'.

import { COLLISION_OFFSETS_UNSCALED, COLLISION_RADIUS_UNSCALED } from '../../components/game/car/dimensions';

export const TW = 130; // track width (world units); T2 replaces it with per-index widths
export const HW = TW / 2; // 65
export const CAR_SCALE = 14.5; // ~5.6 m long, ~2.0 m wide in world units (PLAN-v3 §5.3 V4)

// Vehicle Drift Config
export const DRIFT_CONFIG = {
  normalGrip: 6.2,
  driftGrip: 1.85,
  driftThresholdSpeed: 175,
  highSpeedThreshold: 340,
  driftAngleLimit: 0.62,
  driftRecoveryRate: 5.6,
  counterSteerBonus: 4.5,
  steeringSensitivity: 1.0,
  lateralDamping: 0.988,
  handbrakeImpulse: 95,
  naturalSlideImpulse: 55,
  oversteerYawRate: 0.95,
  smokeThreshold: 0.14,
};

// Energy Recovery System (ERS)
export const ERS_CONFIG = {
  maxERSCharge: 100,
  initialERSCharge: 100,
  ersDrainRate: 20.0,
  ersRechargeRate: 4.5,
  ersBrakeRecovery: 16.0,
  ersCoastRecovery: 7.5,
  ersMinActivationCharge: 5.0,
  boostAccelerationMultiplier: 1.48,
  boostAccelerationBonus: 360,
  boostTopSpeedBonus: 60,
  boostTransitionRate: 14.0,
};

// Drag Reduction System (DRS)
export const DRS_CONFIG = {
  drsEnabled: true,
  requireDrsZones: true,
  dragNormal: 0.13,
  dragDRS: 0.042,
  drsAccelerationBonus: 200,
  maxSpeedNormal: 900,
  maxSpeedDRS: 995,
  minActivationSpeed: 175,
  flapClosedAngle: 25 * (Math.PI / 180),
  flapOpenAngle: -3 * (Math.PI / 180),
  flapTransitionSpeed: 16.0,
  /** Race rules: DRS is enabled once a car has completed this many laps (lap 2 onwards). */
  enabledAfterLaps: 1,
  /** A car within this time gap of the car ahead at a detection point gets DRS for that zone. */
  detectionGapSec: 1.0,
};

// Controlled Braking & Brake Balance: high-speed downforce bite tapering down to realistic mechanical grip
export const BRAKE_CONFIG = {
  maxBrakeForce: 2150,
  brakeResponse: 6.2,
  brakeReleaseRate: 12.0,
  defaultBias: 0.56,
  minBias: 0.45,
  maxBias: 0.70,
  biasStep: 0.01,
  reverseMaxSpeed: -120,
  reverseAccel: 380,
  reverseDelay: 0.28,
  highSpeedAeroFactor: 0.35,
  lowSpeedCutoff: 1.5,
};

// 4-Tire Thermodynamics & Degradation
// Thermal model (deg C per second): heat in from cornering / braking / wheelspin / drift,
// heat out proportional to (temp - ambient) with a speed-dependent airflow term.
// Tuned so tyres sit ~85-105 C when pushing and cool ~1-3 C/s when coasting (audit G6).
export const TIRE_CONFIG = {
  ambientTemperature: 28.0,
  optimalTireTemperature: 95.0,
  coldThresholdTemperature: 78.0,
  overheatThresholdTemperature: 112.0,
  maxTireTemperature: 145.0,
  minTireTemperature: 20.0,
  coldGripMultiplier: 0.72,
  overheatGripMultiplier: 0.72,
  minimumGripMultiplier: 0.5,
  /** Max fraction of grip lost to wear (at 100 % worn); loss = wearGripLoss * wear^wearGripExponent. */
  wearGripLoss: 0.3,
  wearGripExponent: 1.8,
  startTemperature: 72.0,
  /** Cooling coefficient (1/s): idle value plus airflow part reached at coolingFullSpeed. */
  coolBase: 0.022,
  coolAir: 0.022,
  coolingFullSpeed: 600,
  heatCorner: 5.0,
  heatBrake: 10.0,
  heatRolling: 0.6,
  heatWheelspin: 4.0,
  heatDrift: 4.0,
  /** Base wear fraction per second at stress 1.0 for the baseline (soft) compound. */
  tireWearRate: 0.0040,
  rainCoolingMultiplier: 2.2,
  snowCoolingMultiplier: 2.8,
  driftWearMultiplier: 1.5,
  lockupWearMultiplier: 2.2,
  offTrackHeatingBonus: 1.40,
};

export type WetClass = 'slick' | 'inter' | 'wet';

export interface CompoundConfig {
  label: string;
  /** Peak dry grip multiplier. */
  baseGrip: number;
  /** Wear rate relative to the soft. */
  wearRate: number;
  /** Grip is full inside this window (deg C). */
  tempWindow: [number, number];
  /** Multiplier on heat generation (warm-up speed). */
  warmup: number;
  /** Extra heat / wear when run on a dry track (inters & wets overheat). */
  dryHeatMul: number;
  dryWearMul: number;
  wetClass: WetClass;
}

export const TYRE_COMPOUNDS: Record<TyreCompound, CompoundConfig> = {
  soft: { label: 'SOFT', baseGrip: 1.0, wearRate: 1.0, tempWindow: [86, 108], warmup: 1.1, dryHeatMul: 1, dryWearMul: 1, wetClass: 'slick' },
  medium: { label: 'MEDIUM', baseGrip: 0.975, wearRate: 0.62, tempWindow: [84, 106], warmup: 1.0, dryHeatMul: 1, dryWearMul: 1, wetClass: 'slick' },
  hard: { label: 'HARD', baseGrip: 0.95, wearRate: 0.4, tempWindow: [82, 104], warmup: 0.9, dryHeatMul: 1, dryWearMul: 1, wetClass: 'slick' },
  inter: { label: 'INTER', baseGrip: 0.9, wearRate: 0.6, tempWindow: [68, 90], warmup: 1.0, dryHeatMul: 1.9, dryWearMul: 3.5, wetClass: 'inter' },
  wet: { label: 'WET', baseGrip: 0.86, wearRate: 0.5, tempWindow: [58, 80], warmup: 1.0, dryHeatMul: 2.6, dryWearMul: 5.0, wetClass: 'wet' },
};

/** Track wetness (0 dry .. 1 flooded) implied by each weather type. 'rain' = light/medium rain. */
export const WEATHER_WETNESS: Record<'sunny' | 'cloudy' | 'rain' | 'snow', number> = {
  sunny: 0,
  cloudy: 0,
  rain: 0.55,
  snow: 0.5,
};

// Driver roster (fictional teams & drivers). `skill` feeds the AI controller.
export interface AIConfig {
  pace: number; // 0..1+ straight-line & cornering commitment
  cornerBrake: number; // how conservative into corners (higher = earlier braking)
  accel: number; // throttle application aggressiveness
  consistency: number; // 0..1, lower = more lap-to-lap noise and mistakes
  aggression: number; // 0..1, willingness to attempt overtakes / defend
}

export interface Livery {
  body: string;
  accent: string;
  rim: string;
  number: number;
}

export interface DriverProfile {
  id: string;
  name: string;
  code: string; // 3-letter timing code
  team: string;
  livery: Livery;
  skill: AIConfig;
}

export const DRIVER_ROSTER: DriverProfile[] = [
  { id: 'apx', name: 'Rhys Calder', code: 'CAL', team: 'Apex Dynamics', livery: { body: '#1E41B0', accent: '#FFD700', rim: '#C0C0C0', number: 1 }, skill: { pace: 1.0, cornerBrake: 0.72, accel: 0.97, consistency: 0.95, aggression: 0.8 } },
  { id: 'nov', name: 'Mateo Varga', code: 'VAR', team: 'Nova Racing', livery: { body: '#00D2BE', accent: '#111111', rim: '#00D2BE', number: 44 }, skill: { pace: 0.98, cornerBrake: 0.75, accel: 0.94, consistency: 0.93, aggression: 0.6 } },
  { id: 'vel', name: 'Kenji Arata', code: 'ARA', team: 'Velocity GP', livery: { body: '#FF8700', accent: '#0072BB', rim: '#1E1E1E', number: 4 }, skill: { pace: 0.97, cornerBrake: 0.68, accel: 1.0, consistency: 0.9, aggression: 0.85 } },
  { id: 'tit', name: 'Lucien Moreau', code: 'MOR', team: 'Titan Corsa', livery: { body: '#DC0000', accent: '#FFFFFF', rim: '#DC0000', number: 16 }, skill: { pace: 0.975, cornerBrake: 0.7, accel: 0.96, consistency: 0.88, aggression: 0.75 } },
  { id: 'pha', name: 'Sofia Lindqvist', code: 'LIN', team: 'Phantom F1', livery: { body: '#006F62', accent: '#CEDC00', rim: '#1E1E1E', number: 14 }, skill: { pace: 0.955, cornerBrake: 0.73, accel: 0.92, consistency: 0.92, aggression: 0.5 } },
  { id: 'orb', name: 'Dev Malhotra', code: 'MAL', team: 'Orbit Motorsport', livery: { body: '#00A3E0', accent: '#002F6C', rim: '#C0C0C0', number: 63 }, skill: { pace: 0.95, cornerBrake: 0.65, accel: 0.9, consistency: 0.86, aggression: 0.65 } },
  { id: 'pul', name: 'Oscar Hale', code: 'HAL', team: 'Pulse Racing', livery: { body: '#FD4BC7', accent: '#0090FF', rim: '#FD4BC7', number: 81 }, skill: { pace: 0.94, cornerBrake: 0.62, accel: 0.88, consistency: 0.84, aggression: 0.7 } },
  { id: 'ion', name: 'Yuki Tanabe', code: 'TAN', team: 'Ion Racing', livery: { body: '#F5F5F5', accent: '#E10600', rim: '#111111', number: 22 }, skill: { pace: 0.935, cornerBrake: 0.7, accel: 0.9, consistency: 0.85, aggression: 0.55 } },
  { id: 'zen', name: 'Marco Bellini', code: 'BEL', team: 'Zenith Corse', livery: { body: '#6B21A8', accent: '#F59E0B', rim: '#F59E0B', number: 10 }, skill: { pace: 0.93, cornerBrake: 0.69, accel: 0.91, consistency: 0.83, aggression: 0.8 } },
  { id: 'hel', name: 'Aiden Brooks', code: 'BRO', team: 'Helix Works', livery: { body: '#14532D', accent: '#E5E7EB', rim: '#9CA3AF', number: 27 }, skill: { pace: 0.925, cornerBrake: 0.71, accel: 0.89, consistency: 0.82, aggression: 0.45 } },
  { id: 'sol', name: 'Priya Raman', code: 'RAM', team: 'Solaris', livery: { body: '#FACC15', accent: '#111827', rim: '#111827', number: 5 }, skill: { pace: 0.92, cornerBrake: 0.67, accel: 0.9, consistency: 0.8, aggression: 0.6 } },
];

export const MAX_AI_CARS = DRIVER_ROSTER.length;

export type TyreCompound = 'soft' | 'medium' | 'hard' | 'inter' | 'wet';
export type GameMode = 'race' | 'timetrial' | 'practice';
export type Difficulty = 'rookie' | 'pro' | 'legend';
export type TimeOfDay = 'day' | 'sunset' | 'night';

export type WeatherType = 'sunny' | 'cloudy' | 'rain' | 'snow';
export type CameraViewMode = 'chase' | 'cockpit' | 'tcam' | 'hood';
export type VehicleModelType = 'f1' | 'roadster' | 'pegasus';

export const WEATHER_NAMES: Record<WeatherType, string> = {
  sunny: 'SUNNY',
  cloudy: 'CLOUDY',
  rain: 'RAIN',
  snow: 'SNOW',
};

export const WEATHER_ICONS: Record<WeatherType, string> = {
  sunny: '☀️',
  cloudy: '☁️',
  rain: '🌧️',
  snow: '❄️',
};

// Car-to-car collision shape: three circles along the heading derived from dimensions.ts (PLAN-v3 §5.3 V4).
export const COLLISION_CONFIG = {
  offsets: COLLISION_OFFSETS_UNSCALED.map((k) => k * CAR_SCALE),
  radius: COLLISION_RADIUS_UNSCALED * CAR_SCALE,
  restitution: 0.2,
  friction: 0.25,
  yawGain: 0.0016,
  maxYawKick: 0.1,
  broadphase: 90,
  eventCooldown: 0.4,
  minEventSpeed: 12,
};

// Track limits: centre beyond this distance means all four wheels are over the white line.
export const TRACK_LIMITS = {
  warnDist: HW + 12,
  minDuration: 0.2,
  warningsBeforePenalty: 3,
  penaltySec: 5,
  collisionGrace: 2.5,
};
