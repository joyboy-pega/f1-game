/**
 * Planar two-axle bicycle model with dynamic load transfer, Pacejka Magic Formula tyres,
 * friction ellipse, aerodynamics, and 8-speed powertrain (PLAN-v3 §5.2).
 *
 * All internals in SI units (m, s, kg, N, rad).
 * Pure functions, zero allocations in the step (R7).
 */

import { CAR, GRAVITY, AIR_DENSITY, AERO, AERO_LOW, AERO_HIGH, AERO_2026_STRAIGHT, AERO_2026_CORNER, type AeroParams } from './params';
import { TYRE, lateralForce, peakForce, ellipseLateral, rollingResistance } from './tyre';
import { aeroForces, createAeroForces, type AeroForces } from './aero';
import { stepPowertrain, type PowertrainState } from './powertrain';

export interface VehicleInputs {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1 (left) .. 1 (right)
  analogSteer: boolean;
  drs: boolean;
  ersBoost: boolean;
  steeringSensitivity: number;
}

export interface VehicleEnvironment {
  surfaceGrip: number; // 1.0 asphalt, 0.62 grass, 0.38 gravel
  tyreGrip: number; // product of temperature, wear, compound (1.0 = ideal)
  draft: number; // 0..1 slipstream
  dirtyAir: number; // 0..1 dirty air
  damage: number; // 0..1 front-wing damage
  inPit: boolean;
  fuelKg?: number; // 0..110 kg fuel mass (V3)
  aeroPreset?: 'low' | 'medium' | 'high';
  regulations?: '2022' | '2026';
  diffOnThrottle?: number; // 50..100% on-throttle diff lock
  rideHeightM?: number;    // 0.020..0.045m ride height
  tirePressureBar?: number;// 1.2..1.8 bar tyre pressure
}

export interface VehicleState {
  x: number; // m
  y: number; // m
  yaw: number; // rad
  vx: number; // m/s body forward
  vy: number; // m/s body lateral (positive = left)
  yawRate: number; // rad/s (positive = counter-clockwise)
  steer: number; // -1..1 filtered steer input
  prevAx: number; // m/s² body longitudinal acceleration (for load transfer)
  prevAy: number; // m/s² body lateral acceleration (inertial)
  powertrain: PowertrainState;
  drsOpen: boolean;
  isBoosting: boolean;
  brakeBias: number; // fraction on front axle (e.g. 0.56)
  wheelSlipFront: number; // 0..1
  wheelSlipRear: number; // 0..1
  isDrifting: boolean;
  driftIntensity: number;
  driftAngle: number;
  pitch: number;
  roll: number;
}

// Module-scope scratch objects to ensure zero allocations per step (R7)
const aeroScratch: AeroForces = createAeroForces();

/** Distance from CoG to front and rear axles (m). */
const A_COG_TO_FRONT = CAR.wheelbaseM * (1 - CAR.frontWeightFraction); // 1.962 m
const B_COG_TO_REAR = CAR.wheelbaseM * CAR.frontWeightFraction; // 1.638 m

/** Max brake deceleration force (N) on all wheels under ideal grip at speed (~38 kN ≈ 4.8 g). */
const MAX_BRAKE_FORCE_N = 38_000;

/**
 * Advance vehicle dynamics by one fixed timestep `dt` (s).
 * Mutates `state` in place; allocates zero objects.
 */
export function stepVehicle(
  s: VehicleState,
  input: VehicleInputs,
  env: VehicleEnvironment,
  dt: number
): void {
  const sens = Number.isFinite(input.steeringSensitivity) && input.steeringSensitivity > 0 ? input.steeringSensitivity : 1.0;

  // 1. Filtered steering input
  const steerRate = (input.analogSteer ? 22 : 9.5) * sens;
  s.steer += (input.steer - s.steer) * Math.min(1.0, steerRate * dt);

  // Speed-sensitive steering: larger lock in slow hairpins, tighter at speed to avoid tyre scrub
  const u = Math.max(0.5, Math.abs(s.vx));
  const steerCoeff = 2.6 + 2.0 * Math.max(0, 1 - u / 35);
  const maxSteerRad = Math.min(0.32, steerCoeff / Math.max(4.0, u));
  const delta = s.steer * maxSteerRad;

  // 2. Aerodynamic forces (SI units: N)
  let aeroParams: AeroParams = AERO;
  if (env.regulations === '2026') {
    const isStraight = Math.abs(s.steer) < 0.05 && u > 40;
    aeroParams = isStraight ? AERO_2026_STRAIGHT : AERO_2026_CORNER;
  } else if (env.aeroPreset === 'low') {
    aeroParams = AERO_LOW;
  } else if (env.aeroPreset === 'high') {
    aeroParams = AERO_HIGH;
  }
  aeroForces(s.vx, { drs: env.regulations === '2026' ? false : s.drsOpen, draft: env.draft, dirtyAir: env.dirtyAir, damage: env.damage }, aeroScratch, aeroParams);
  const rh = env.rideHeightM ?? 0.030;
  const groundEffectRatio = Math.pow(0.030 / Math.max(0.020, rh), 0.35);
  const downFront = aeroScratch.downFront * groundEffectRatio;
  const downRear = aeroScratch.downRear * groundEffectRatio;
  const aeroDrag = aeroScratch.drag;

  // 3. Dynamic vertical axle loads (with longitudinal load transfer)
  const fuelKg = env.fuelKg ?? 0;
  const totalMassKg = CAR.massKg + fuelKg;
  const staticFzFront = totalMassKg * GRAVITY * CAR.frontWeightFraction;
  const staticFzRear = totalMassKg * GRAVITY * (1 - CAR.frontWeightFraction);

  // Load transfer: dFz = m * ax * (h_cg / L)
  const dFzLong = totalMassKg * s.prevAx * (CAR.cgHeightM / CAR.wheelbaseM);
  const fzFront = Math.max(200, staticFzFront + downFront - dFzLong);
  const fzRear = Math.max(200, staticFzRear + downRear + dFzLong);

  // 4. Drive & braking forces
  const pressure = env.tirePressureBar ?? 1.50;
  const pressureGripMod = 1.0 - Math.abs(pressure - 1.50) * 0.06;
  const effectiveGrip = env.surfaceGrip * env.tyreGrip * pressureGripMod;
  const fxMaxFront = peakForce(TYRE, fzFront / 2, effectiveGrip) * 2;
  const fxMaxRear = peakForce(TYRE, fzRear / 2, effectiveGrip) * 2;

  let fxDrive = 0;
  if (input.throttle > 0 && input.brake < 0.05) {
    const rawDrive = stepPowertrain(s.powertrain, s.vx, input.throttle, false, input.ersBoost, dt);
    // Low-speed standing start traction limit (standing launch / clutch bite)
    const launchLimit = s.vx < 14.0 ? 0.8 + 0.2 * (Math.max(0, s.vx) / 14.0) : 1.0;
    // Traction budget: preserve lateral tyre grip when cornering to prevent unphysical snap spinout
    const cornerMargin = Math.max(0.65, 1.0 - Math.min(0.35, Math.abs(s.yawRate) * 0.35 + Math.abs(s.steer) * 0.25));
    const effFxMax = fxMaxRear * launchLimit * cornerMargin;
    fxDrive = Math.min(rawDrive, effFxMax);
    s.wheelSlipRear = effFxMax > 0 ? Math.max(0, Math.min(1.0, (rawDrive - effFxMax) / (effFxMax * 0.5))) : 0;
  } else {
    stepPowertrain(s.powertrain, s.vx, 0, input.brake > 0.05, false, dt);
    s.wheelSlipRear = 0;
  }

  // Braking demand (brakes oppose forward motion; cannot reverse the car)
  let fxBrakeFront = 0;
  let fxBrakeRear = 0;
  if (input.brake > 0 && s.vx > 0.01) {
    const maxStopForce = (s.vx * CAR.massKg) / dt;
    const totalBrakeDemand = Math.min(input.brake * MAX_BRAKE_FORCE_N, maxStopForce);
    // Dynamic brake migration: cornering shifts bias forward to protect rear lateral stability
    const cornerShift = Math.min(0.18, Math.abs(s.yawRate) * 0.12 + Math.abs(s.steer) * 0.08);
    const effBias = Math.min(0.72, s.brakeBias + cornerShift);
    const frontDemand = totalBrakeDemand * effBias;
    const rearDemand = totalBrakeDemand * (1 - effBias);

    fxBrakeFront = Math.min(frontDemand, fxMaxFront);
    // Trail-braking protection: leave rear friction capacity for lateral force when turning
    const rearCornerMargin = Math.max(0.45, 1.0 - Math.min(0.55, Math.abs(s.yawRate) * 0.45 + Math.abs(s.steer) * 0.35));
    fxBrakeRear = Math.min(rearDemand, fxMaxRear * rearCornerMargin);

    s.wheelSlipFront = fxMaxFront > 0 ? Math.max(0, Math.min(1.0, frontDemand / fxMaxFront - 0.9) * 5) : 0;
    if (s.wheelSlipRear === 0) {
      s.wheelSlipRear = fxMaxRear > 0 ? Math.max(0, Math.min(1.0, rearDemand / fxMaxRear - 0.9) * 5) : 0;
    }
  } else {
    s.wheelSlipFront = 0;
  }

  const fxFront = -fxBrakeFront;
  const fxRear = fxDrive - fxBrakeRear;

  // 5. Lateral tyre forces (Bicycle model)
  const alphaFront = delta - Math.atan2(s.vy + A_COG_TO_FRONT * s.yawRate, u);
  const alphaRear = -Math.atan2(s.vy - B_COG_TO_REAR * s.yawRate, u);

  const fyFrontPure = lateralForce(TYRE, alphaFront, fzFront / 2, effectiveGrip) * 2;
  const fyRearPure = lateralForce(TYRE, alphaRear, fzRear / 2, effectiveGrip) * 2;

  // Friction ellipse combined slip
  const fyFront = ellipseLateral(fyFrontPure, Math.abs(fxFront), fxMaxFront);
  const fyRear = ellipseLateral(fyRearPure, Math.abs(fxRear), fxMaxRear);

  // 6. Kinematic blending at low speed (vx < 3.5 m/s)
  const blend = Math.min(1.0, Math.max(0, (u - 0.8) / 2.7));
  const kinYawRate = (s.vx / CAR.wheelbaseM) * Math.tan(delta);
  const kinVy = (s.vx * B_COG_TO_REAR / CAR.wheelbaseM) * Math.tan(delta);

  // 7. Equations of motion (body frame)
  const cosDelta = Math.cos(delta);
  const sinDelta = Math.sin(delta);
  const rollRes = rollingResistance(fzFront + fzRear);

  const fxTotal = fxFront * cosDelta - fyFront * sinDelta + fxRear - aeroDrag - (s.vx > 0.5 ? rollRes : 0);
  const ax = fxTotal / totalMassKg + s.vy * s.yawRate;

  const fyTotal = fyFront * cosDelta + fxFront * sinDelta + fyRear;
  const ayInertial = fyTotal / totalMassKg;
  const dVy = ayInertial - s.vx * s.yawRate;

  // Yaw acceleration
  const diffLock = (env.diffOnThrottle ?? 70) / 100;
  const diffYawResist = (diffLock - 0.70) * 600 * s.yawRate * input.throttle;
  const torqueZ = A_COG_TO_FRONT * (fyFront * cosDelta + fxFront * sinDelta) - B_COG_TO_REAR * fyRear - diffYawResist;
  const aeroYawDamping = -0.5 * AIR_DENSITY * u * 45.0 * s.yawRate;
  const yawAcc = (torqueZ + aeroYawDamping) / CAR.yawInertiaKgM2;

  // 8. Integration (semi-implicit Euler)
  s.yawRate += yawAcc * dt;

  if (blend < 1.0) {
    s.yawRate = kinYawRate * (1 - blend) + s.yawRate * blend;
    s.vy = kinVy * (1 - blend) + s.vy * blend;
  } else {
    s.vy += dVy * dt;
  }

  s.yaw += s.yawRate * dt;
  s.vx += ax * dt;

  if (s.vx < 0.05 && input.brake > 0 && input.throttle === 0) {
    s.vx = 0;
    s.vy = 0;
    s.yawRate = 0;
  } else if (s.vx < 0.05 && input.throttle === 0 && input.brake === 0) {
    s.vx = 0;
    s.vy = 0;
    s.yawRate = 0;
  }

  s.prevAx = ax;
  s.prevAy = ayInertial;

  // 9. World position integration
  const cosYaw = Math.cos(s.yaw);
  const sinYaw = Math.sin(s.yaw);
  const vxWorld = s.vx * cosYaw - s.vy * sinYaw;
  const vyWorld = s.vx * sinYaw + s.vy * cosYaw;

  s.x += vxWorld * dt;
  s.y += vyWorld * dt;

  // 10. Attitude and drift metrics
  const bodySlip = Math.atan2(s.vy, Math.max(1.0, Math.abs(s.vx)));
  s.driftAngle = bodySlip;
  s.isDrifting = Math.abs(bodySlip) > 0.12 && u > 8.0;
  s.driftIntensity = Math.min(1.0, Math.max(0, (Math.abs(bodySlip) - 0.1) / 0.35));

  // Visual pitch & roll
  s.pitch = (input.brake * 0.035) - input.throttle * 0.02;
  s.roll = -(s.prevAy / GRAVITY) * 0.012;
}
