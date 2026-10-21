// Comprehensive verification test suite for F1 tire grip, temperature, and wear simulation

const TIRE_CONFIG = {
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
  userWearRateMultiplier: 1.0,
  brakeHeatingScalar: 30.0,
  corneringHeatingScalar: 25.0,
  driftHeatingScalar: 38.0,
  wheelspinHeatingScalar: 26.0,
  offTrackHeatingBonus: 1.40,
  rainCoolingMultiplier: 2.2,
  snowCoolingMultiplier: 2.8,
  driftWearMultiplier: 2.6,
  lockupWearMultiplier: 2.2
};

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

function calculateTireTempGrip(temp) {
  if (temp < TIRE_CONFIG.optimalTireTemperature) {
    if (temp >= TIRE_CONFIG.coldThresholdTemperature) return 1.0;
    const coldFraction = Math.min(1.0, (TIRE_CONFIG.coldThresholdTemperature - temp) / Math.max(1, TIRE_CONFIG.coldThresholdTemperature - TIRE_CONFIG.minTireTemperature));
    return 1.0 - (1.0 - TIRE_CONFIG.coldGripMultiplier) * (coldFraction * coldFraction);
  } else {
    if (temp <= TIRE_CONFIG.overheatThresholdTemperature) return 1.0;
    const hotFraction = Math.min(1.0, (temp - TIRE_CONFIG.overheatThresholdTemperature) / Math.max(1, TIRE_CONFIG.maxTireTemperature - TIRE_CONFIG.overheatThresholdTemperature));
    return 1.0 - (1.0 - TIRE_CONFIG.overheatGripMultiplier) * Math.sqrt(hotFraction);
  }
}

function calculateTireWearGrip(wear) {
  const w = Math.min(1.0, Math.max(0.0, wear));
  return 1.0 - (1.0 - TIRE_CONFIG.minimumGripMultiplier) * Math.pow(w, 1.6);
}

function createSimCar(initialVf = 0, initialTemp = 85.0, initialWear = 0.0) {
  const initGrip = calculateTireTempGrip(initialTemp) * calculateTireWearGrip(initialWear);
  return {
    vf: initialVf,
    vl: 0,
    a: 0,
    steer: 0,
    brakeInput: 0,
    brakeBias: 0.56,
    actualBrakeForce: 0,
    brakeFrontLoad: 0.56,
    brakeRearLoad: 0.44,
    wheelSlipFront: 0,
    wheelSlipRear: 0,
    isDrifting: false,
    driftIntensity: 0,
    drsOpen: false,
    ersCharge: 100,
    isBoosting: false,
    tires: {
      fl: { temp: initialTemp, wear: initialWear, grip: initGrip, slip: 0.0, load: 1.0 },
      fr: { temp: initialTemp, wear: initialWear, grip: initGrip, slip: 0.0, load: 1.0 },
      rl: { temp: initialTemp, wear: initialWear, grip: initGrip, slip: 0.0, load: 1.0 },
      rr: { temp: initialTemp, wear: initialWear, grip: initGrip, slip: 0.0, load: 1.0 },
      avgTemp: initialTemp,
      avgWear: initialWear,
      frontGrip: initGrip,
      rearGrip: initGrip,
      overallGrip: initGrip
    }
  };
}

function fitFreshTires(car) {
  const startingTemp = 85.0;
  const positions = ['fl', 'fr', 'rl', 'rr'];
  for (let p = 0; p < positions.length; p++) {
    const t = car.tires[positions[p]];
    t.temp = startingTemp;
    t.wear = 0.0;
    t.grip = 1.0;
    t.slip = 0.0;
  }
  car.tires.avgTemp = startingTemp;
  car.tires.avgWear = 0.0;
  car.tires.frontGrip = 1.0;
  car.tires.rearGrip = 1.0;
  car.tires.overallGrip = 1.0;
}

function stepTireSimulation(car, dt, inputs = {}, env = { onTrack: true, weather: 'sunny' }) {
  const { thr = false, brk = false, steer = 0, wantsBoost = false, isDrifting = false, driftIntensity = 0 } = inputs;
  const { onTrack = true, weather = 'sunny' } = env;

  car.steer = steer;
  const absSteer = Math.abs(car.steer);
  car.isDrifting = isDrifting;
  car.driftIntensity = driftIntensity;

  // Progressive brake input
  const targetBrakePedal = brk ? 1.0 : 0.0;
  const bRate = brk ? BRAKE_CONFIG.brakeResponse : BRAKE_CONFIG.brakeReleaseRate;
  car.brakeInput = (car.brakeInput || 0) + (targetBrakePedal - (car.brakeInput || 0)) * Math.min(1, bRate * dt);
  if (!brk && car.brakeInput < 0.005) car.brakeInput = 0;

  // Surface grip
  let surfaceGripFactor = onTrack ? 1.0 : 0.40;
  if (weather === 'cloudy') surfaceGripFactor *= 0.95;
  else if (weather === 'rain') surfaceGripFactor *= 0.65;
  else if (weather === 'snow') surfaceGripFactor *= 0.35;

  // Aero assistance
  const aeroBrakeMult = 1.0 + BRAKE_CONFIG.highSpeedAeroFactor * Math.min(1.2, Math.max(0, car.vf) / 600);

  // Tire thermodynamics and wear
  const ambientTemp = (weather === 'snow') ? 4.0 : ((weather === 'rain') ? 17.0 : ((weather === 'cloudy') ? 22.0 : TIRE_CONFIG.ambientTemperature));
  const coolingRate = TIRE_CONFIG.temperatureCoolingRate * (1.0 + Math.min(1.5, Math.abs(car.vf) / 220)) * ((weather === 'rain') ? TIRE_CONFIG.rainCoolingMultiplier : ((weather === 'snow') ? TIRE_CONFIG.snowCoolingMultiplier : 1.0));
  const offTrackHeatMult = !onTrack ? 1.4 : 1.0;
  const wearMult = TIRE_CONFIG.userWearRateMultiplier || 1.0;

  const latLoadTransfer = Math.max(-0.35, Math.min(0.35, car.steer * 0.35));
  const longLoadTransfer = (car.brakeInput * 0.25) - (thr ? 0.15 : 0);

  const flLoad = Math.max(0.4, Math.min(1.6, 1.0 + latLoadTransfer + longLoadTransfer));
  const frLoad = Math.max(0.4, Math.min(1.6, 1.0 - latLoadTransfer + longLoadTransfer));
  const rlLoad = Math.max(0.4, Math.min(1.6, 1.0 + latLoadTransfer - longLoadTransfer));
  const rrLoad = Math.max(0.4, Math.min(1.6, 1.0 - latLoadTransfer - longLoadTransfer));

  const frontBrakeHeat = (car.brakeInput * car.brakeFrontLoad * 42.0);
  const rearBrakeHeat = (car.brakeInput * car.brakeRearLoad * 42.0);
  const steerScrubHeat = absSteer * Math.min(1.4, Math.abs(car.vf) / 200) * TIRE_CONFIG.corneringHeatingScalar;
  const driveWheelspinHeat = (thr && Math.abs(car.vf) < 300 ? (1.0 - Math.min(1.0, Math.abs(car.vf) / 300)) * (car.isBoosting ? 1.8 : 1.0) * TIRE_CONFIG.wheelspinHeatingScalar : 0);
  const driftSlipHeat = (car.isDrifting ? (0.6 + car.driftIntensity * 0.8) * TIRE_CONFIG.driftHeatingScalar : 0) + (Math.abs(car.vl) / 60) * 14.0;

  const updateSingleTire = (tire, load, heatGen, slipWork) => {
    const netHeat = (heatGen * load * offTrackHeatMult * TIRE_CONFIG.temperatureGainRate) - ((tire.temp - ambientTemp) * coolingRate);
    tire.temp = Math.max(TIRE_CONFIG.minTireTemperature, Math.min(TIRE_CONFIG.maxTireTemperature, tire.temp + netHeat * dt));

    const wearWork = (slipWork + heatGen * 0.12) * load * (car.isDrifting ? TIRE_CONFIG.driftWearMultiplier : 1.0) * (!onTrack ? 1.5 : 1.0);
    const wearDelta = wearWork * TIRE_CONFIG.tireWearRate * wearMult * dt;
    tire.wear = Math.min(1.0, tire.wear + wearDelta);

    const targetTempGrip = calculateTireTempGrip(tire.temp);
    const targetWearGrip = calculateTireWearGrip(tire.wear);
    const targetGrip = Math.max(TIRE_CONFIG.minimumGripMultiplier, Math.min(1.05, targetTempGrip * targetWearGrip));
    tire.grip += (targetGrip - tire.grip) * Math.min(1.0, 10.0 * dt);
    tire.load = load;
  };

  updateSingleTire(car.tires.fl, flLoad, frontBrakeHeat + steerScrubHeat * 1.1, (car.wheelSlipFront || 0) + absSteer * 0.4);
  updateSingleTire(car.tires.fr, frLoad, frontBrakeHeat + steerScrubHeat * 1.1, (car.wheelSlipFront || 0) + absSteer * 0.4);
  updateSingleTire(car.tires.rl, rlLoad, rearBrakeHeat + driveWheelspinHeat + driftSlipHeat, (car.wheelSlipRear || 0) + (car.driftIntensity || 0) * 0.8);
  updateSingleTire(car.tires.rr, rrLoad, rearBrakeHeat + driveWheelspinHeat + driftSlipHeat, (car.wheelSlipRear || 0) + (car.driftIntensity || 0) * 0.8);

  car.tires.frontGrip = (car.tires.fl.grip + car.tires.fr.grip) * 0.5;
  car.tires.rearGrip = (car.tires.rl.grip + car.tires.rr.grip) * 0.5;
  car.tires.overallGrip = (car.tires.frontGrip + car.tires.rearGrip) * 0.5;
  car.tires.avgTemp = (car.tires.fl.temp + car.tires.fr.temp + car.tires.rl.temp + car.tires.rr.temp) * 0.25;
  car.tires.avgWear = (car.tires.fl.wear + car.tires.fr.wear + car.tires.rl.wear + car.tires.rr.wear) * 0.25;

  // Integrated braking traction
  const configuredMaxForce = BRAKE_CONFIG.maxBrakeForce * BRAKE_CONFIG.userBrakeForceMultiplier;
  const requestedBrakeDecel = configuredMaxForce * car.brakeInput * aeroBrakeMult;
  const availableBrakeTraction = configuredMaxForce * 1.20 * surfaceGripFactor * car.tires.overallGrip;
  const actualBrakeDecel = Math.min(requestedBrakeDecel, availableBrakeTraction);
  car.actualBrakeForce = actualBrakeDecel;

  // Integrated steering turning rate
  const ar = Math.abs(car.vf);
  const baseTurnRate = car.steer * 2.6 * car.tires.frontGrip * Math.min(ar / 220, 1) / (1 + ar / 620) * (car.vf >= 0 ? 1 : -1);
  car.yawRate = baseTurnRate;

  // Integrated lateral damping
  const baseNormalGrip = (onTrack ? DRIFT_CONFIG.normalGrip : 3.2) * car.tires.rearGrip;
  car.lateralGrip = baseNormalGrip;

  // Velocity update
  if (car.vf > 1.5) {
    car.vf -= actualBrakeDecel * dt;
    if (car.vf < 0.2) car.vf = 0;
  }
}

console.log("=================================================");
console.log("TESTING TIRE GRIP, TEMPERATURE & WEAR SIMULATION");
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

// 1. Cold tire grip reduction
{
  const coldGrip = calculateTireTempGrip(40.0);
  const optimalGrip = calculateTireTempGrip(95.0);
  assert(coldGrip < optimalGrip, `Cold tires (40°C) have reduced grip compared to optimal (${coldGrip.toFixed(2)} vs ${optimalGrip.toFixed(2)})`);
  assert(coldGrip >= TIRE_CONFIG.coldGripMultiplier, `Cold grip respects lower bound coldGripMultiplier (${coldGrip.toFixed(2)} >= ${TIRE_CONFIG.coldGripMultiplier})`);
}

// 2. Overheating tire grip degradation
{
  const hotGrip = calculateTireTempGrip(130.0);
  const optimalGrip = calculateTireTempGrip(95.0);
  assert(hotGrip < optimalGrip, `Overheated tires (130°C) have reduced grip compared to optimal (${hotGrip.toFixed(2)} vs ${optimalGrip.toFixed(2)})`);
  assert(hotGrip >= TIRE_CONFIG.overheatGripMultiplier, `Overheated grip respects lower bound overheatGripMultiplier (${hotGrip.toFixed(2)} >= ${TIRE_CONFIG.overheatGripMultiplier})`);
}

// 3. Optimal temperature window
{
  const grip85 = calculateTireTempGrip(85.0);
  const grip95 = calculateTireTempGrip(95.0);
  const grip105 = calculateTireTempGrip(105.0);
  assert(grip85 >= 0.99 && grip95 === 1.0 && grip105 >= 0.99, `Optimal temperature window (85°C - 105°C) yields peak ~100% grip (${grip85.toFixed(2)}, ${grip95.toFixed(2)}, ${grip105.toFixed(2)})`);
}

// 4. Tire heating under aggressive braking
{
  const car = createSimCar(400, 80.0, 0.0);
  const initialTemp = car.tires.fl.temp;
  for (let i = 0; i < 40; i++) stepTireSimulation(car, 0.016, { brk: true });
  assert(car.tires.fl.temp > initialTemp, `Heavy braking raises front tire temperature (${initialTemp.toFixed(1)}°C -> ${car.tires.fl.temp.toFixed(1)}°C)`);
}

// 5. Tire heating & load transfer during cornering
{
  const car = createSimCar(300, 85.0, 0.0);
  // Turning right (steer = +0.5) puts higher dynamic load on outside Left tires (FL & RL)
  for (let i = 0; i < 60; i++) stepTireSimulation(car, 0.016, { steer: 0.5 });
  assert(car.tires.fl.temp > car.tires.fr.temp, `Outside front tire (FL) heats more than inside (FR) during right turn (${car.tires.fl.temp.toFixed(1)}°C vs ${car.tires.fr.temp.toFixed(1)}°C)`);
}

// 6. Rear tire heating & wear during sustained drifting
{
  const car = createSimCar(220, 85.0, 0.0);
  const initialRearTemp = car.tires.rl.temp;
  const initialRearWear = car.tires.rl.wear;
  for (let i = 0; i < 60; i++) stepTireSimulation(car, 0.016, { isDrifting: true, driftIntensity: 0.8, steer: -0.3 });
  assert(car.tires.rl.temp > initialRearTemp + 5.0, `Sustained drifting significantly heats rear tires (${initialRearTemp.toFixed(1)}°C -> ${car.tires.rl.temp.toFixed(1)}°C)`);
  assert(car.tires.rl.wear > initialRearWear, `Sustained drifting accelerates rear tire wear (${(car.tires.rl.wear * 100).toFixed(2)}%)`);
}

// 7. Natural convective cooling when stopped or driving gently
{
  const car = createSimCar(0, 115.0, 0.0); // Hot tires stopped
  const hotTemp = car.tires.fl.temp;
  for (let i = 0; i < 100; i++) stepTireSimulation(car, 0.016, {});
  assert(car.tires.fl.temp < hotTemp, `Tires cool down toward ambient when stationary or driving gently (${hotTemp.toFixed(1)}°C -> ${car.tires.fl.temp.toFixed(1)}°C)`);
}

// 8. Wet surface extra cooling
{
  const carDry = createSimCar(250, 110.0, 0.0);
  const carRain = createSimCar(250, 110.0, 0.0);
  for (let i = 0; i < 80; i++) {
    stepTireSimulation(carDry, 0.016, {}, { onTrack: true, weather: 'sunny' });
    stepTireSimulation(carRain, 0.016, {}, { onTrack: true, weather: 'rain' });
  }
  assert(carRain.tires.fl.temp < carDry.tires.fl.temp, `Rain / wet track surface provides enhanced convective cooling (${carRain.tires.fl.temp.toFixed(1)}°C vs ${carDry.tires.fl.temp.toFixed(1)}°C)`);
}

// 9. Tire wear reduces available grip bounded by minimumGripMultiplier
{
  const freshGrip = calculateTireWearGrip(0.0);
  const halfGrip = calculateTireWearGrip(0.5);
  const wornGrip = calculateTireWearGrip(1.0);
  assert(freshGrip === 1.0, `Fresh tire (0% wear) provides 100% grip`);
  assert(halfGrip < freshGrip && halfGrip > wornGrip, `Half-worn tire (50% wear) provides intermediate grip (${halfGrip.toFixed(2)})`);
  assert(Math.abs(wornGrip - TIRE_CONFIG.minimumGripMultiplier) < 0.01, `Fully worn tire (100% wear) respects minimumGripMultiplier floor (${wornGrip.toFixed(2)} ~ ${TIRE_CONFIG.minimumGripMultiplier})`);
}

// 10. Front tire grip modulates steering yaw authority (understeer on cold/worn front tires)
{
  const carWarm = createSimCar(250, 95.0, 0.0);
  const carCold = createSimCar(250, 35.0, 0.0);
  stepTireSimulation(carWarm, 0.05, { steer: 0.5 });
  stepTireSimulation(carCold, 0.05, { steer: 0.5 });
  assert(carCold.yawRate < carWarm.yawRate, `Cold front tires reduce turn-in yaw rate causing realistic understeer (${carCold.yawRate.toFixed(3)} < ${carWarm.yawRate.toFixed(3)})`);
}

// 11. Tire grip limits maximum braking traction
{
  const carOptimal = createSimCar(300, 95.0, 0.0);
  const carWorn = createSimCar(300, 95.0, 0.85); // 85% worn
  for (let i = 0; i < 15; i++) {
    stepTireSimulation(carOptimal, 0.016, { brk: true });
    stepTireSimulation(carWorn, 0.016, { brk: true });
  }
  assert(carWorn.actualBrakeForce < carOptimal.actualBrakeForce, `Worn tires reduce maximum available braking deceleration (${carWorn.actualBrakeForce.toFixed(0)} < ${carOptimal.actualBrakeForce.toFixed(0)})`);
}

// 12. Rear tire grip modulates lateral stability without forcing phantom drift when straight
{
  const carStraight = createSimCar(250, 35.0, 0.8); // Cold & worn driving straight
  stepTireSimulation(carStraight, 0.05, { steer: 0 });
  assert(Math.abs(carStraight.yawRate) < 0.0001, `Low tire grip does not cause unwanted spinning or drift when driving straight`);
}

// 13. Pit stop / Tire replacement integration
{
  const car = createSimCar(100, 135.0, 0.75); // Worn & overheated
  fitFreshTires(car);
  assert(car.tires.avgWear === 0.0, `Pit stop resets tire wear to 0.0%`);
  assert(car.tires.avgTemp === 85.0, `Pit stop mounts pre-warmed fresh tires at 85°C optimal start`);
  assert(car.tires.overallGrip === 1.0, `Pit stop restores 100% tire grip`);
}

console.log("=================================================");
console.log(`SUMMARY: ${passed} / ${total} TIRE TESTS PASSED!`);
console.log("=================================================");
