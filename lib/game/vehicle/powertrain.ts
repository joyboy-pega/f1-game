import { CAR, ENGINE, ERS, type EngineParams, type ErsParams } from './params';

/**
 * ICE + 8-speed gearbox + MGU-K (PLAN-v3 §5.2.6). Pure functions and one small mutable state object (no allocation per step).
 * rpm is derived from road speed (no clutch model above idle); a shift cuts torque for `shiftTimeS`.
 */

const KMH_TO_MS = 1 / 3.6;
const RPM_TO_RADS = (2 * Math.PI) / 60;

/** Overall ratio (engine revs per wheel rev) of each forward gear, derived from the per-gear top speed at the limiter. */
export const GEAR_RATIOS: number[] = ENGINE.gearTopKmh.map((kmh) => {
  const wheelRadS = (kmh * KMH_TO_MS) / CAR.wheelRadiusM;
  return (ENGINE.limiterRpm * RPM_TO_RADS) / wheelRadS;
});

export const GEARS = GEAR_RATIOS.length;

/** Engine power (W) at `rpm`, linearly interpolated along the power curve; 0 above the limiter, 0 at/below zero revs. */
export function enginePower(rpm: number, e: EngineParams = ENGINE): number {
  if (rpm <= 0 || rpm > e.limiterRpm) return 0;
  const c = e.powerCurve;
  if (rpm <= c[0][0]) return e.peakPowerW * c[0][1];
  for (let i = 1; i < c.length; i++) {
    if (rpm <= c[i][0]) {
      const f = (rpm - c[i - 1][0]) / (c[i][0] - c[i - 1][0]);
      return e.peakPowerW * (c[i - 1][1] + (c[i][1] - c[i - 1][1]) * f);
    }
  }
  return e.peakPowerW * c[c.length - 1][1];
}

/** Engine torque (N·m) = power / angular speed. */
export function engineTorque(rpm: number, e: EngineParams = ENGINE): number {
  const r = Math.max(rpm, e.idleRpm);
  return enginePower(r, e) / (r * RPM_TO_RADS);
}

/** Engine rpm for a road speed (m/s) in `gear` (1-based), never below idle. */
export function rpmFromSpeed(speed: number, gear: number, e: EngineParams = ENGINE): number {
  const ratio = GEAR_RATIOS[gear - 1];
  const rpm = (Math.abs(speed) / CAR.wheelRadiusM) * ratio / RPM_TO_RADS;
  return Math.max(e.idleRpm, rpm);
}

/** Road speed (m/s) at `rpm` in `gear`. */
export function speedFromRpm(rpm: number, gear: number): number {
  return (rpm * RPM_TO_RADS * CAR.wheelRadiusM) / GEAR_RATIOS[gear - 1];
}

export interface PowertrainState {
  gear: number;
  rpm: number;
  /** Seconds of torque cut left from the last shift. */
  shiftTimer: number;
  /** MGU-K battery energy, J. */
  ersCharge: number;
  /** Energy deployed / harvested since the lap counters were last reset, J (per-lap rules). */
  deployedThisLapJ: number;
  harvestedThisLapJ: number;
}

export function createPowertrain(): PowertrainState {
  return { gear: 1, rpm: ENGINE.idleRpm, shiftTimer: 0, ersCharge: ERS.capacityJ * 0.5, deployedThisLapJ: 0, harvestedThisLapJ: 0 };
}

/** Call when the car crosses the start/finish line. */
export function resetErsLapCounters(s: PowertrainState) {
  s.deployedThisLapJ = 0;
  s.harvestedThisLapJ = 0;
}

/**
 * Automatic gear choice with hysteresis (§5.2.6): up at `upshiftRpm`; down when rpm falls under `downshiftRpm`
 * (or `downshiftBrakingRpm` while braking), but only if the lower gear would then sit at least `HYSTERESIS_RPM` below the
 * upshift point, otherwise the box would shift straight back up and hunt (e.g. 2nd -> 1st at 90 km/h lands at 12 300 rpm).
 */
const HYSTERESIS_RPM = 500;

export function chooseGear(gear: number, speed: number, braking: boolean, e: EngineParams = ENGINE): number {
  const rpm = rpmFromSpeed(speed, gear, e);
  if (gear < GEARS && rpm > e.upshiftRpm) return gear + 1;
  if (gear > 1) {
    const low = braking ? e.downshiftBrakingRpm : e.downshiftRpm;
    if (rpm < low && rpmFromSpeed(speed, gear - 1, e) < e.upshiftRpm - HYSTERESIS_RPM) return gear - 1;
  }
  return gear;
}

/**
 * Drive force at the driven wheels (N) for the current state: ICE torque × throttle through the gearbox, torque cut while shifting,
 * plus the MGU-K when `boost` is set and the lap allowance and battery permit. Updates gear, rpm, shift timer and ERS energy.
 */
export function stepPowertrain(
  s: PowertrainState,
  speed: number,
  throttle: number,
  braking: boolean,
  boost: boolean,
  dt: number,
  e: EngineParams = ENGINE,
  ers: ErsParams = ERS
): number {
  const g = chooseGear(s.gear, speed, braking, e);
  if (g !== s.gear) {
    s.gear = g;
    s.shiftTimer = e.shiftTimeS;
  }
  s.rpm = Math.min(rpmFromSpeed(speed, s.gear, e), e.limiterRpm);
  if (s.shiftTimer > 0) s.shiftTimer = Math.max(0, s.shiftTimer - dt);

  let force = 0;
  if (s.shiftTimer <= 0 && throttle > 0) {
    const torque = engineTorque(s.rpm, e) * throttle;
    force = (torque * GEAR_RATIOS[s.gear - 1] * e.drivelineEfficiency) / CAR.wheelRadiusM;
  }
  // The rev limiter cuts the engine above the limit even when the road speed overshoots it.
  if (rpmFromSpeed(speed, s.gear, e) > e.limiterRpm) force = 0;

  if (boost && throttle > 0.5 && s.ersCharge > 0 && s.deployedThisLapJ < ers.deployPerLapJ && speed > 5) {
    const power = ers.deployPowerW;
    const energy = Math.min(power * dt, s.ersCharge, ers.deployPerLapJ - s.deployedThisLapJ);
    s.ersCharge -= energy;
    s.deployedThisLapJ += energy;
    force += (energy / dt) / speed;
  }
  return force;
}

/** Recover energy while braking: `brakePowerW` is the power the brakes dissipate; the MGU-K takes up to its limits. Returns J harvested. */
export function harvestErs(s: PowertrainState, brakePowerW: number, dt: number, ers: ErsParams = ERS): number {
  const room = Math.min(ers.capacityJ - s.ersCharge, ers.harvestPerLapJ - s.harvestedThisLapJ);
  if (room <= 0 || brakePowerW <= 0) return 0;
  const energy = Math.min(Math.min(brakePowerW, ers.harvestPowerW) * dt, room);
  s.ersCharge += energy;
  s.harvestedThisLapJ += energy;
  return energy;
}
