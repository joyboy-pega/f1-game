import { TRACK_CONTROL_POINTS } from './trackPoints';

export const TW = 130;
export const HW = TW / 2; // 65
export const CAR_SCALE = 11.5;

// Build Catmull-Rom Track Spline
export const controlPoints: [number, number][] = [];
for (let i = 0; i < TRACK_CONTROL_POINTS.length; i += 2) {
  controlPoints.push([TRACK_CONTROL_POINTS[i], TRACK_CONTROL_POINTS[i + 1]]);
}

export const trackSplinePoints: [number, number][] = [];
(function buildSpline() {
  const n = controlPoints.length;
  for (let i = 0; i < n; i++) {
    const p0 = controlPoints[(i + n - 1) % n];
    const p1 = controlPoints[i];
    const p2 = controlPoints[(i + 1) % n];
    const p3 = controlPoints[(i + 2) % n];
    for (let s = 0; s < 2; s++) {
      const t = s / 2;
      const t2 = t * t;
      const t3 = t2 * t;
      trackSplinePoints.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
      ]);
    }
  }
})();

export const N = trackSplinePoints.length; // 1920

// Precompute Tangents & Normals
export const tangents: [number, number][] = [];
export const normals: [number, number][] = [];
for (let i = 0; i < N; i++) {
  const prev = trackSplinePoints[(i + N - 1) % N];
  const next = trackSplinePoints[(i + 1) % N];
  const tx = next[0] - prev[0];
  const ty = next[1] - prev[1];
  const len = Math.hypot(tx, ty) || 1;
  tangents.push([tx / len, ty / len]);
  normals.push([-ty / len, tx / len]);
}

// Curvature
export const trackCurvature = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const a = trackSplinePoints[(i + N - 1) % N];
  const b = trackSplinePoints[i];
  const c = trackSplinePoints[(i + 1) % N];
  const v1x = b[0] - a[0], v1y = b[1] - a[1];
  const v2x = c[0] - b[0], v2y = c[1] - b[1];
  const cross = Math.abs(v1x * v2y - v1y * v2x);
  trackCurvature[i] = cross / (Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) + 0.001);
}

export const smoothCurvature = new Float32Array(N);
const W2 = 12;
for (let i = 0; i < N; i++) {
  let s = 0;
  for (let k = -W2; k <= W2; k++) {
    s += trackCurvature[(i + k + N) % N];
  }
  smoothCurvature[i] = s / (W2 * 2 + 1);
}

// Minimap Projection Bounds
export const minimapBounds = (() => {
  let a = 1e9, b = -1e9, c = 1e9, d = -1e9;
  trackSplinePoints.forEach((p) => {
    a = Math.min(a, p[0]);
    b = Math.max(b, p[0]);
    c = Math.min(c, p[1]);
    d = Math.max(d, p[1]);
  });
  const targetW = 330;
  const targetH = 215;
  const padX = 26;
  const padY = 22;
  const s = Math.min((targetW - padX * 2) / (b - a), (targetH - padY * 2) / (d - c));
  const ox = targetW / 2 - ((a + b) / 2) * s;
  const oy = targetH / 2 - ((c + d) / 2) * s;
  return { s, ox, oy, w: targetW, h: targetH, minX: a, maxX: b, minY: c, maxY: d };
})();

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
export interface DrsZone {
  id: number;
  name: string;
  start: number;
  end: number;
  wraps: boolean;
}

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
  zones: [
    { id: 1, name: 'ZONE 1 · MAIN STRAIGHT', start: 1760, end: 80, wraps: true },
    { id: 2, name: 'ZONE 2 · BACK STRAIGHT', start: 330, end: 710, wraps: false },
  ] as DrsZone[],
};

// Controlled Braking & Brake Balance
export const BRAKE_CONFIG = {
  maxBrakeForce: 2150,
  brakeResponse: 8.5,
  brakeReleaseRate: 14.0,
  defaultBias: 0.56,
  minBias: 0.45,
  maxBias: 0.70,
  biasStep: 0.01,
  reverseMaxSpeed: -120,
  reverseAccel: 450,
  reverseDelay: 0.16,
  highSpeedAeroFactor: 0.35,
  lowSpeedCutoff: 1.5,
};

// 4-Tire Thermodynamics & Degradation
export const TIRE_CONFIG = {
  ambientTemperature: 28.0,
  optimalTireTemperature: 95.0,
  coldThresholdTemperature: 78.0,
  overheatThresholdTemperature: 112.0,
  maxTireTemperature: 145.0,
  minTireTemperature: 20.0,
  coldGripMultiplier: 0.78,
  overheatGripMultiplier: 0.72,
  minimumGripMultiplier: 0.60,
  temperatureGainRate: 1.35,
  temperatureCoolingRate: 0.15,
  tireWearRate: 0.00060,
  brakeHeatingScalar: 30.0,
  corneringHeatingScalar: 25.0,
  driftHeatingScalar: 38.0,
  wheelspinHeatingScalar: 26.0,
  offTrackHeatingBonus: 1.40,
  rainCoolingMultiplier: 2.2,
  snowCoolingMultiplier: 2.8,
  driftWearMultiplier: 2.6,
  lockupWearMultiplier: 2.2,
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

// Track arc length (world units) — used for timing, gaps and AI look-ahead
export const segmentLengths = new Float32Array(N);
export const cumulativeS = new Float32Array(N + 1);
for (let i = 0; i < N; i++) {
  const a = trackSplinePoints[i];
  const b = trackSplinePoints[(i + 1) % N];
  segmentLengths[i] = Math.hypot(b[0] - a[0], b[1] - a[1]);
  cumulativeS[i + 1] = cumulativeS[i] + segmentLengths[i];
}
export const TRACK_LENGTH = cumulativeS[N];

// Sector boundaries as spline indices (S1: [0,s1), S2: [s1,s2), S3: [s2,N))
export const SECTOR_BOUNDS: [number, number] = [280, 1130];

export type TyreCompound = 'soft' | 'medium' | 'hard' | 'inter' | 'wet';
export type GameMode = 'race' | 'timetrial' | 'practice';
export type Difficulty = 'rookie' | 'pro' | 'legend';
export type TimeOfDay = 'day' | 'sunset' | 'night';

export type WeatherType = 'sunny' | 'cloudy' | 'rain' | 'snow';
export type CameraViewMode = 'chase' | 'cockpit' | 'tcam' | 'hood';
export type VehicleModelType = 'f1' | 'street';

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

// Pit lane (shared contract: sim/pit.ts drives it, world/ visuals draw it).
// +normal points to the OUTSIDE of the circuit on the main straight.
export const PIT_LANE = {
  side: 1 as 1 | -1,
  entryIdx: 1790, // spline index where the pit lane splits from the track
  exitIdx: 100, // spline index where it rejoins (before Turn 1)
  boxStartIdx: 1815, // garages / pit boxes span this stretch
  boxEndIdx: 1905,
  laneOffset: HW + 46, // pit lane centre, units from the track centreline
  laneHalfWidth: 20,
  wallOffset: HW + 22, // pit wall between track and pit lane (cosmetic)
  garageOffset: HW + 96, // garage fronts, beyond the physics wall at HW + 82
  speedLimitKmh: 80,
};
