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

// AI Rival Driver Configurations
export interface AIConfig {
  pace: number;
  cornerBrake: number;
  accel: number;
  name: string;
  color: string;
  accent: string;
  rim: string;
}

export const AI_CONFIGS: AIConfig[] = [
  { pace: 1.00, cornerBrake: 0.72, accel: 0.97, name: 'APEX #1',     color: '#1E41B0', accent: '#FFD700', rim: '#C0C0C0' },
  { pace: 0.97, cornerBrake: 0.75, accel: 0.94, name: 'NOVA #44',    color: '#00D2BE', accent: '#000000', rim: '#00D2BE' },
  { pace: 0.95, cornerBrake: 0.68, accel: 1.00, name: 'VELOCITY #4', color: '#FF8700', accent: '#0072BB', rim: '#1E1E1E' },
  { pace: 0.98, cornerBrake: 0.70, accel: 0.96, name: 'TITAN #16',   color: '#DC0000', accent: '#FFFFFF', rim: '#DC0000' },
  { pace: 0.93, cornerBrake: 0.73, accel: 0.92, name: 'PHANTOM #14', color: '#006F62', accent: '#CEDC00', rim: '#1E1E1E' },
  { pace: 0.91, cornerBrake: 0.65, accel: 0.90, name: 'ORBIT #63',   color: '#00A3E0', accent: '#002F6C', rim: '#C0C0C0' },
  { pace: 0.88, cornerBrake: 0.62, accel: 0.88, name: 'PULSE #81',   color: '#FD4BC7', accent: '#0090FF', rim: '#FD4BC7' },
];

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
