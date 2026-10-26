import {
  HW,
  DRIFT_CONFIG,
  ERS_CONFIG,
  DRS_CONFIG,
  BRAKE_CONFIG,
  TIRE_CONFIG,
  TYRE_COMPOUNDS,
  COLLISION_CONFIG,
  WeatherType,
  type TyreCompound,
} from './constants';
import { ControlState } from './controls';
import { inPitBand, isInDrsZone, track } from './track';
import { KMH_PER_UNIT, UNITS_PER_M } from './units';
import { dryMisuse, tempGrip, wearGrip, wetGripFactor, wetnessFor } from './sim/tyres';
import { stepVehicle, type VehicleState, type VehicleInputs, type VehicleEnvironment } from './vehicle/model';
import { createPowertrain } from './vehicle/powertrain';
import { ERS, GRAVITY } from './vehicle/params';

export interface SingleTireState {
  temp: number;
  wear: number;
  grip: number;
  slip: number;
  load: number;
}

export interface TiresState {
  fl: SingleTireState;
  fr: SingleTireState;
  rl: SingleTireState;
  rr: SingleTireState;
  avgTemp: number;
  avgWear: number;
  frontGrip: number;
  rearGrip: number;
  overallGrip: number;
}

export interface CarPhysicsState {
  x: number;
  y: number;
  a: number; // yaw angle in radians
  vx: number;
  vy: number;
  vf: number; // forward velocity
  vl: number; // lateral velocity
  steer: number;
  idx: number;
  ers: number;
  gear: number | string;
  rpm: number;
  kmh: number;
  pitch: number;
  roll: number;

  // Drift states
  isDrifting: boolean;
  driftIntensity: number;
  driftAngle: number;
  driftDir: number;
  driftDuration: number;
  driftScore: number;

  // DRS states
  drsOpen: boolean;
  drsFlapAngle: number;
  currentDrag: number;
  drsAccelBonus: number;
  currentMaxV: number;

  // ERS states
  ersCharge: number;
  isBoosting: boolean;
  boostBlend: number;
  boostAccelBonus: number;
  boostSpeedBonus: number;

  // Brake states
  brakeInput: number;
  brakeBias: number;
  actualBrakeForce: number;
  brakeFrontLoad: number;
  brakeRearLoad: number;
  isReversing: boolean;
  stoppedDuration: number;
  wheelSlipFront: number;
  wheelSlipRear: number;

  // Tires
  tires: TiresState;

  // Collision sparks
  guardRailSparks: number;

  // Internal vehicle dynamics state (V2 adapter)
  _veh?: VehicleState;
}


export function calculateTireTempGrip(temp: number, window: [number, number] = TYRE_COMPOUNDS.soft.tempWindow): number {
  return tempGrip(temp, window);
}

export function calculateTireWearGrip(wear: number): number {
  return wearGrip(wear);
}

/** Create a stationary car at spline index `idx`, offset `lateral` units along the track normal. */
export function createInitialCarState(idx: number = 0, lateral: number = 0): CarPhysicsState {
  const T = track.current;
  const i = ((Math.round(idx) % T.N) + T.N) % T.N;
  const i1 = (i + 1) % T.N;
  const initAngle = Math.atan2(T.py[i1] - T.py[i], T.px[i1] - T.px[i]);
  const initialTemp = TIRE_CONFIG.startTemperature;
  const initialWear = 0.0;
  const initGrip = calculateTireTempGrip(initialTemp) * calculateTireWearGrip(initialWear);

  return {
    x: T.px[i] + T.nx[i] * lateral,
    y: T.py[i] + T.ny[i] * lateral,
    a: initAngle,
    vx: 0,
    vy: 0,
    vf: 0,
    vl: 0,
    steer: 0,
    idx: i,
    ers: 1.0,
    gear: 'N',
    rpm: 4000,
    kmh: 0,
    pitch: 0,
    roll: 0,

    isDrifting: false,
    driftIntensity: 0,
    driftAngle: 0,
    driftDir: 0,
    driftDuration: 0,
    driftScore: 0,

    drsOpen: false,
    drsFlapAngle: DRS_CONFIG.flapClosedAngle,
    currentDrag: DRS_CONFIG.dragNormal,
    drsAccelBonus: 0,
    currentMaxV: DRS_CONFIG.maxSpeedNormal,

    ersCharge: 100,
    isBoosting: false,
    boostBlend: 0,
    boostAccelBonus: 0,
    boostSpeedBonus: 0,

    brakeInput: 0,
    brakeBias: BRAKE_CONFIG.defaultBias,
    actualBrakeForce: 0,
    brakeFrontLoad: BRAKE_CONFIG.defaultBias,
    brakeRearLoad: 1 - BRAKE_CONFIG.defaultBias,
    isReversing: false,
    stoppedDuration: 0,
    wheelSlipFront: 0,
    wheelSlipRear: 0,

    tires: {
      fl: { temp: initialTemp, wear: initialWear, grip: initGrip, slip: 0, load: 1 },
      fr: { temp: initialTemp, wear: initialWear, grip: initGrip, slip: 0, load: 1 },
      rl: { temp: initialTemp, wear: initialWear, grip: initGrip, slip: 0, load: 1 },
      rr: { temp: initialTemp, wear: initialWear, grip: initGrip, slip: 0, load: 1 },
      avgTemp: initialTemp,
      avgWear: initialWear,
      frontGrip: initGrip,
      rearGrip: initGrip,
      overallGrip: initGrip,
    },

    guardRailSparks: 0,
  };
}

/** New tyres: zero wear, cool (they warm up on track). */
/**
 * Fit a new set. With `compound`, the starting grip follows the temperature (cold new tyres are NOT at full grip);
 * without it the legacy 1.0 is kept for callers that do not know the compound.
 */
export function fitFreshTires(car: CarPhysicsState, startingTemp: number = TIRE_CONFIG.startTemperature, compound?: TyreCompound) {
  const cmp = compound ? TYRE_COMPOUNDS[compound] : null;
  const startGrip = cmp ? tempGrip(startingTemp, cmp.tempWindow) * wearGrip(0) * cmp.baseGrip : 1.0;
  const keys: (keyof Pick<TiresState, 'fl' | 'fr' | 'rl' | 'rr'>)[] = ['fl', 'fr', 'rl', 'rr'];
  for (const k of keys) {
    const t = car.tires[k];
    t.temp = startingTemp;
    t.wear = 0.0;
    t.grip = startGrip;
    t.slip = 0.0;
    t.load = 1.0;
  }
  car.tires.avgTemp = startingTemp;
  car.tires.avgWear = 0.0;
  car.tires.frontGrip = startGrip;
  car.tires.rearGrip = startGrip;
  car.tires.overallGrip = startGrip;
}

export function isCarInDrsZone(idx: number): boolean {
  return isInDrsZone(idx);
}

export function findNearestTrackPoint(x: number, y: number, currentIdx: number): [number, number] {
  const T = track.current;
  const N = T.N;
  const px = T.px;
  const py = T.py;
  let bi = currentIdx;
  let bd = 1e18;
  for (let k = -30; k <= 30; k++) {
    const i = (currentIdx + k + N) % N;
    const dx = x - px[i];
    const dy = y - py[i];
    const d = dx * dx + dy * dy;
    if (d < bd) {
      bd = d;
      bi = i;
    }
  }
  if (bd > 180 * 180) {
    for (let i = 0; i < N; i += 4) {
      const dx = x - px[i];
      const dy = y - py[i];
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
  }
  return [bi, Math.sqrt(bd)];
}

/** Optional per-step inputs from the sim (everything defaults to the legacy behaviour). */
export interface PhysicsExtras {
  compound?: TyreCompound;
  /** Track wetness 0..1; defaults from weather. */
  wetness?: number;
  /** DRS may be opened (rules computed by the sim). Undefined = always allowed. */
  drsAvailable?: boolean;
  /** 0..1 slipstream strength (reduces drag). */
  draft?: number;
  /** Car is driving through the pit lane. */
  inPit?: boolean;
  /** 0..1 front-end damage (reduces front grip). */
  frontDamage?: number;
  /** Fuel mass in kg (0..110 kg, burns over the race). */
  fuelKg?: number;
}

/**
 * Per-step inputs shared by the four tyres of a car. Module-scope scratch so the hot path allocates nothing (R7);
 * updateCarPhysics fills it right before the four updateSingleTire calls and nothing reads it afterwards.
 */
interface TireStepCtx {
  dt: number;
  cornerStress: number;
  brakeStress: number;
  rolling: number;
  driftSlipHeat: number;
  heatMul: number;
  offTrackHeatMult: number;
  ambientTemp: number;
  coolingRate: number;
  hotLimit: number;
  driftWear: number;
  lockup: number;
  onTrack: boolean;
  wearMul: number;
  tireWearMultiplier: number;
  wetRel: number;
  tempWindow: [number, number];
  baseGrip: number;
}

const tireCtx: TireStepCtx = {
  dt: 0, cornerStress: 0, brakeStress: 0, rolling: 0, driftSlipHeat: 0, heatMul: 1, offTrackHeatMult: 1, ambientTemp: 0,
  coolingRate: 0, hotLimit: 0, driftWear: 1, lockup: 1, onTrack: true, wearMul: 1, tireWearMultiplier: 1, wetRel: 1,
  tempWindow: [0, 0], baseGrip: 1,
};

function updateSingleTire(
  tire: SingleTireState,
  c: TireStepCtx,
  load: number,
  brakeHeat: number,
  driveStress: number,
  slipWork: number,
  damage: number
) {
  const heatIn =
    (2.6 * c.cornerStress * load + brakeHeat + c.rolling + driveStress * 2.5 + c.driftSlipHeat) *
    c.heatMul *
    c.offTrackHeatMult;
  const netHeat = heatIn - (tire.temp - c.ambientTemp) * c.coolingRate;
  tire.temp = Math.max(TIRE_CONFIG.minTireTemperature, Math.min(TIRE_CONFIG.maxTireTemperature, tire.temp + netHeat * c.dt));

  const overheat = tire.temp > c.hotLimit ? 1 + (tire.temp - c.hotLimit) / 30 : 1;
  const stress = 0.05 + 0.16 * c.cornerStress * load + 0.10 * c.brakeStress * load + 0.06 * driveStress + slipWork * 0.06;
  const wearDelta = stress * c.driftWear * c.lockup * overheat * (!c.onTrack ? 1.5 : 1.0) * c.wearMul * TIRE_CONFIG.tireWearRate * c.tireWearMultiplier * c.dt;
  tire.wear = Math.min(1.0, tire.wear + wearDelta);

  const targetGrip = Math.max(
    TIRE_CONFIG.minimumGripMultiplier,
    Math.min(1.12, tempGrip(tire.temp, c.tempWindow) * wearGrip(tire.wear) * c.baseGrip * c.wetRel * (1 - damage))
  );
  tire.grip += (targetGrip - tire.grip) * Math.min(1.0, 10.0 * c.dt);
  tire.load = load;
}

export function updateCarPhysics(
  car: CarPhysicsState,
  ctrl: ControlState,
  dt: number,
  weather: WeatherType,
  steeringSensitivity: number = 1.0,
  brakeForceMultiplier: number = 1.0,
  tireWearMultiplier: number = 1.0,
  extra: PhysicsExtras = {}
): {
  onTrack: boolean;
  gravel: boolean;
  nearestIdx: number;
  nearestDist: number;
  inPitLane: boolean;
  drsClosedReason?: string;
} {
  const [ni, d] = findNearestTrackPoint(car.x, car.y, car.idx);
  const T = track.current;
  const signedLat = (car.x - T.px[ni]) * T.nx[ni] + (car.y - T.py[ni]) * T.ny[ni];
  const inPitLane = !!extra.inPit || inPitBand(ni, signedLat);
  const hw = T.halfWidth[ni];
  const onTrack = inPitLane || d < hw + 6;
  const gravel = !inPitLane && d > hw + 40;
  let drsClosedReason: string | undefined;

  // Surface grip factor (single wetness path B5: on asphalt, tyreGrip handles wetness response)
  let surfaceGripFactor = onTrack ? 1.0 : gravel ? 0.38 : 0.62;
  if (!onTrack) {
    if (weather === 'cloudy') surfaceGripFactor *= 0.95;
    else if (weather === 'rain') surfaceGripFactor *= 0.70;
    else if (weather === 'snow') surfaceGripFactor *= 0.40;
  }

  // Initialize or resync internal vehicle state
  if (!car._veh) {
    const pt = createPowertrain();
    pt.gear = typeof car.gear === 'number' ? car.gear : 1;
    pt.rpm = car.rpm || 4000;
    pt.ersCharge = car.ersCharge ?? ERS.capacityJ * 0.5;
    car._veh = {
      x: car.x / UNITS_PER_M,
      y: car.y / UNITS_PER_M,
      yaw: car.a,
      vx: car.vf / UNITS_PER_M,
      vy: car.vl / UNITS_PER_M,
      yawRate: 0,
      steer: car.steer || 0,
      prevAx: 0,
      prevAy: 0,
      powertrain: pt,
      drsOpen: car.drsOpen || false,
      isBoosting: car.isBoosting || false,
      brakeBias: car.brakeBias || 0.56,
      wheelSlipFront: 0,
      wheelSlipRear: 0,
      isDrifting: false,
      driftIntensity: 0,
      driftAngle: 0,
      pitch: 0,
      roll: 0,
    };
  }

  const veh = car._veh;

  // Handle external teleport / manual velocity override (e.g. in tests or treadmill)
  const dxVeh = car.x / UNITS_PER_M - veh.x;
  const dyVeh = car.y / UNITS_PER_M - veh.y;
  if (dxVeh * dxVeh + dyVeh * dyVeh > 0.04) {
    veh.x = car.x / UNITS_PER_M;
    veh.y = car.y / UNITS_PER_M;
    veh.yawRate = 0;
    veh.vy = 0;
  }
  if (Math.abs(car.a - veh.yaw) > 0.05) {
    veh.yaw = car.a;
    veh.yawRate = 0;
  }
  const expVx = (car.vx * Math.cos(car.a) + car.vy * Math.sin(car.a)) / UNITS_PER_M;
  const expVy = (-car.vx * Math.sin(car.a) + car.vy * Math.cos(car.a)) / UNITS_PER_M;
  if (Math.abs(expVx - veh.vx) > 0.5 || Math.abs(expVy - veh.vy) > 0.5) {
    veh.vx = expVx;
    veh.vy = expVy;
  }
  if (Math.abs(car.steer - veh.steer) > 0.2 && ctrl.steer === car.steer) {
    veh.steer = car.steer;
  }

  // Brake bias adjustments
  if (ctrl.brakeBiasUp) veh.brakeBias = Math.min(BRAKE_CONFIG.maxBias, veh.brakeBias + BRAKE_CONFIG.biasStep);
  if (ctrl.brakeBiasDown) veh.brakeBias = Math.max(BRAKE_CONFIG.minBias, veh.brakeBias - BRAKE_CONFIG.biasStep);
  car.brakeBias = veh.brakeBias;

  // DRS toggling & zone rules
  if (ctrl.drsToggleRequested) {
    if (veh.drsOpen) {
      veh.drsOpen = false;
      drsClosedReason = 'MANUAL';
    } else {
      const inZone = isInDrsZone(ni);
      const allowed = extra.drsAvailable !== false && !inPitLane;
      const speedUnits = veh.vx * UNITS_PER_M;
      if (allowed && DRS_CONFIG.drsEnabled && (!DRS_CONFIG.requireDrsZones || inZone) && speedUnits >= DRS_CONFIG.minActivationSpeed) {
        veh.drsOpen = true;
      }
    }
  }

  if (veh.drsOpen) {
    if (extra.drsAvailable === false || inPitLane) {
      veh.drsOpen = false;
      drsClosedReason = 'NOT_AVAILABLE';
    } else if (ctrl.brake > 0.1 || car.brakeInput > 0.1) {
      veh.drsOpen = false;
      drsClosedReason = 'BRAKE';
    } else if (DRS_CONFIG.requireDrsZones && !isInDrsZone(ni)) {
      veh.drsOpen = false;
      drsClosedReason = 'ZONE_EXIT';
    } else if (Math.abs(veh.steer) > 0.4 || veh.isDrifting) {
      veh.drsOpen = false;
      drsClosedReason = 'STEER';
    }
  }
  car.drsOpen = veh.drsOpen;

  // ERS boost
  veh.isBoosting = ctrl.ersBoost && ctrl.throttle > 0.5 && ctrl.brake < 0.1 && veh.powertrain.ersCharge > 0;

  // Step vehicle model
  const vehInputs: VehicleInputs = {
    throttle: ctrl.throttle,
    brake: ctrl.brake * brakeForceMultiplier,
    steer: ctrl.steer,
    analogSteer: ctrl.analogSteer,
    drs: veh.drsOpen,
    ersBoost: veh.isBoosting,
    steeringSensitivity,
  };
  const vehEnv: VehicleEnvironment = {
    surfaceGrip: surfaceGripFactor,
    tyreGrip: car.tires.overallGrip,
    draft: extra.draft ?? 0,
    dirtyAir: 0,
    damage: extra.frontDamage ?? 0,
    inPit: inPitLane,
    fuelKg: extra.fuelKg,
  };

  stepVehicle(veh, vehInputs, vehEnv, dt);

  // Sync state back to car
  car.x = veh.x * UNITS_PER_M;
  car.y = veh.y * UNITS_PER_M;
  car.a = veh.yaw;
  const cA = Math.cos(veh.yaw);
  const sA = Math.sin(veh.yaw);
  car.vf = veh.vx * UNITS_PER_M;
  car.vl = veh.vy * UNITS_PER_M;
  car.vx = (veh.vx * cA - veh.vy * sA) * UNITS_PER_M;
  car.vy = (veh.vx * sA + veh.vy * cA) * UNITS_PER_M;
  car.steer = veh.steer;
  car.kmh = Math.abs(veh.vx) * 3.6;
  car.gear = veh.vx < -0.5 ? 'R' : car.kmh < 5 && ctrl.throttle === 0 ? 'N' : veh.powertrain.gear;
  car.rpm = veh.powertrain.rpm;
  car.ersCharge = veh.powertrain.ersCharge;
  car.ers = veh.powertrain.ersCharge / ERS.capacityJ;
  car.isBoosting = veh.isBoosting;
  car.wheelSlipFront = veh.wheelSlipFront;
  car.wheelSlipRear = veh.wheelSlipRear;
  car.isDrifting = veh.isDrifting;
  car.driftIntensity = veh.driftIntensity;
  car.driftAngle = veh.driftAngle;
  car.pitch = veh.pitch;
  car.roll = veh.roll;
  car.brakeInput = ctrl.brake;
  car.idx = ni;

  // Tyre thermodynamics
  const cmp = TYRE_COMPOUNDS[extra.compound ?? 'soft'];
  const wetness = extra.wetness ?? wetnessFor(weather);
  const wetRel = wetGripFactor(cmp.wetClass, wetness);
  const misuse = dryMisuse(cmp.wetClass, wetness);
  const heatMul = cmp.warmup * (1 + (cmp.dryHeatMul - 1) * misuse);
  const wearMul = cmp.wearRate * (1 + (cmp.dryWearMul - 1) * misuse);
  const ambientTemp =
    weather === 'snow' ? 4.0 : weather === 'rain' ? 17.0 : weather === 'cloudy' ? 22.0 : TIRE_CONFIG.ambientTemperature;
  const speedAbs = Math.abs(car.vf);
  const coolingRate =
    (TIRE_CONFIG.coolBase + 0.022 * Math.min(1, speedAbs / TIRE_CONFIG.coolingFullSpeed)) *
    (weather === 'rain'
      ? TIRE_CONFIG.rainCoolingMultiplier
      : weather === 'snow'
      ? TIRE_CONFIG.snowCoolingMultiplier
      : 1.0);
  const offTrackHeatMult = 1.0;

  const latLoadTransfer = Math.max(-0.35, Math.min(0.35, (veh.prevAy / GRAVITY) * 0.35));
  const longLoadTransfer = (veh.prevAx / GRAVITY) * 0.25;

  const flLoad = Math.max(0.4, Math.min(1.6, 1.0 - longLoadTransfer - latLoadTransfer));
  const frLoad = Math.max(0.4, Math.min(1.6, 1.0 - longLoadTransfer + latLoadTransfer));
  const rlLoad = Math.max(0.4, Math.min(1.6, 1.0 + longLoadTransfer - latLoadTransfer));
  const rrLoad = Math.max(0.4, Math.min(1.6, 1.0 + longLoadTransfer + latLoadTransfer));

  const speedStress = Math.min(1.3, speedAbs / 260);
  const cornerG = Math.abs(veh.prevAy) / GRAVITY;
  const cornerStress = Math.min(1.2, cornerG / 3.2) * speedStress;
  const brakeStress = car.brakeInput * speedStress;
  const tractionStress = ctrl.throttle > 0.3 && speedAbs < 160 ? ctrl.throttle * (1 - speedAbs / 160) : 0;
  const rolling = 1.0 * Math.min(1, speedAbs / 400);
  const frontBrakeHeat = brakeStress * 4.8 * car.brakeBias * 2;
  const rearBrakeHeat = brakeStress * 4.8 * (1 - car.brakeBias) * 2;
  const driftSlipHeat = car.isDrifting ? car.driftIntensity * TIRE_CONFIG.heatDrift : 0;
  const lockup = Math.max(car.wheelSlipFront, car.wheelSlipRear) > 0.92 ? TIRE_CONFIG.lockupWearMultiplier : 1.0;
  const driftWear = car.isDrifting ? 1 + (TIRE_CONFIG.driftWearMultiplier - 1) * car.driftIntensity : 1.0;
  const hotLimit = cmp.tempWindow[1] + 6;

  const tc = tireCtx;
  tc.dt = dt;
  tc.cornerStress = cornerStress;
  tc.brakeStress = brakeStress;
  tc.rolling = rolling;
  tc.driftSlipHeat = driftSlipHeat;
  tc.heatMul = heatMul;
  tc.offTrackHeatMult = offTrackHeatMult;
  tc.ambientTemp = ambientTemp;
  tc.coolingRate = coolingRate;
  tc.hotLimit = hotLimit;
  tc.driftWear = driftWear;
  tc.lockup = lockup;
  tc.onTrack = onTrack;
  tc.wearMul = wearMul;
  tc.tireWearMultiplier = tireWearMultiplier;
  tc.wetRel = wetRel;
  tc.tempWindow = cmp.tempWindow;
  tc.baseGrip = cmp.baseGrip;

  const fd = Math.max(0, Math.min(0.4, extra.frontDamage ?? 0));
  updateSingleTire(car.tires.fl, tc, flLoad, frontBrakeHeat, 0, car.wheelSlipFront || 0, fd);
  updateSingleTire(car.tires.fr, tc, frLoad, frontBrakeHeat, 0, car.wheelSlipFront || 0, fd);
  updateSingleTire(car.tires.rl, tc, rlLoad, rearBrakeHeat, tractionStress, (car.wheelSlipRear || 0) + car.driftIntensity * 0.8, 0);
  updateSingleTire(car.tires.rr, tc, rrLoad, rearBrakeHeat, tractionStress, (car.wheelSlipRear || 0) + car.driftIntensity * 0.8, 0);

  car.tires.frontGrip = (car.tires.fl.grip + car.tires.fr.grip) * 0.5;
  car.tires.rearGrip = (car.tires.rl.grip + car.tires.rr.grip) * 0.5;
  car.tires.overallGrip = (car.tires.frontGrip + car.tires.rearGrip) * 0.5;
  car.tires.avgTemp = (car.tires.fl.temp + car.tires.fr.temp + car.tires.rl.temp + car.tires.rr.temp) * 0.25;
  car.tires.avgWear = (car.tires.fl.wear + car.tires.fr.wear + car.tires.rl.wear + car.tires.rr.wear) * 0.25;

  // Collision resolution: guard rail & pit wall
  const GUARD_RAIL_MAX = inPitLane ? (hw + 96) : (hw + 82);
  const pt = [T.px[ni], T.py[ni]];
  const { offsets, radius, restitution, friction } = COLLISION_CONFIG;

  let maxPen = 0;
  let pushX = 0;
  let pushY = 0;
  let yawTorque = 0;

  for (let k = 0; k < offsets.length; k++) {
    const off = offsets[k];
    const cx = car.x + cA * off;
    const cy = car.y + sA * off;
    const dx = cx - pt[0];
    const dy = cy - pt[1];
    const cDist = Math.hypot(dx, dy) || 1;
    const cNx = dx / cDist;
    const cNy = dy / cDist;
    const cPen = (cDist + radius) - GUARD_RAIL_MAX;

    if (cPen > 0) {
      if (cPen > maxPen) {
        maxPen = cPen;
        pushX = -cNx;
        pushY = -cNy;
      }
      const rx = cA * off;
      const ry = sA * off;
      const fx = -cNx * cPen;
      const fy = -cNy * cPen;
      yawTorque += (rx * fy - ry * fx);
    }
  }

  // Also check pit wall between main track and pit lane
  const N = T.N;
  const pitWallSpan = ((T.pit.exitIdx - 26 - (T.pit.entryIdx + 26)) + N) % N;
  const pitWallK = (ni - (T.pit.entryIdx + 26) + N) % N;
  if (pitWallK <= pitWallSpan) {
    const pitSide = T.pit.side;
    const wallLat = pitSide * T.pit.wallOffset;
    const nn0 = T.nx[ni];
    const nn1 = T.ny[ni];
    for (let k = 0; k < offsets.length; k++) {
      const off = offsets[k];
      const cx = car.x + cA * off;
      const cy = car.y + sA * off;
      const lat = (cx - pt[0]) * nn0 + (cy - pt[1]) * nn1;
      if (inPitLane) {
        const pen = (wallLat + radius * pitSide) * pitSide - (lat * pitSide);
        if (pen > 0 && pen > maxPen) {
          maxPen = pen;
          pushX = nn0 * pitSide;
          pushY = nn1 * pitSide;
        }
      } else {
        const pen = (lat * pitSide) - (wallLat - radius * pitSide) * pitSide;
        if (pen > 0 && pen > maxPen) {
          maxPen = pen;
          pushX = -nn0 * pitSide;
          pushY = -nn1 * pitSide;
        }
      }
    }
  }

  if (maxPen > 0) {
    const corr = maxPen + 0.15;
    car.x += pushX * corr;
    car.y += pushY * corr;

    const yawKick = Math.max(-0.45, Math.min(0.45, yawTorque * 0.004));
    car.a += yawKick;

    const vn = car.vx * pushX + car.vy * pushY;
    if (vn < 0) {
      const tx = -pushY;
      const ty = pushX;
      const vt = car.vx * tx + car.vy * ty;
      const bounceVn = -restitution * vn;
      const slideVt = vt * friction;
      car.vx = bounceVn * pushX + slideVt * tx;
      car.vy = bounceVn * pushY + slideVt * ty;
    } else {
      car.vx *= 0.92;
      car.vy *= 0.92;
    }

    const cPost = Math.cos(car.a);
    const sPost = Math.sin(car.a);
    car.vf = car.vx * cPost + car.vy * sPost;
    car.vl = -car.vx * sPost + car.vy * cPost;
    car.kmh = Math.abs(car.vf) * KMH_PER_UNIT;

    // Sync back to veh
    veh.x = car.x / UNITS_PER_M;
    veh.y = car.y / UNITS_PER_M;
    veh.yaw = car.a;
    veh.vx = car.vf / UNITS_PER_M;
    veh.vy = car.vl / UNITS_PER_M;

    car.guardRailSparks = Math.min(1.0, car.guardRailSparks + 0.4 + maxPen * 0.05);
  } else {
    car.guardRailSparks = Math.max(0, car.guardRailSparks - dt * 3.2);
  }

  const finalDist = Math.hypot(car.x - pt[0], car.y - pt[1]);
  return { onTrack, gravel, nearestIdx: ni, nearestDist: finalDist, inPitLane, drsClosedReason };
}
