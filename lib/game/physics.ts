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
  WeatherType,
  AIConfig,
} from './constants';
import { ControlState } from './controls';

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

export interface AICarState {
  x: number;
  y: number;
  a: number;
  idx: number;
  speed: number;
  lapNo: number;
  halfway: boolean;
  lapT: number;
  totalDist: number;
  cfg: AIConfig;
  finished: boolean;
}

export function calculateTireTempGrip(temp: number): number {
  if (temp < TIRE_CONFIG.optimalTireTemperature) {
    if (temp >= TIRE_CONFIG.coldThresholdTemperature) return 1.0;
    const coldFraction = Math.min(
      1.0,
      (TIRE_CONFIG.coldThresholdTemperature - temp) /
        Math.max(1, TIRE_CONFIG.coldThresholdTemperature - TIRE_CONFIG.minTireTemperature)
    );
    return 1.0 - (1.0 - TIRE_CONFIG.coldGripMultiplier) * (coldFraction * coldFraction);
  } else {
    if (temp <= TIRE_CONFIG.overheatThresholdTemperature) return 1.0;
    const hotFraction = Math.min(
      1.0,
      (temp - TIRE_CONFIG.overheatThresholdTemperature) /
        Math.max(1, TIRE_CONFIG.maxTireTemperature - TIRE_CONFIG.overheatThresholdTemperature)
    );
    return 1.0 - (1.0 - TIRE_CONFIG.overheatGripMultiplier) * Math.sqrt(hotFraction);
  }
}

export function calculateTireWearGrip(wear: number): number {
  const w = Math.min(1.0, Math.max(0.0, wear));
  return 1.0 - (1.0 - TIRE_CONFIG.minimumGripMultiplier) * Math.pow(w, 1.6);
}

export function createInitialCarState(): CarPhysicsState {
  const p0 = trackSplinePoints[0];
  const p1 = trackSplinePoints[1];
  const initAngle = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
  const initialTemp = 85.0;
  const initialWear = 0.0;
  const initGrip = calculateTireTempGrip(initialTemp) * calculateTireWearGrip(initialWear);

  return {
    x: p0[0],
    y: p0[1],
    a: initAngle,
    vx: 0,
    vy: 0,
    vf: 0,
    vl: 0,
    steer: 0,
    idx: 0,
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

export function fitFreshTires(car: CarPhysicsState) {
  const startingTemp = 85.0;
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

export function updateCarPhysics(
  car: CarPhysicsState,
  ctrl: ControlState,
  dt: number,
  weather: WeatherType,
  steeringSensitivity: number = 1.0,
  brakeForceMultiplier: number = 1.0,
  tireWearMultiplier: number = 1.0
): {
  onTrack: boolean;
  gravel: boolean;
  nearestIdx: number;
  nearestDist: number;
  drsClosedReason?: string;
} {
  const [ni, d] = findNearestTrackPoint(car.x, car.y, car.idx);
  const onTrack = d < HW + 6;
  const gravel = d > HW + 40;
  let drsClosedReason: string | undefined;

  // Steering target
  const tgt = (ctrl.steerRight ? 1 : 0) - (ctrl.steerLeft ? 1 : 0);
  car.steer += (tgt - car.steer) * Math.min(1, 8.5 * dt);

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
      if (DRS_CONFIG.drsEnabled && (!DRS_CONFIG.requireDrsZones || inZone) && vf >= DRS_CONFIG.minActivationSpeed) {
        car.drsOpen = true;
      }
    }
  }

  if (car.drsOpen) {
    if (ctrl.brake || car.brakeInput > 0.1) {
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
  const canBoost = ctrl.throttle && !ctrl.brake && car.brakeInput < 0.12 && car.ersCharge > 0;

  if (wantsBoost && canBoost && (car.isBoosting || car.ersCharge >= ERS_CONFIG.ersMinActivationCharge)) {
    car.isBoosting = true;
    car.ersCharge = Math.max(0, car.ersCharge - ERS_CONFIG.ersDrainRate * dt);
    if (car.ersCharge <= 0) {
      car.isBoosting = false;
    }
  } else {
    car.isBoosting = false;
    let recoveryRate = ERS_CONFIG.ersRechargeRate;
    if (ctrl.brake || car.brakeInput > 0.08) {
      recoveryRate = ERS_CONFIG.ersBrakeRecovery * (0.6 + car.brakeInput * 0.4);
    } else if (!ctrl.throttle && vf > 20) {
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

  if (ctrl.throttle) {
    const totalAccel = 760 + car.boostAccelBonus + car.drsAccelBonus;
    vf += totalAccel * (1 - Math.max(0, vf) / car.currentMaxV) * dt;
  }

  // Progressive Braking & Brake Balance
  if (ctrl.brakeBiasUp) {
    car.brakeBias = Math.min(BRAKE_CONFIG.maxBias, car.brakeBias + BRAKE_CONFIG.biasStep);
  }
  if (ctrl.brakeBiasDown) {
    car.brakeBias = Math.max(BRAKE_CONFIG.minBias, car.brakeBias - BRAKE_CONFIG.biasStep);
  }

  const targetBrakePedal = ctrl.brake ? 1.0 : 0.0;
  const bRate = ctrl.brake ? BRAKE_CONFIG.brakeResponse : BRAKE_CONFIG.brakeReleaseRate;
  car.brakeInput += (targetBrakePedal - car.brakeInput) * Math.min(1, bRate * dt);
  if (!ctrl.brake && car.brakeInput < 0.005) car.brakeInput = 0;

  // Surface traction
  let surfaceGripFactor = onTrack ? 1.0 : gravel ? 0.38 : 0.62;
  if (weather === 'cloudy') surfaceGripFactor *= 0.95;
  else if (weather === 'rain') surfaceGripFactor *= 0.65;
  else if (weather === 'snow') surfaceGripFactor *= 0.35;

  const aeroBrakeMult = 1.0 + BRAKE_CONFIG.highSpeedAeroFactor * Math.min(1.2, Math.max(0, vf) / 600);

  // Tire thermodynamics
  const ambientTemp =
    weather === 'snow' ? 4.0 : weather === 'rain' ? 17.0 : weather === 'cloudy' ? 22.0 : TIRE_CONFIG.ambientTemperature;
  const coolingRate =
    TIRE_CONFIG.temperatureCoolingRate *
    (1.0 + Math.min(1.5, Math.abs(vf) / 220)) *
    (weather === 'rain'
      ? TIRE_CONFIG.rainCoolingMultiplier
      : weather === 'snow'
      ? TIRE_CONFIG.snowCoolingMultiplier
      : 1.0);
  const offTrackHeatMult = !onTrack ? (gravel ? 1.6 : 1.3) : 1.0;

  const latLoadTransfer = Math.max(-0.35, Math.min(0.35, car.steer * 0.35));
  const longLoadTransfer = car.brakeInput * 0.25 - (ctrl.throttle ? 0.15 : 0);

  const flLoad = Math.max(0.4, Math.min(1.6, 1.0 + longLoadTransfer - latLoadTransfer));
  const frLoad = Math.max(0.4, Math.min(1.6, 1.0 + longLoadTransfer + latLoadTransfer));
  const rlLoad = Math.max(0.4, Math.min(1.6, 1.0 - longLoadTransfer - latLoadTransfer));
  const rrLoad = Math.max(0.4, Math.min(1.6, 1.0 - longLoadTransfer + latLoadTransfer));

  const frontBrakeHeat = car.brakeInput * TIRE_CONFIG.brakeHeatingScalar * car.brakeBias * Math.min(1.5, Math.abs(vf) / 220);
  const rearBrakeHeat = car.brakeInput * TIRE_CONFIG.brakeHeatingScalar * (1 - car.brakeBias) * Math.min(1.5, Math.abs(vf) / 220);
  const steerScrubHeat = absSteer * TIRE_CONFIG.corneringHeatingScalar * Math.min(1.4, Math.abs(vf) / 200);
  const driveWheelspinHeat = ctrl.throttle && Math.abs(vf) < 140 ? (1 - Math.abs(vf) / 140) * TIRE_CONFIG.wheelspinHeatingScalar : 0;
  const driftSlipHeat = car.isDrifting ? car.driftIntensity * TIRE_CONFIG.driftHeatingScalar : 0;

  const updateSingleTire = (tire: SingleTireState, load: number, heatGen: number, slipWork: number) => {
    const netHeat = (heatGen * offTrackHeatMult - (tire.temp - ambientTemp) * coolingRate) * TIRE_CONFIG.temperatureGainRate;
    tire.temp = Math.max(TIRE_CONFIG.minTireTemperature, Math.min(TIRE_CONFIG.maxTireTemperature, tire.temp + netHeat * dt));

    const wearWork = (slipWork + heatGen * 0.12) * load * (car.isDrifting ? TIRE_CONFIG.driftWearMultiplier : 1.0) * (!onTrack ? 1.5 : 1.0);
    const wearDelta = wearWork * TIRE_CONFIG.tireWearRate * tireWearMultiplier * dt;
    tire.wear = Math.min(1.0, tire.wear + wearDelta);

    const targetTempGrip = calculateTireTempGrip(tire.temp);
    const targetWearGrip = calculateTireWearGrip(tire.wear);
    const targetGrip = Math.max(TIRE_CONFIG.minimumGripMultiplier, Math.min(1.05, targetTempGrip * targetWearGrip));
    tire.grip += (targetGrip - tire.grip) * Math.min(1.0, 10.0 * dt);
    tire.load = load;
  };

  updateSingleTire(car.tires.fl, flLoad, frontBrakeHeat + steerScrubHeat * 1.1, (car.wheelSlipFront || 0) + absSteer * 0.4);
  updateSingleTire(car.tires.fr, frLoad, frontBrakeHeat + steerScrubHeat * 1.1, (car.wheelSlipFront || 0) + absSteer * 0.4);
  updateSingleTire(car.tires.rl, rlLoad, rearBrakeHeat + driveWheelspinHeat + driftSlipHeat, (car.wheelSlipRear || 0) + car.driftIntensity * 0.8);
  updateSingleTire(car.tires.rr, rrLoad, rearBrakeHeat + driveWheelspinHeat + driftSlipHeat, (car.wheelSlipRear || 0) + car.driftIntensity * 0.8);

  car.tires.frontGrip = (car.tires.fl.grip + car.tires.fr.grip) * 0.5;
  car.tires.rearGrip = (car.tires.rl.grip + car.tires.rr.grip) * 0.5;
  car.tires.overallGrip = (car.tires.frontGrip + car.tires.rearGrip) * 0.5;
  car.tires.avgTemp = (car.tires.fl.temp + car.tires.fr.temp + car.tires.rl.temp + car.tires.rr.temp) * 0.25;
  car.tires.avgWear = (car.tires.fl.wear + car.tires.fr.wear + car.tires.rl.wear + car.tires.rr.wear) * 0.25;

  // Deceleration calculation
  const configuredMaxForce = BRAKE_CONFIG.maxBrakeForce * brakeForceMultiplier;
  const requestedBrakeDecel = configuredMaxForce * car.brakeInput * aeroBrakeMult;
  const availableBrakeTraction = configuredMaxForce * 1.2 * surfaceGripFactor * car.tires.overallGrip;
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
    if (ctrl.throttle) {
      vf += 1350 * dt;
      if (vf > -0.2) vf = 0;
    } else if (ctrl.brake) {
      vf = Math.max(BRAKE_CONFIG.reverseMaxSpeed, vf - BRAKE_CONFIG.reverseAccel * dt);
    } else {
      vf += 320 * dt;
      if (vf > -0.2) vf = 0;
    }
  } else {
    if (ctrl.brake && !ctrl.throttle) {
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
    if (ctrl.throttle && vf > 100 && (absSteer > 0.08 || ctrl.handbrake)) {
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
  vf -= vf * (car.currentDrag + driftScrubDrag) * dt;
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
  car.pitch = (car.brakeInput * 0.04) - (ctrl.throttle ? 0.025 : 0);
  car.roll = -(car.steer * 0.05) - (vl * 0.0003);

  return { onTrack, gravel, nearestIdx: ni, nearestDist: d, drsClosedReason };
}

export function updateAI(aiCars: AICarState[], dt: number, playerDist: number, playerIdx: number) {
  aiCars.forEach((ai) => {
    if (ai.finished) return;

    const currentPt = trackSplinePoints[ai.idx];
    const nextIdx = (ai.idx + 1) % N;
    const nextPt = trackSplinePoints[nextIdx];
    const targetA = Math.atan2(nextPt[1] - currentPt[1], nextPt[0] - currentPt[0]);

    // Curvature deceleration
    const curv = smoothCurvature[ai.idx] || 0.01;
    const maxCornerSpeed = Math.max(220, 680 * (1 - curv * 12 * ai.cfg.cornerBrake));
    const targetSpeed = Math.min(840 * ai.cfg.pace, maxCornerSpeed);

    if (ai.speed < targetSpeed) {
      ai.speed += 620 * ai.cfg.accel * dt;
    } else {
      ai.speed -= 850 * dt;
    }

    ai.speed = Math.max(80, ai.speed);
    ai.a += Math.atan2(Math.sin(targetA - ai.a), Math.cos(targetA - ai.a)) * Math.min(1, 9 * dt);

    const stepDist = ai.speed * dt;
    ai.totalDist += stepDist;
    ai.lapT += dt;

    ai.x += Math.cos(ai.a) * stepDist;
    ai.y += Math.sin(ai.a) * stepDist;

    // Follow spline index
    const [ni] = findNearestTrackPoint(ai.x, ai.y, ai.idx);
    const prev = ai.idx;
    ai.idx = ni;

    if (ni > N * 0.45 && ni < N * 0.55) ai.halfway = true;
    if (prev > N * 0.9 && ni < N * 0.1 && ai.halfway) {
      ai.lapNo++;
      ai.lapT = 0;
      ai.halfway = false;
    }
  });
}
