import {
  N,
  HW,
  trackSplinePoints,
  tangents,
  normals,
  smoothCurvature,
  DRIFT_CONFIG,
  ERS_CONFIG,
  DRS_CONFIG,
  BRAKE_CONFIG,
  TIRE_CONFIG,
  TYRE_COMPOUNDS,
  inPitBand,
  WeatherType,
  type TyreCompound,
} from './constants';
import { ControlState } from './controls';
import { dryMisuse, tempGrip, wearGrip, wetGripFactor, wetnessFor } from './sim/tyres';

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
}


export function calculateTireTempGrip(temp: number, window: [number, number] = TYRE_COMPOUNDS.soft.tempWindow): number {
  return tempGrip(temp, window);
}

export function calculateTireWearGrip(wear: number): number {
  return wearGrip(wear);
}

/** Create a stationary car at spline index `idx`, offset `lateral` units along the track normal. */
export function createInitialCarState(idx: number = 0, lateral: number = 0): CarPhysicsState {
  const i = ((Math.round(idx) % N) + N) % N;
  const p0 = trackSplinePoints[i];
  const p1 = trackSplinePoints[(i + 1) % N];
  const initAngle = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
  const initialTemp = TIRE_CONFIG.startTemperature;
  const initialWear = 0.0;
  const initGrip = calculateTireTempGrip(initialTemp) * calculateTireWearGrip(initialWear);

  return {
    x: p0[0] + normals[i][0] * lateral,
    y: p0[1] + normals[i][1] * lateral,
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
export function fitFreshTires(car: CarPhysicsState, startingTemp: number = TIRE_CONFIG.startTemperature) {
  const keys: (keyof Pick<TiresState, 'fl' | 'fr' | 'rl' | 'rr'>)[] = ['fl', 'fr', 'rl', 'rr'];
  for (const k of keys) {
    const t = car.tires[k];
    t.temp = startingTemp;
    t.wear = 0.0;
    t.grip = 1.0;
    t.slip = 0.0;
    t.load = 1.0;
  }
  car.tires.avgTemp = startingTemp;
  car.tires.avgWear = 0.0;
  car.tires.frontGrip = 1.0;
  car.tires.rearGrip = 1.0;
  car.tires.overallGrip = 1.0;
}

export function isCarInDrsZone(idx: number): boolean {
  for (const z of DRS_CONFIG.zones) {
    if (z.wraps) {
      if (idx >= z.start || idx <= z.end) return true;
    } else {
      if (idx >= z.start && idx <= z.end) return true;
    }
  }
  return false;
}

export function findNearestTrackPoint(x: number, y: number, currentIdx: number): [number, number] {
  let bi = currentIdx;
  let bd = 1e18;
  for (let k = -30; k <= 30; k++) {
    const i = (currentIdx + k + N) % N;
    const dx = x - trackSplinePoints[i][0];
    const dy = y - trackSplinePoints[i][1];
    const d = dx * dx + dy * dy;
    if (d < bd) {
      bd = d;
      bi = i;
    }
  }
  if (bd > 140 * 140) {
    for (let i = 0; i < N; i += 4) {
      const dx = x - trackSplinePoints[i][0];
      const dy = y - trackSplinePoints[i][1];
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
  // Pit-lane band counts as asphalt, as does the whole stretch while a car is driving through the pits.
  const np = trackSplinePoints[ni];
  const nn = normals[ni];
  const signedLat = (car.x - np[0]) * nn[0] + (car.y - np[1]) * nn[1];
  const inPitLane = !!extra.inPit || inPitBand(ni, signedLat);
  const onTrack = inPitLane || d < HW + 6;
  const gravel = !inPitLane && d > HW + 40;
  let drsClosedReason: string | undefined;

  // Steering target (sticks respond faster than digital keys)
  const steerRate = ctrl.analogSteer ? 20 : 8.5;
  car.steer += (ctrl.steer - car.steer) * Math.min(1, steerRate * dt);

  // Local velocity projection
  const c = Math.cos(car.a);
  const s = Math.sin(car.a);
  let vf = car.vx * c + car.vy * s;
  let vl = -car.vx * s + car.vy * c;

  const absSteer = Math.abs(car.steer);

  // DRS Toggle & Auto-deactivation
  if (ctrl.drsToggleRequested) {
    if (car.drsOpen) {
      car.drsOpen = false;
      drsClosedReason = 'MANUAL';
    } else {
      const inZone = isCarInDrsZone(ni);
      const allowed = extra.drsAvailable !== false && !inPitLane;
      if (allowed && DRS_CONFIG.drsEnabled && (!DRS_CONFIG.requireDrsZones || inZone) && vf >= DRS_CONFIG.minActivationSpeed) {
        car.drsOpen = true;
      }
    }
  }

  if (car.drsOpen) {
    if (extra.drsAvailable === false || inPitLane) {
      car.drsOpen = false;
      drsClosedReason = 'NOT_AVAILABLE';
    } else if (ctrl.brake > 0.1 || car.brakeInput > 0.1) {
      car.drsOpen = false;
      drsClosedReason = 'BRAKE';
    } else if (DRS_CONFIG.requireDrsZones && !isCarInDrsZone(ni)) {
      car.drsOpen = false;
      drsClosedReason = 'ZONE_EXIT';
    } else if (absSteer > 0.32 || car.isDrifting) {
      car.drsOpen = false;
      drsClosedReason = 'STEER';
    }
  }

  // ERS Boost
  const wantsBoost = ctrl.ersBoost;
  const canBoost = ctrl.throttle > 0.5 && ctrl.brake < 0.1 && car.brakeInput < 0.12 && car.ersCharge > 0;

  if (wantsBoost && canBoost && (car.isBoosting || car.ersCharge >= ERS_CONFIG.ersMinActivationCharge)) {
    car.isBoosting = true;
    car.ersCharge = Math.max(0, car.ersCharge - ERS_CONFIG.ersDrainRate * dt);
    if (car.ersCharge <= 0) {
      car.isBoosting = false;
    }
  } else {
    car.isBoosting = false;
    let recoveryRate = ERS_CONFIG.ersRechargeRate;
    if (ctrl.brake > 0.05 || car.brakeInput > 0.08) {
      recoveryRate = ERS_CONFIG.ersBrakeRecovery * (0.6 + car.brakeInput * 0.4);
    } else if (ctrl.throttle < 0.05 && vf > 20) {
      recoveryRate = ERS_CONFIG.ersCoastRecovery;
    }
    car.ersCharge = Math.min(ERS_CONFIG.maxERSCharge, car.ersCharge + recoveryRate * dt);
  }
  car.ers = car.ersCharge / ERS_CONFIG.maxERSCharge;

  // Smooth electric power transition
  const targetBoostBlend = car.isBoosting ? 1.0 : 0.0;
  car.boostBlend += (targetBoostBlend - car.boostBlend) * Math.min(1, ERS_CONFIG.boostTransitionRate * dt);
  car.boostAccelBonus = car.boostBlend * ERS_CONFIG.boostAccelerationBonus;
  car.boostSpeedBonus = car.boostBlend * ERS_CONFIG.boostTopSpeedBonus;

  // Smooth aerodynamic drag & top speed
  const targetDrag = car.drsOpen ? DRS_CONFIG.dragDRS : DRS_CONFIG.dragNormal;
  car.currentDrag += (targetDrag - car.currentDrag) * Math.min(1, 12 * dt);

  const targetBonus = car.drsOpen ? DRS_CONFIG.drsAccelerationBonus : 0;
  car.drsAccelBonus += (targetBonus - car.drsAccelBonus) * Math.min(1, 10 * dt);

  const targetMaxV = (car.drsOpen ? DRS_CONFIG.maxSpeedDRS : DRS_CONFIG.maxSpeedNormal) + car.boostSpeedBonus;
  car.currentMaxV += (targetMaxV - car.currentMaxV) * Math.min(1, 8 * dt);

  if (ctrl.throttle > 0) {
    const totalAccel = 760 + car.boostAccelBonus + car.drsAccelBonus;
    vf += totalAccel * ctrl.throttle * (1 - Math.max(0, vf) / car.currentMaxV) * dt;
  }

  // Progressive Braking & Brake Balance
  if (ctrl.brakeBiasUp) {
    car.brakeBias = Math.min(BRAKE_CONFIG.maxBias, car.brakeBias + BRAKE_CONFIG.biasStep);
  }
  if (ctrl.brakeBiasDown) {
    car.brakeBias = Math.max(BRAKE_CONFIG.minBias, car.brakeBias - BRAKE_CONFIG.biasStep);
  }

  const targetBrakePedal = ctrl.brake;
  const bRate = ctrl.brake > car.brakeInput ? BRAKE_CONFIG.brakeResponse : BRAKE_CONFIG.brakeReleaseRate;
  car.brakeInput += (targetBrakePedal - car.brakeInput) * Math.min(1, bRate * dt);
  if (ctrl.brake === 0 && car.brakeInput < 0.005) car.brakeInput = 0;

  // Surface traction
  let surfaceGripFactor = onTrack ? 1.0 : gravel ? 0.38 : 0.62;
  if (weather === 'cloudy') surfaceGripFactor *= 0.95;
  else if (weather === 'rain') surfaceGripFactor *= 0.65;
  else if (weather === 'snow') surfaceGripFactor *= 0.35;

  const aeroBrakeMult = 1.0 + BRAKE_CONFIG.highSpeedAeroFactor * Math.min(1.2, Math.max(0, vf) / 600);

  // Tire thermodynamics (see TIRE_CONFIG for the model)
  const cmp = TYRE_COMPOUNDS[extra.compound ?? 'soft'];
  const wetness = extra.wetness ?? wetnessFor(weather);
  const wetRel = wetGripFactor(cmp.wetClass, wetness);
  const misuse = dryMisuse(cmp.wetClass, wetness);
  const heatMul = cmp.warmup * (1 + (cmp.dryHeatMul - 1) * misuse);
  const wearMul = cmp.wearRate * (1 + (cmp.dryWearMul - 1) * misuse);
  const ambientTemp =
    weather === 'snow' ? 4.0 : weather === 'rain' ? 17.0 : weather === 'cloudy' ? 22.0 : TIRE_CONFIG.ambientTemperature;
  const speedAbs = Math.abs(vf);
  const coolingRate =
    (TIRE_CONFIG.coolBase + TIRE_CONFIG.coolAir * Math.min(1, speedAbs / TIRE_CONFIG.coolingFullSpeed)) *
    (weather === 'rain'
      ? TIRE_CONFIG.rainCoolingMultiplier
      : weather === 'snow'
      ? TIRE_CONFIG.snowCoolingMultiplier
      : 1.0);
  const offTrackHeatMult = !onTrack ? (gravel ? 1.6 : 1.3) : 1.0;

  const latLoadTransfer = Math.max(-0.35, Math.min(0.35, car.steer * 0.35));
  const longLoadTransfer = car.brakeInput * 0.25 - ctrl.throttle * 0.15;

  const flLoad = Math.max(0.4, Math.min(1.6, 1.0 + longLoadTransfer - latLoadTransfer));
  const frLoad = Math.max(0.4, Math.min(1.6, 1.0 + longLoadTransfer + latLoadTransfer));
  const rlLoad = Math.max(0.4, Math.min(1.6, 1.0 - longLoadTransfer - latLoadTransfer));
  const rrLoad = Math.max(0.4, Math.min(1.6, 1.0 - longLoadTransfer + latLoadTransfer));

  const speedStress = Math.min(1.3, speedAbs / 260);
  const cornerStress = absSteer * speedStress;
  const brakeStress = car.brakeInput * speedStress;
  const tractionStress = ctrl.throttle > 0.3 && speedAbs < 160 ? ctrl.throttle * (1 - speedAbs / 160) : 0;
  const rolling = TIRE_CONFIG.heatRolling * Math.min(1, speedAbs / 400);
  const frontBrakeHeat = brakeStress * TIRE_CONFIG.heatBrake * car.brakeBias * 2;
  const rearBrakeHeat = brakeStress * TIRE_CONFIG.heatBrake * (1 - car.brakeBias) * 2;
  const driftSlipHeat = car.isDrifting ? car.driftIntensity * TIRE_CONFIG.heatDrift : 0;
  const lockup = Math.max(car.wheelSlipFront, car.wheelSlipRear) > 0.92 ? TIRE_CONFIG.lockupWearMultiplier : 1.0;
  const driftWear = car.isDrifting ? 1 + (TIRE_CONFIG.driftWearMultiplier - 1) * car.driftIntensity : 1.0;
  const hotLimit = cmp.tempWindow[1] + 6;

  const updateSingleTire = (tire: SingleTireState, load: number, brakeHeat: number, driveStress: number, slipWork: number, damage: number) => {
    const heatIn =
      (TIRE_CONFIG.heatCorner * cornerStress * load + brakeHeat + rolling + driveStress * TIRE_CONFIG.heatWheelspin + driftSlipHeat) *
      heatMul *
      offTrackHeatMult;
    const netHeat = heatIn - (tire.temp - ambientTemp) * coolingRate;
    tire.temp = Math.max(TIRE_CONFIG.minTireTemperature, Math.min(TIRE_CONFIG.maxTireTemperature, tire.temp + netHeat * dt));

    const overheat = tire.temp > hotLimit ? 1 + (tire.temp - hotLimit) / 30 : 1;
    const stress = 0.08 + 0.6 * cornerStress * load + 0.5 * brakeStress * load + 0.35 * driveStress + slipWork * 0.4;
    const wearDelta = stress * driftWear * lockup * overheat * (!onTrack ? 1.5 : 1.0) * wearMul * TIRE_CONFIG.tireWearRate * tireWearMultiplier * dt;
    tire.wear = Math.min(1.0, tire.wear + wearDelta);

    const targetGrip = Math.max(
      TIRE_CONFIG.minimumGripMultiplier,
      Math.min(1.12, tempGrip(tire.temp, cmp.tempWindow) * wearGrip(tire.wear) * cmp.baseGrip * wetRel * (1 - damage))
    );
    tire.grip += (targetGrip - tire.grip) * Math.min(1.0, 10.0 * dt);
    tire.load = load;
  };

  const fd = Math.max(0, Math.min(0.4, extra.frontDamage ?? 0));
  updateSingleTire(car.tires.fl, flLoad, frontBrakeHeat, 0, car.wheelSlipFront || 0, fd);
  updateSingleTire(car.tires.fr, frLoad, frontBrakeHeat, 0, car.wheelSlipFront || 0, fd);
  updateSingleTire(car.tires.rl, rlLoad, rearBrakeHeat, tractionStress, (car.wheelSlipRear || 0) + car.driftIntensity * 0.8, 0);
  updateSingleTire(car.tires.rr, rrLoad, rearBrakeHeat, tractionStress, (car.wheelSlipRear || 0) + car.driftIntensity * 0.8, 0);

  car.tires.frontGrip = (car.tires.fl.grip + car.tires.fr.grip) * 0.5;
  car.tires.rearGrip = (car.tires.rl.grip + car.tires.rr.grip) * 0.5;
  car.tires.overallGrip = (car.tires.frontGrip + car.tires.rearGrip) * 0.5;
  car.tires.avgTemp = (car.tires.fl.temp + car.tires.fr.temp + car.tires.rl.temp + car.tires.rr.temp) * 0.25;
  car.tires.avgWear = (car.tires.fl.wear + car.tires.fr.wear + car.tires.rl.wear + car.tires.rr.wear) * 0.25;

  // Deceleration calculation
  const configuredMaxForce = BRAKE_CONFIG.maxBrakeForce * brakeForceMultiplier;

  // Realistic aerodynamic downforce scaling:
  // At high speed (~300+ km/h), massive downforce generates immense tire load and braking power.
  // As speed drops, downforce decreases with v^2, tapering deceleration down to realistic mechanical grip
  // so the car doesn't instantly snap to a dead stop at low and medium speeds.
  const speedRatio = Math.min(1.0, Math.max(0, vf) / 680);
  const downforceFactor = speedRatio * speedRatio;
  const speedDecelScale = 0.52 + 0.48 * downforceFactor;

  // Progressive pedal feel for natural threshold modulation
  const progressivePedal = Math.pow(car.brakeInput, 1.25);

  const requestedBrakeDecel = configuredMaxForce * progressivePedal * aeroBrakeMult * speedDecelScale;
  const availableBrakeTraction = configuredMaxForce * 1.2 * surfaceGripFactor * car.tires.overallGrip * Math.max(0.5, speedDecelScale);
  const actualBrakeDecel = Math.min(requestedBrakeDecel, availableBrakeTraction);
  car.actualBrakeForce = actualBrakeDecel;

  const biasFront = car.brakeBias;
  const biasRear = 1.0 - biasFront;
  car.brakeFrontLoad = biasFront;
  car.brakeRearLoad = biasRear;

  const gripSaturation = actualBrakeDecel / Math.max(10, availableBrakeTraction);
  car.wheelSlipFront = Math.min(1.0, gripSaturation * (biasFront / 0.56) * car.brakeInput);
  car.wheelSlipRear = Math.min(1.0, gripSaturation * (biasRear / 0.44) * car.brakeInput);

  if (vf > BRAKE_CONFIG.lowSpeedCutoff) {
    car.isReversing = false;
    car.stoppedDuration = 0;
    vf -= actualBrakeDecel * dt;
    if (vf < 0.2) vf = 0;
  } else if (vf < -BRAKE_CONFIG.lowSpeedCutoff) {
    car.isReversing = true;
    if (ctrl.throttle > 0.1) {
      vf += 1350 * dt;
      if (vf > -0.2) vf = 0;
    } else if (ctrl.brake > 0.1) {
      vf = Math.max(BRAKE_CONFIG.reverseMaxSpeed, vf - BRAKE_CONFIG.reverseAccel * dt);
    } else {
      vf += 320 * dt;
      if (vf > -0.2) vf = 0;
    }
  } else {
    if (ctrl.brake > 0.1 && ctrl.throttle < 0.1) {
      car.stoppedDuration += dt;
      if (car.stoppedDuration > BRAKE_CONFIG.reverseDelay) {
        car.isReversing = true;
        vf -= BRAKE_CONFIG.reverseAccel * dt;
      } else {
        vf *= Math.exp(-24 * dt);
        if (Math.abs(vf) < 0.15) vf = 0;
      }
    } else {
      car.stoppedDuration = 0;
      car.isReversing = false;
      vf *= Math.exp(-24 * dt);
      if (Math.abs(vf) < 0.15) vf = 0;
    }
  }

  // Drift Triggering & Handling
  const handbrakeDrift = ctrl.handbrake && absSteer > 0.12 && vf > DRIFT_CONFIG.driftThresholdSpeed;
  const highSpeedSlide = vf > DRIFT_CONFIG.highSpeedThreshold && absSteer > 0.6;
  const wantsDrift = handbrakeDrift || highSpeedSlide;

  const isCounterSteer = (vl < -15 && car.steer < -0.05) || (vl > 15 && car.steer > 0.05);
  const isStraightening = absSteer < 0.08 && !ctrl.handbrake;

  if (wantsDrift && !car.isDrifting && vf > DRIFT_CONFIG.driftThresholdSpeed) {
    car.isDrifting = true;
    car.driftDir = car.steer !== 0 ? Math.sign(car.steer) : vl !== 0 ? -Math.sign(vl) : 1;
    const kick = (handbrakeDrift ? DRIFT_CONFIG.handbrakeImpulse : DRIFT_CONFIG.naturalSlideImpulse) * Math.min(1.4, vf / 320);
    vl -= Math.sign(car.steer) * kick;
  }

  if (car.isDrifting) {
    if (ctrl.throttle > 0.3 && vf > 100 && (absSteer > 0.08 || ctrl.handbrake)) {
      const slideDir = vl !== 0 ? Math.sign(vl) : car.steer !== 0 ? -Math.sign(car.steer) : -1;
      vl += slideDir * 180 * Math.min(1.3, vf / 300) * dt;
    }
    if (isCounterSteer) {
      vl -= Math.sign(vl) * 450 * Math.abs(car.steer) * dt;
    }
  }

  // Lateral grip
  let baseNormalGrip = (onTrack ? DRIFT_CONFIG.normalGrip : 3.2) * car.tires.rearGrip;
  let baseDriftGrip = (onTrack ? DRIFT_CONFIG.driftGrip : 1.1) * car.tires.overallGrip;

  if (weather === 'cloudy') {
    baseNormalGrip *= 0.95;
    baseDriftGrip *= 0.95;
  } else if (weather === 'rain') {
    baseNormalGrip *= 0.65;
    baseDriftGrip *= 0.55;
  } else if (weather === 'snow') {
    baseNormalGrip *= 0.35;
    baseDriftGrip *= 0.3;
  }

  let effectiveGrip = baseNormalGrip;
  if (car.isDrifting) {
    if (isCounterSteer) {
      effectiveGrip = baseDriftGrip + (baseNormalGrip - baseDriftGrip) * Math.min(1, Math.abs(car.steer) * DRIFT_CONFIG.counterSteerBonus);
    } else if (isStraightening || !ctrl.handbrake) {
      effectiveGrip = baseNormalGrip * 1.35;
    } else {
      effectiveGrip = baseDriftGrip;
    }
  }

  vl *= Math.exp(-effectiveGrip * dt);
  vl *= DRIFT_CONFIG.lateralDamping;

  if (vf <= 0 || (Math.abs(vl) < 25 && (!wantsDrift || vf < DRIFT_CONFIG.driftThresholdSpeed))) {
    car.isDrifting = false;
    car.driftDuration = 0;
  } else if (car.isDrifting) {
    car.driftDuration += dt;
  }

  const speedFactor = Math.min(1.0, Math.max(0, vf - 60) / 180);
  const slipFactor = Math.min(1.0, Math.abs(vl) / 130);
  const steerFactor = 0.4 + absSteer * 0.6;
  const targetIntensity = car.isDrifting && vf > 60 ? Math.min(1.0, slipFactor * speedFactor * steerFactor) : 0;
  car.driftIntensity += (targetIntensity - car.driftIntensity) * Math.min(1, 10 * dt);
  car.driftAngle = car.isDrifting && vf > 60 ? Math.atan2(vl, Math.max(20, vf)) : 0;

  // Forward drag
  const driftScrubDrag = car.driftIntensity * 0.16;
  const draftScale = 1 - 0.4 * Math.max(0, Math.min(1, extra.draft ?? 0));
  vf -= vf * (car.currentDrag * draftScale + driftScrubDrag) * dt;
  if (!onTrack) vf -= vf * (gravel ? 4 : 1.6) * dt;

  // Yaw rotation
  let steerCoeff = weather === 'snow' ? 3.2 : 2.6;
  const ar = Math.abs(vf);
  const baseTurnRate =
    (car.steer * steerCoeff * steeringSensitivity * car.tires.frontGrip * Math.min(ar / 220, 1)) /
    (1 + ar / 620) *
    (vf >= 0 ? 1 : -1);
  let finalYawRate = baseTurnRate;

  if (car.brakeInput > 0.04 && absSteer > 0.03 && vf > 25) {
    const biasDelta = car.brakeBias - 0.56;
    const yawBiasMultiplier = 1.0 - biasDelta * 0.85 * car.brakeInput;
    finalYawRate *= Math.max(0.72, Math.min(1.28, yawBiasMultiplier));

    if (car.brakeBias < 0.5 && car.brakeInput > 0.35) {
      const rearTurnAssist = car.steer * (0.5 - car.brakeBias) * 1.5 * car.brakeInput * Math.min(1.0, vf / 170);
      finalYawRate += rearTurnAssist;
    }
  }

  if (car.isDrifting) {
    const oversteerYaw = (vl !== 0 ? -Math.sign(vl) : -car.driftDir) * Math.min(1.2, Math.abs(vl) / 120) * DRIFT_CONFIG.oversteerYawRate;
    finalYawRate += oversteerYaw;
    if (isCounterSteer) {
      finalYawRate += car.steer * 2.2 * steeringSensitivity;
    }
  }

  car.a += finalYawRate * dt;

  // Spinout prevention
  if (vf > 80 && Math.hypot(car.vx, car.vy) > 100) {
    const velAngle = Math.atan2(car.vy, car.vx);
    let angleDiff = car.a - velAngle;
    angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff));
    if (Math.abs(angleDiff) > DRIFT_CONFIG.driftAngleLimit) {
      const excess = angleDiff - Math.sign(angleDiff) * DRIFT_CONFIG.driftAngleLimit;
      car.a -= excess * Math.min(1, 14 * dt);
    }
  }

  // World coordinates update
  const c2 = Math.cos(car.a);
  const s2 = Math.sin(car.a);
  car.vx = vf * c2 - vl * s2;
  car.vy = vf * s2 + vl * c2;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  car.vf = vf;
  car.vl = vl;
  car.idx = ni;

  // Guard Rail Collision & Bouncing
  const GUARD_RAIL_MAX = HW + 82;
  if (d > GUARD_RAIL_MAX) {
    const pt = trackSplinePoints[ni];
    const toCenter = [pt[0] - car.x, pt[1] - car.y];
    const cLen = Math.hypot(toCenter[0], toCenter[1]) || 1;
    const pen = d - GUARD_RAIL_MAX;
    car.x += (toCenter[0] / cLen) * pen;
    car.y += (toCenter[1] / cLen) * pen;

    const velDot = (car.vx * toCenter[0] + car.vy * toCenter[1]) / cLen;
    if (velDot < 0) {
      car.vx -= 1.45 * velDot * (toCenter[0] / cLen);
      car.vy -= 1.45 * velDot * (toCenter[1] / cLen);
    }
    car.vx *= 0.68;
    car.vy *= 0.68;
    car.guardRailSparks = Math.min(1.0, car.guardRailSparks + 0.5);
  } else {
    car.guardRailSparks = Math.max(0, car.guardRailSparks - dt * 3.2);
  }

  // Speedometer, Gear & RPM
  const kmh = Math.abs(vf) * 0.37;
  car.kmh = kmh;
  const g = vf < -5 ? 'R' : kmh < 8 ? 'N' : Math.min(8, 1 + Math.floor(kmh / 42));
  car.gear = g;
  const inG = typeof g === 'number' ? (kmh - (g - 1) * 42) / 42 : 0;
  car.rpm = typeof g === 'number' ? 5200 + Math.max(0, Math.min(1, inG)) * 5800 : 3900;

  // Pitch & Roll visual dynamics
  car.pitch = (car.brakeInput * 0.04) - ctrl.throttle * 0.025;
  car.roll = -(car.steer * 0.05) - (vl * 0.0003);

  return { onTrack, gravel, nearestIdx: ni, nearestDist: d, inPitLane, drsClosedReason };
}
