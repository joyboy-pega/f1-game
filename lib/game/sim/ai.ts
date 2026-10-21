import { N, HW, trackSplinePoints, normals, smoothCurvature, segmentLengths, type Difficulty } from '../constants';
import type { WorldCar, AIBrain } from './types';

// Baseline AI driver: pure-pursuit steering toward a lane offset on the centreline and a
// curvature-derived speed profile. It produces a ControlState so AI cars run through the
// exact same physics as the player. (WS-D: racing line, overtaking, DRS/ERS, pit strategy.)

const DIFFICULTY_PACE: Record<Difficulty, number> = { rookie: 0.86, pro: 0.94, legend: 1.0 };

/** Max cornering speed (world units/s) for radius R given the physics yaw model. */
function cornerSpeedForRadius(R: number): number {
  // Physics yaw rate at full lock: w = 2.6 * v_ratio / (1 + v/620). Solve v / w(v) = R for v > 220.
  const k = 2.6 * R;
  return ((-1 + Math.sqrt(1 + (4 * k) / 620)) * 620) / 2;
}

/** Per spline index: maximum sustainable speed through that point. */
export const cornerSpeed = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const curv = Math.max(1e-5, smoothCurvature[i]);
  const R = segmentLengths[i] / curv;
  cornerSpeed[i] = Math.min(1000, cornerSpeedForRadius(R) * 0.9);
}

const BRAKE_DECEL = 1500; // conservative usable deceleration (units/s^2)
const LOOKAHEAD_POINTS = 90;

export function createBrain(slot: number): AIBrain {
  return {
    lane: (slot % 2 === 0 ? -1 : 1) * HW * 0.25,
    targetSpeed: 0,
    noisePhase: slot * 1.7,
  };
}

export function driveAI(car: WorldCar, dt: number, difficulty: Difficulty, raceTime: number): void {
  const brain = car.ai;
  const skill = car.skill;
  if (!brain || !skill) return;
  const p = car.phys;
  const ctrl = car.ctrl;
  const v = Math.max(0, p.vf);

  // Lane drifts back toward the centre band over time
  brain.lane *= Math.exp(-0.15 * dt);

  // Pure pursuit target
  const look = Math.max(4, Math.round((60 + v * 0.28) / 24));
  const ti = (p.idx + look) % N;
  const tp = trackSplinePoints[ti];
  const tx = tp[0] + normals[ti][0] * brain.lane;
  const ty = tp[1] + normals[ti][1] * brain.lane;
  const desired = Math.atan2(ty - p.y, tx - p.x);
  let diff = desired - p.a;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  ctrl.steer = Math.max(-1, Math.min(1, diff * 3.2));
  ctrl.analogSteer = true;

  // Speed profile: min over look-ahead of sqrt(vc^2 + 2 a d)
  const pace = DIFFICULTY_PACE[difficulty] * skill.pace;
  let target = 1000;
  let d = 0;
  for (let k = 0; k < LOOKAHEAD_POINTS; k++) {
    const i = (p.idx + k) % N;
    const vc = cornerSpeed[i] * pace * (1.06 - skill.cornerBrake * 0.12);
    const allowed = Math.sqrt(vc * vc + 2 * BRAKE_DECEL * d);
    if (allowed < target) target = allowed;
    d += segmentLengths[i];
  }
  // Small human-like variation
  target *= 1 + (1 - skill.consistency) * 0.06 * Math.sin(raceTime * 0.7 + brain.noisePhase);
  brain.targetSpeed = target;

  if (v > target + 8) {
    ctrl.throttle = 0;
    ctrl.brake = Math.min(1, (v - target) / 70);
  } else {
    ctrl.brake = 0;
    ctrl.throttle = Math.min(1, (target - v) / 40 + 0.35) * skill.accel;
  }
  ctrl.handbrake = false;
  ctrl.ersBoost = false;
  ctrl.drsToggleRequested = false;
}
