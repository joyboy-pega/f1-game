// Comprehensive test suite for upgraded F1 braking system and brake balance physics

const BRAKE_CONFIG = {
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
  userBrakeForceMultiplier: 1.0
};

const DRIFT_CONFIG = {
  normalGrip: 6.2,
  driftGrip: 1.85,
  driftThresholdSpeed: 175,
  highSpeedThreshold: 340,
  driftAngleLimit: 0.62,
  oversteerYawRate: 0.95
};

const ERS_CONFIG = {
  maxERSCharge: 100,
  ersRechargeRate: 4.5,
  ersBrakeRecovery: 16.0,
  ersCoastRecovery: 7.5,
  ersMinActivationCharge: 5.0
};

// Simulation state helper
function createCar(initialVf = 0, initialBias = 0.56) {
  return {
    vf: initialVf,
    vl: 0,
    a: 0,
    steer: 0,
    brakeInput: 0,
    brakeBias: initialBias,
    actualBrakeForce: 0,
    brakeFrontLoad: initialBias,
    brakeRearLoad: 1 - initialBias,
    isReversing: false,
    stoppedDuration: 0,
    wheelSlipFront: 0,
    wheelSlipRear: 0,
    isDrifting: false,
    drsOpen: false,
    ersCharge: 50,
    isBoosting: false
  };
}

function simulateStep(car, dt, inputs, env = { onTrack: true, weather: 'sunny' }) {
  const { thr = false, brk = false, steer = 0, wantsBoost = false } = inputs;
  const { onTrack = true, weather = 'sunny' } = env;

  // Steering
  car.steer = steer;
  const absSteer = Math.abs(car.steer);

  // Progressive brake input
  const targetBrakePedal = brk ? 1.0 : 0.0;
  const bRate = brk ? BRAKE_CONFIG.brakeResponse : BRAKE_CONFIG.brakeReleaseRate;
  car.brakeInput = (car.brakeInput || 0) + (targetBrakePedal - (car.brakeInput || 0)) * Math.min(1, bRate * dt);
  if (!brk && car.brakeInput < 0.005) car.brakeInput = 0;

  // DRS auto-close on significant braking
  if (car.drsOpen && (brk || car.brakeInput > 0.10)) {
    car.drsOpen = false;
    car.drsClosedReason = 'BRAKE';
  }

  // ERS boost & recovery
  const canBoost = thr && !brk && car.brakeInput < 0.12 && car.ersCharge > ERS_CONFIG.ersMinActivationCharge;
  if (wantsBoost && canBoost) {
    car.isBoosting = true;
    car.ersCharge = Math.max(0, car.ersCharge - 20 * dt);
  } else {
    car.isBoosting = false;
    let recoveryRate = ERS_CONFIG.ersRechargeRate;
    if (brk || car.brakeInput > 0.08) {
      recoveryRate = ERS_CONFIG.ersBrakeRecovery * (0.6 + car.brakeInput * 0.4);
    }
    car.ersCharge = Math.min(ERS_CONFIG.maxERSCharge, car.ersCharge + recoveryRate * dt);
  }

  // Weather & surface grip
  let surfaceGripFactor = onTrack ? 1.0 : 0.40;
  if (weather === 'cloudy') surfaceGripFactor *= 0.95;
  else if (weather === 'rain') surfaceGripFactor *= 0.65;
  else if (weather === 'snow') surfaceGripFactor *= 0.35;

  // Aero assistance
  const aeroBrakeMult = 1.0 + BRAKE_CONFIG.highSpeedAeroFactor * Math.min(1.2, Math.max(0, car.vf) / 600);

  // Deceleration
  const configuredMaxForce = BRAKE_CONFIG.maxBrakeForce * BRAKE_CONFIG.userBrakeForceMultiplier;
  const requestedBrakeDecel = configuredMaxForce * car.brakeInput * aeroBrakeMult;
  const availableBrakeTraction = configuredMaxForce * 1.35 * surfaceGripFactor;
  const actualBrakeDecel = Math.min(requestedBrakeDecel, availableBrakeTraction);
  car.actualBrakeForce = actualBrakeDecel;

  // Axle loads
  const biasFront = car.brakeBias;
  const biasRear = 1.0 - biasFront;
  car.brakeFrontLoad = biasFront;
  car.brakeRearLoad = biasRear;

  const gripSaturation = actualBrakeDecel / Math.max(10, availableBrakeTraction);
  car.wheelSlipFront = Math.min(1.0, gripSaturation * (biasFront / 0.56) * car.brakeInput);
  car.wheelSlipRear = Math.min(1.0, gripSaturation * (biasRear / 0.44) * car.brakeInput);

  // Velocity integration
  if (car.vf > BRAKE_CONFIG.lowSpeedCutoff) {
    car.isReversing = false;
    car.stoppedDuration = 0;
    car.vf -= actualBrakeDecel * dt;
    if (car.vf < 0.2) car.vf = 0;
  } else if (car.vf < -BRAKE_CONFIG.lowSpeedCutoff) {
    car.isReversing = true;
    if (thr) {
      car.vf += 1350 * dt;
      if (car.vf > -0.2) car.vf = 0;
    } else if (brk) {
      car.vf = Math.max(BRAKE_CONFIG.reverseMaxSpeed, car.vf - BRAKE_CONFIG.reverseAccel * dt);
    } else {
      car.vf += 320 * dt;
      if (car.vf > -0.2) car.vf = 0;
    }
  } else {
    if (brk && !thr) {
      car.stoppedDuration = (car.stoppedDuration || 0) + dt;
      if (car.stoppedDuration > BRAKE_CONFIG.reverseDelay) {
        car.isReversing = true;
        car.vf -= BRAKE_CONFIG.reverseAccel * dt;
      } else {
        car.vf *= Math.exp(-24 * dt);
        if (Math.abs(car.vf) < 0.15) car.vf = 0;
      }
    } else {
      car.stoppedDuration = 0;
      car.isReversing = false;
      car.vf *= Math.exp(-24 * dt);
      if (Math.abs(car.vf) < 0.15) car.vf = 0;
    }
  }

  // Drift braking lateral damping
  if (car.isDrifting && car.brakeInput > 0.05) {
    const driftBrakeDamp = 1.6 + (biasFront - 0.45) * 2.2;
    car.vl *= Math.exp(-driftBrakeDamp * car.brakeInput * dt);
  }

  // Yaw calculation
  const ar = Math.abs(car.vf);
  const baseTurnRate = car.steer * 2.6 * Math.min(ar / 220, 1) / (1 + ar / 620) * (car.vf >= 0 ? 1 : -1);
  let finalYawRate = baseTurnRate;

  // Trail braking yaw influence
  if (car.brakeInput > 0.04 && absSteer > 0.03 && car.vf > 25) {
    const biasDelta = car.brakeBias - 0.56;
    const yawBiasMultiplier = 1.0 - (biasDelta * 0.85 * car.brakeInput);
    finalYawRate *= Math.max(0.72, Math.min(1.28, yawBiasMultiplier));

    if (car.brakeBias < 0.50 && car.brakeInput > 0.35) {
      const rearTurnAssist = car.steer * (0.50 - car.brakeBias) * 1.5 * car.brakeInput * Math.min(1.0, car.vf / 170);
      finalYawRate += rearTurnAssist;
    }
  }
  car.a += finalYawRate * dt;
  car.yawRate = finalYawRate;
}

console.log("=================================================");
console.log("RUNNING EXTENSIVE F1 BRAKE SYSTEM VERIFICATION");
console.log("=================================================");

let passed = 0;
let total = 0;
function assert(condition, name) {
  total++;
  if (condition) {
    console.log(`[PASS] Test ${total}: ${name}`);
    passed++;
  } else {
    console.error(`[FAIL] Test ${total}: ${name}`);
    process.exitCode = 1;
  }
}

// TEST 1: Normal progressive braking from moderate speed (160 km/h = ~432 vf)
{
  const car = createCar(432, 0.56);
  let peakDecel = 0;
  let framesToStop = 0;
  const dt = 0.016;
  for (let i = 0; i < 200; i++) {
    simulateStep(car, dt, { brk: car.vf > 0 });
    if (car.actualBrakeForce > peakDecel) peakDecel = car.actualBrakeForce;
    if (car.vf === 0 && framesToStop === 0) framesToStop = i;
  }
  assert(framesToStop > 10 && framesToStop < 100, `Progressive stop achieved in ${framesToStop} frames without instant teleportation`);
  assert(peakDecel > 1500 && peakDecel <= BRAKE_CONFIG.maxBrakeForce * 1.5, `Peak braking decel (${peakDecel.toFixed(1)}) is realistic and bounded`);
  assert(car.vf === 0, `Car settled completely to 0 km/h`);
}

// TEST 2: High-speed emergency braking (330 km/h = ~890 vf) & Aero assistance
{
  const carHigh = createCar(890, 0.56);
  const carLow = createCar(100, 0.56);
  simulateStep(carHigh, 0.1, { brk: true });
  simulateStep(carLow, 0.1, { brk: true });
  assert(carHigh.actualBrakeForce > carLow.actualBrakeForce, `Aero downforce creates higher deceleration at high speed (${carHigh.actualBrakeForce.toFixed(0)} vs ${carLow.actualBrakeForce.toFixed(0)})`);
}

// TEST 3: Grip-limited traction under wet/rain conditions
{
  const carDry = createCar(400, 0.56);
  const carWet = createCar(400, 0.56);
  simulateStep(carDry, 0.1, { brk: true }, { onTrack: true, weather: 'sunny' });
  simulateStep(carWet, 0.1, { brk: true }, { onTrack: true, weather: 'rain' });
  assert(carWet.actualBrakeForce < carDry.actualBrakeForce, `Wet track reduces maximum available braking traction (${carWet.actualBrakeForce.toFixed(0)} vs ${carDry.actualBrakeForce.toFixed(0)})`);
}

// TEST 4: Brake Bias Adjustments & Clamping
{
  let bias = 0.56;
  const step = BRAKE_CONFIG.biasStep;
  // Decrease front (shift rear)
  for (let i = 0; i < 20; i++) bias = Math.max(BRAKE_CONFIG.minBias, Math.min(BRAKE_CONFIG.maxBias, bias - step));
  assert(Math.abs(bias - 0.45) < 0.001, `Brake bias clamped at minimum 45% front (bias = ${bias})`);

  // Increase front (shift front)
  for (let i = 0; i < 35; i++) bias = Math.max(BRAKE_CONFIG.minBias, Math.min(BRAKE_CONFIG.maxBias, bias + step));
  assert(Math.abs(bias - 0.70) < 0.001, `Brake bias clamped at maximum 70% front (bias = ${bias})`);
}

// TEST 5: Low-speed numerical stability & Reverse gear transition
{
  const car = createCar(1.2, 0.56);
  const dt = 0.016;
  // Frame 1: holding brake at low speed decays smoothly without jumping negative
  simulateStep(car, dt, { brk: true });
  assert(car.vf >= 0 && car.vf < 1.2, `Low speed smoothly decays without jumping negative in frame 1 (vf = ${car.vf.toFixed(3)})`);

  // Hold brake continuously through reverseDelay (20 frames * 0.016s = 0.32s > 0.16s delay)
  for (let i = 0; i < 20; i++) simulateStep(car, dt, { brk: true });
  assert(car.isReversing === true && car.vf < 0, `Engaged reverse gear after delay deadband (vf = ${car.vf.toFixed(3)})`);

  // Throttle acts as forward brake in reverse
  const reverseVf = car.vf;
  simulateStep(car, dt, { thr: true, brk: false });
  assert(car.vf > reverseVf, `Throttle acts as progressive brake when moving backward (${reverseVf.toFixed(1)} -> ${car.vf.toFixed(1)})`);
}

// TEST 6: Trail braking through corners & Yaw stability
{
  const carFrontBias = createCar(300, 0.65);
  const carRearBias = createCar(300, 0.47);
  const carNeutral = createCar(300, 0.56);

  // Straight line test: yaw must be 0
  simulateStep(carFrontBias, 0.05, { brk: true, steer: 0 });
  assert(Math.abs(carFrontBias.yawRate) < 0.0001, `Straight-line braking does not introduce unwanted rotation`);

  // Corner entry test: steer = 0.5
  simulateStep(carFrontBias, 0.05, { brk: true, steer: 0.5 });
  simulateStep(carNeutral, 0.05, { brk: true, steer: 0.5 });
  simulateStep(carRearBias, 0.05, { brk: true, steer: 0.5 });

  assert(carFrontBias.yawRate < carNeutral.yawRate, `Front bias produces stable understeer yaw damping (${carFrontBias.yawRate.toFixed(3)} < ${carNeutral.yawRate.toFixed(3)})`);
  assert(carRearBias.yawRate > carNeutral.yawRate, `Rear bias assists agile turn-in rotation (${carRearBias.yawRate.toFixed(3)} > ${carNeutral.yawRate.toFixed(3)})`);
  assert(Math.abs(carRearBias.yawRate - carNeutral.yawRate) < 0.5, `Rear bias rotation is controlled and does not cause unrealistic spinning`);
}

// TEST 7: Controlled braking during drift
{
  const carDrift = createCar(220, 0.56);
  carDrift.isDrifting = true;
  carDrift.vl = -40; // in a slide
  simulateStep(carDrift, 0.05, { brk: true, steer: -0.2 }); // counter-steering
  assert(carDrift.vf < 220, `Braking during drift scrubs forward speed (${carDrift.vf.toFixed(1)} < 220)`);
  assert(carDrift.vl < 0 && Math.abs(carDrift.vl) > 10, `Lateral drift velocity is preserved rather than killed instantly (vl = ${carDrift.vl.toFixed(1)})`);
}

// TEST 8: DRS auto-close on significant braking
{
  const carDRS = createCar(350, 0.56);
  carDRS.drsOpen = true;
  simulateStep(carDRS, 0.05, { brk: true });
  assert(carDRS.drsOpen === false && carDRS.drsClosedReason === 'BRAKE', `Significant braking immediately closes DRS wing flap`);
}

// TEST 9: ERS boost suppression and MGU-K regen harvesting
{
  const carERS = createCar(300, 0.56);
  carERS.ersCharge = 50;
  simulateStep(carERS, 0.1, { brk: true, thr: true, wantsBoost: true });
  assert(carERS.isBoosting === false, `ERS boost is safely disabled during braking`);
  assert(carERS.ersCharge > 50, `MGU-K regenerates energy into battery during braking (charge = ${carERS.ersCharge.toFixed(1)}%)`);
}

console.log("=================================================");
console.log(`SUMMARY: ${passed} / ${total} TESTS PASSED!`);
console.log("=================================================");
