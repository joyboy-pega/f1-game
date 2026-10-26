/**
 * Vehicle limits derived from the vehicle model (PLAN-v3 §5.1).
 * AI, assists, pit controller, and racing line query this module instead of hard-coding vehicle numbers.
 * SI units (m/s, m/s²). Convert to/from world units with UNITS_PER_M.
 */

import { CAR, AERO, GRAVITY, AIR_DENSITY } from './params';
import { TYRE, tyreMu } from './tyre';
import { enginePower } from './powertrain';

/**
 * Maximum steady-state lateral acceleration (m/s²) at road speed `speedMs`.
 * Derived from tyre friction and aerodynamic downforce.
 */
export function maxLateralAccel(speedMs: number, grip = 1.0): number {
  const v = Math.max(0, speedMs);
  const q = 0.5 * AIR_DENSITY * v * v;
  const downforce = q * AERO.clA;
  const totalFz = CAR.massKg * GRAVITY + downforce;
  const fzPerTyre = totalFz / 4;
  const mu = tyreMu(TYRE, fzPerTyre, grip);
  // Lateral force capacity = mu * totalFz
  // ay = Fy / m
  return (mu * totalFz) / CAR.massKg;
}

/**
 * Maximum longitudinal acceleration (m/s²) at road speed `speedMs`.
 * Limited by engine power (high speed) and rear-axle traction (low speed).
 */
export function maxLongAccel(speedMs: number, grip = 1.0): number {
  const v = Math.max(1, speedMs);
  const q = 0.5 * AIR_DENSITY * v * v;
  const drag = q * AERO.cdA;

  // Power-limited drive force
  // Approximate engine power at top of gear for this speed
  const powerW = 560_000 * 0.95; // peak ICE power * driveline efficiency
  const powerForce = powerW / v;

  // Traction limit on rear axle
  const staticRearFz = CAR.massKg * GRAVITY * (1 - CAR.frontWeightFraction);
  const aeroRearFz = q * AERO.clA * (1 - AERO.frontBalance);
  const rearFz = staticRearFz + aeroRearFz;
  const tractionForce = tyreMu(TYRE, rearFz / 2, grip) * rearFz;

  const netDriveForce = Math.min(powerForce, tractionForce) - drag;
  return Math.max(0, netDriveForce / CAR.massKg);
}

/**
 * Maximum deceleration (m/s², positive value) under heavy braking at road speed `speedMs`.
 * Limited by tyre grip with aero downforce, plus aero drag.
 */
export function maxDecel(speedMs: number, grip = 1.0): number {
  const v = Math.max(0, speedMs);
  const q = 0.5 * AIR_DENSITY * v * v;
  const drag = q * AERO.cdA;
  const downforce = q * AERO.clA;
  const totalFz = CAR.massKg * GRAVITY + downforce;
  const fzPerTyre = totalFz / 4;
  const mu = tyreMu(TYRE, fzPerTyre, grip);

  // Peak tyre braking force + aero drag
  const maxBrakeTyreForce = mu * totalFz;
  return (maxBrakeTyreForce + drag) / CAR.massKg;
}

/**
 * Maximum cornering speed (m/s) for a corner of curvature `kappa` (1/m).
 * v = sqrt(ay_max / kappa).
 */
export function cornerSpeedForCurvature(kappa: number, grip = 1.0): number {
  const k = Math.abs(kappa);
  if (k < 1e-5) return 340 / 3.6; // straight line top speed

  // Solve v = sqrt(ay(v) / k) iteratively (2 passes is sufficient since aero grows monotonically)
  let v = Math.sqrt((TYRE.mu0 * GRAVITY * grip) / k);
  for (let iter = 0; iter < 3; iter++) {
    const ay = maxLateralAccel(v, grip);
    v = Math.sqrt(ay / k);
  }
  return Math.min(340 / 3.6, v);
}
