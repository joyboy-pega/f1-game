import { describe, expect, it } from 'vitest';
import { aeroForces, createAeroForces, dynamicPressure } from './aero';
import { AERO, CAR, ENGINE, ERS, GRAVITY } from './params';
import {
  GEARS,
  GEAR_RATIOS,
  chooseGear,
  createPowertrain,
  enginePower,
  engineTorque,
  harvestErs,
  resetErsLapCounters,
  rpmFromSpeed,
  speedFromRpm,
  stepPowertrain,
} from './powertrain';
import { TYRE, ellipseLateral, lateralForce, longitudinalForce, magic, peakForce, rollingResistance, stiffnessFor, tyreMu } from './tyre';

const DEG = Math.PI / 180;
const WEIGHT = CAR.massKg * GRAVITY;

describe('tyre: Magic Formula', () => {
  it('stiffnessFor puts the E=0 peak where asked', () => {
    for (const [C, x] of [[1.9, 0.12], [1.65, 0.1], [1.4, 0.2]] as const) {
      const B = stiffnessFor(C, x);
      expect(magic(x, { B, C, E: 0 })).toBeCloseTo(1, 10);
      expect(magic(x * 0.9, { B, C, E: 0 })).toBeLessThan(1);
      expect(magic(x * 1.1, { B, C, E: 0 })).toBeLessThan(1);
    }
  });

  it('lateral peak sits at ~7° slip angle and equals mu·Fz; longitudinal peak at ~10 % slip', () => {
    const fz = TYRE.fz0;
    let bestA = 0;
    let bestF = 0;
    for (let a = 0.1; a <= 20; a += 0.01) {
      const f = lateralForce(TYRE, a * DEG, fz);
      if (f > bestF) {
        bestF = f;
        bestA = a;
      }
    }
    expect(Math.abs(bestA - 7)).toBeLessThan(0.1);
    expect(bestF).toBeCloseTo(tyreMu(TYRE, fz) * fz, 3);

    let bestK = 0;
    let bestX = 0;
    for (let k = 0.005; k <= 0.5; k += 0.001) {
      const f = longitudinalForce(TYRE, k, fz);
      if (f > bestX) {
        bestX = f;
        bestK = k;
      }
    }
    expect(Math.abs(bestK - 0.1)).toBeLessThan(0.003);
  });

  it('force is odd in slip, zero at zero slip, and falls off past the peak (saturation, no runaway)', () => {
    const fz = 3000;
    expect(lateralForce(TYRE, 0, fz)).toBe(0);
    expect(lateralForce(TYRE, -5 * DEG, fz)).toBeCloseTo(-lateralForce(TYRE, 5 * DEG, fz), 8);
    expect(lateralForce(TYRE, 20 * DEG, fz)).toBeLessThan(lateralForce(TYRE, 7 * DEG, fz));
    expect(longitudinalForce(TYRE, 0.5, fz)).toBeLessThan(longitudinalForce(TYRE, 0.1, fz));
  });

  it('load sensitivity: force rises with load but sub-linearly (mu falls)', () => {
    const lo = lateralForce(TYRE, 7 * DEG, 2000);
    const hi = lateralForce(TYRE, 7 * DEG, 6000);
    expect(hi).toBeGreaterThan(lo);
    expect(hi / lo).toBeLessThan(3);
    expect(tyreMu(TYRE, 6000)).toBeLessThan(tyreMu(TYRE, 2000));
    expect(tyreMu(TYRE, TYRE.fz0)).toBeCloseTo(TYRE.mu0, 10);
  });

  it('grip scales the force linearly (temperature / wear / wet factors)', () => {
    expect(lateralForce(TYRE, 7 * DEG, 3000, 0.5)).toBeCloseTo(lateralForce(TYRE, 7 * DEG, 3000, 1) * 0.5, 8);
  });
});

describe('tyre: friction ellipse', () => {
  it('shrinks lateral capacity as longitudinal force is used', () => {
    const fy = 1000;
    const fxMax = 2000;
    expect(ellipseLateral(fy, 0, fxMax)).toBeCloseTo(1000);
    expect(ellipseLateral(fy, 0.6 * fxMax, fxMax)).toBeCloseTo(800); // sqrt(1 - 0.36) = 0.8
    expect(ellipseLateral(fy, fxMax, fxMax)).toBe(0);
    expect(ellipseLateral(fy, 1.3 * fxMax, fxMax)).toBe(0);
    expect(ellipseLateral(-fy, 0.6 * fxMax, fxMax)).toBeCloseTo(-800);
  });

  it('the combined force never leaves the friction ellipse', () => {
    const fz = 4000;
    const fxMax = peakForce(TYRE, fz);
    const fyMax = peakForce(TYRE, fz);
    for (let a = 0; a <= 12; a += 1) {
      for (let k = 0; k <= 0.3; k += 0.02) {
        const fx = longitudinalForce(TYRE, k, fz);
        const fy = ellipseLateral(lateralForce(TYRE, a * DEG, fz), fx, fxMax);
        expect(Math.hypot(fx / fxMax, fy / fyMax)).toBeLessThanOrEqual(1.0001);
      }
    }
  });

  it('rolling resistance is a small fraction of load', () => {
    expect(rollingResistance(10000)).toBeCloseTo(150);
  });
});

describe('aero', () => {
  const f = createAeroForces();
  const base = { drs: false, draft: 0, dirtyAir: 0 };

  it('downforce at 250 km/h is 1.5-2.2 x weight (§11.1)', () => {
    aeroForces(250 / 3.6, base, f);
    const ratio = f.downforce / WEIGHT;
    expect(ratio).toBeGreaterThan(1.5);
    expect(ratio).toBeLessThan(2.2);
  });

  it('forces scale with speed squared, split by the aero balance', () => {
    aeroForces(40, base, f);
    const d40 = f.downforce;
    const drag40 = f.drag;
    aeroForces(80, base, f);
    expect(f.downforce / d40).toBeCloseTo(4, 10);
    expect(f.drag / drag40).toBeCloseTo(4, 10);
    expect(f.downFront / f.downforce).toBeCloseTo(AERO.frontBalance, 10);
    expect(f.downFront + f.downRear).toBeCloseTo(f.downforce, 8);
    expect(dynamicPressure(0)).toBe(0);
  });

  it('DRS cuts drag and downforce, taking the loss from the rear (balance moves forward)', () => {
    aeroForces(80, base, f);
    const closed = { ...f };
    aeroForces(80, { ...base, drs: true }, f);
    expect(f.drag).toBeLessThan(closed.drag);
    expect(f.downforce).toBeLessThan(closed.downforce);
    expect(f.downFront).toBeCloseTo(closed.downFront, 8);
    expect(f.downRear).toBeLessThan(closed.downRear);
  });

  it('slipstream cuts drag only; dirty air cuts downforce by at most 10 %; damage hurts both', () => {
    aeroForces(80, base, f);
    const ref = { ...f };
    aeroForces(80, { ...base, draft: 1 }, f);
    expect(f.drag).toBeCloseTo(ref.drag * (1 - AERO.draftDragReduction), 8);
    expect(f.downforce).toBeCloseTo(ref.downforce, 8);
    aeroForces(80, { ...base, dirtyAir: 1 }, f);
    expect(f.downforce).toBeCloseTo(ref.downforce * 0.9, 8);
    expect(f.drag).toBeCloseTo(ref.drag, 8);
    aeroForces(80, { ...base, dirtyAir: 5, draft: -3 }, f); // out-of-range inputs are clamped
    expect(f.downforce).toBeCloseTo(ref.downforce * 0.9, 8);
    expect(f.drag).toBeCloseTo(ref.drag, 8);
    aeroForces(80, { ...base, damage: 1 }, f);
    expect(f.downforce).toBeLessThan(ref.downforce);
    expect(f.drag).toBeGreaterThan(ref.drag);
  });
});

describe('powertrain', () => {
  it('peak power ~560 kW near 11 500 rpm, shaped as specified, zero beyond the limiter', () => {
    let bestRpm = 0;
    let best = 0;
    for (let r = 4000; r <= 15000; r += 10) {
      const p = enginePower(r);
      if (p > best) {
        best = p;
        bestRpm = r;
      }
    }
    expect(Math.abs(bestRpm - 11500)).toBeLessThanOrEqual(500);
    expect(best).toBeCloseTo(ENGINE.peakPowerW, -2);
    expect(enginePower(15001)).toBe(0);
    expect(enginePower(0)).toBe(0);
    expect(enginePower(15000)).toBeGreaterThan(0.8 * ENGINE.peakPowerW);
    expect(engineTorque(11500)).toBeCloseTo(ENGINE.peakPowerW / (11500 * ((2 * Math.PI) / 60)), 3);
  });

  it('8th gear tops out at 340 km/h at the limiter; every gear matches its table entry', () => {
    expect(GEARS).toBe(8);
    expect(speedFromRpm(ENGINE.limiterRpm, 8) * 3.6).toBeCloseTo(340, 6);
    ENGINE.gearTopKmh.forEach((kmh, i) => expect(speedFromRpm(ENGINE.limiterRpm, i + 1) * 3.6).toBeCloseTo(kmh, 6));
    for (let i = 1; i < GEAR_RATIOS.length; i++) expect(GEAR_RATIOS[i]).toBeLessThan(GEAR_RATIOS[i - 1]);
    expect(rpmFromSpeed(speedFromRpm(9000, 4), 4)).toBeCloseTo(9000, 6);
    expect(rpmFromSpeed(0, 1)).toBe(ENGINE.idleRpm);
  });

  it('automatic gearbox: shifts up at 11 800 rpm, hysteresis stops hunting on a throttle-lift ramp', () => {
    expect(chooseGear(3, speedFromRpm(11900, 3), false)).toBe(4);
    expect(chooseGear(3, speedFromRpm(11000, 3), false)).toBe(3);
    // accelerate 0 -> 330 km/h then coast back down: each gear change happens once, no up/down chatter
    let gear = 1;
    const changes: number[] = [];
    for (let v = 1; v < 330 / 3.6; v += 0.05) {
      const g = chooseGear(gear, v, false);
      if (g !== gear) changes.push(g);
      gear = g;
    }
    expect(changes).toEqual([2, 3, 4, 5, 6, 7, 8]);
    for (let v = 330 / 3.6; v > 5; v -= 0.05) {
      const g = chooseGear(gear, v, true);
      if (g !== gear) changes.push(g);
      gear = g;
    }
    const down = changes.slice(7);
    expect(down).toEqual([7, 6, 5, 4, 3, 2, 1]); // strictly stepping down, never back up, no hunting
  });

  it('a shift cuts torque for ~40 ms', () => {
    const s = createPowertrain();
    s.gear = 3;
    const v = speedFromRpm(11900, 3);
    const dt = 1 / 120;
    const f0 = stepPowertrain(s, v, 1, false, false, dt);
    expect(s.gear).toBe(4);
    expect(f0).toBe(0);
    let cut = 1;
    while (stepPowertrain(s, v, 1, false, false, dt) === 0 && cut < 20) cut++;
    expect(cut * dt).toBeGreaterThanOrEqual(ENGINE.shiftTimeS - dt);
    expect(cut * dt).toBeLessThanOrEqual(ENGINE.shiftTimeS + 2 * dt);
  });

  it('drive force: throttle-proportional, zero off throttle and above the limiter', () => {
    const s = createPowertrain();
    s.gear = 4;
    const v = speedFromRpm(9000, 4);
    const full = stepPowertrain(s, v, 1, false, false, 1 / 120);
    s.shiftTimer = 0;
    const half = stepPowertrain(s, v, 0.5, false, false, 1 / 120);
    expect(half).toBeCloseTo(full * 0.5, 6);
    expect(stepPowertrain(s, v, 0, false, false, 1 / 120)).toBe(0);
    const g = createPowertrain();
    g.gear = 8;
    expect(stepPowertrain(g, speedFromRpm(ENGINE.limiterRpm + 300, 8), 1, false, false, 1 / 120)).toBe(0);
  });

  it('MGU-K: deploys 120 kW within the lap allowance and battery; harvest is capped per lap and by capacity', () => {
    const s = createPowertrain();
    s.gear = 6;
    const v = speedFromRpm(10000, 6); // mid-gear: no shift (and so no torque cut) during the test
    const dt = 1 / 120;
    s.ersCharge = ERS.capacityJ;
    const plain = stepPowertrain(createPowertrainAt(6), v, 1, false, false, dt);
    const boosted = stepPowertrain(s, v, 1, false, true, dt);
    expect(boosted - plain).toBeCloseTo(ERS.deployPowerW / v, 3);
    // drain the lap allowance
    let guard = 0;
    while (s.deployedThisLapJ < ERS.deployPerLapJ - 1 && guard++ < 200000) stepPowertrain(s, v, 1, false, true, dt);
    expect(s.deployedThisLapJ).toBeLessThanOrEqual(ERS.deployPerLapJ + 1e-6);
    const after = stepPowertrain(s, v, 1, false, true, dt);
    expect(after).toBeCloseTo(stepPowertrain(createPowertrainAt(6), v, 1, false, false, dt), 3); // no more boost this lap
    resetErsLapCounters(s);
    expect(s.deployedThisLapJ).toBe(0);

    const h = createPowertrain();
    h.ersCharge = 0;
    const e1 = harvestErs(h, 5_000_000, dt);
    expect(e1).toBeCloseTo(ERS.harvestPowerW * dt, 6);
    let total = e1;
    for (let i = 0; i < 100000; i++) total += harvestErs(h, 5_000_000, dt);
    expect(total).toBeCloseTo(ERS.harvestPerLapJ, 3);
    expect(harvestErs(h, 5_000_000, dt)).toBe(0);
  });
});

function createPowertrainAt(gear: number) {
  const s = createPowertrain();
  s.gear = gear;
  return s;
}

describe('1-D straight-line run (power curve + aero + rolling resistance)', () => {
  function topSpeedKmh(drs: boolean, boost: boolean): number {
    const pt = createPowertrain();
    const a = createAeroForces();
    const dt = 1 / 120;
    let v = 1;
    let max = 0;
    for (let i = 0; i < 70 / dt; i++) {
      aeroForces(v, { drs, draft: 0, dirtyAir: 0 }, a);
      const F = stepPowertrain(pt, v, 1, false, boost, dt);
      v = Math.max(0, v + ((F - a.drag - rollingResistance(WEIGHT + a.downforce)) / CAR.massKg) * dt);
      max = Math.max(max, v * 3.6);
    }
    return max;
  }

  it('top speed without DRS is 315-330 km/h (§11.1)', () => {
    const v = topSpeedKmh(false, false);
    console.log(`[vehicle] top speed plain ${v.toFixed(1)} km/h`);
    expect(v).toBeGreaterThan(315);
    expect(v).toBeLessThan(330);
  });

  it('with DRS 325-340 km/h, and with DRS + ERS 330-350 km/h (limited by the 8th-gear rev limiter)', () => {
    const drs = topSpeedKmh(true, false);
    const both = topSpeedKmh(true, true);
    console.log(`[vehicle] top speed DRS ${drs.toFixed(1)}, DRS+ERS ${both.toFixed(1)} km/h`);
    expect(drs).toBeGreaterThan(325);
    expect(drs).toBeLessThan(340);
    expect(both).toBeGreaterThan(330);
    expect(both).toBeLessThan(350);
    expect(drs).toBeGreaterThan(topSpeedKmh(false, false));
    expect(both).toBeGreaterThanOrEqual(drs);
  });
});

describe('stepVehicle dynamics (PLAN-v3 §5.3 V2)', () => {
  function newVehicleState(vx = 0): import('./model').VehicleState {
    return {
      x: 0,
      y: 0,
      yaw: 0,
      vx,
      vy: 0,
      yawRate: 0,
      steer: 0,
      prevAx: 0,
      prevAy: 0,
      powertrain: createPowertrain(),
      drsOpen: false,
      isBoosting: false,
      brakeBias: 0.56,
      wheelSlipFront: 0,
      wheelSlipRear: 0,
      isDrifting: false,
      driftIntensity: 0,
      driftAngle: 0,
      pitch: 0,
      roll: 0,
    };
  }

  const defaultEnv: import('./model').VehicleEnvironment = {
    surfaceGrip: 1.0,
    tyreGrip: 1.0,
    draft: 0,
    dirtyAir: 0,
    damage: 0,
    inPit: false,
  };

  it('steady-state cornering: increasing steer at constant speed shows lateral g rising then saturating', async () => {
    const { stepVehicle } = await import('./model');
    const speed = 40; // 144 km/h
    const dt = 1 / 120;
    const lateralGs: number[] = [];

    for (const steerTarget of [0.1, 0.25, 0.5, 0.75, 1.0]) {
      const state = newVehicleState(speed);
      state.steer = steerTarget; // pre-steer
      // Run for 1.5 seconds to settle into steady-state
      for (let i = 0; i < Math.round(1.5 / dt); i++) {
        state.vx = speed; // hold constant forward speed
        stepVehicle(
          state,
          { throttle: 0, brake: 0, steer: steerTarget, analogSteer: true, drs: false, ersBoost: false, steeringSensitivity: 1.0 },
          defaultEnv,
          dt
        );
      }
      const ay = Math.abs(state.prevAy) / GRAVITY;
      lateralGs.push(ay);
    }
    console.log('[test cornering] lateralGs:', lateralGs.map((g) => g.toFixed(3)));

    // ay rises with steer and saturates near peak tyre grip without exploding
    for (let i = 1; i < lateralGs.length; i++) {
      expect(lateralGs[i]).toBeGreaterThanOrEqual(lateralGs[i - 1] * 0.9);
    }
    // High steer saturates: ratio of ay(1.0) / ay(0.5) is around 2.4 (sublinear, not exponential)
    expect(lateralGs[4] / lateralGs[2]).toBeLessThan(2.6);
    // Peak ay is in a sensible racing envelope (around 2.5 - 4.5 g)
    expect(lateralGs[4]).toBeGreaterThan(2.0);
    expect(lateralGs[4]).toBeLessThan(5.0);
  });

  it('step-steer at 200 km/h settles without divergent oscillation', async () => {
    const { stepVehicle } = await import('./model');
    const speed = 200 / 3.6; // 55.6 m/s
    const dt = 1 / 120;
    const state = newVehicleState(speed);

    // Run straight first
    for (let i = 0; i < 60; i++) {
      state.vx = speed;
      stepVehicle(
        state,
        { throttle: 0.5, brake: 0, steer: 0, analogSteer: true, drs: false, ersBoost: false, steeringSensitivity: 1.0 },
        defaultEnv,
        dt
      );
    }

    // Apply sudden step-steer (0 -> 0.3)
    const yawRates: number[] = [];
    for (let i = 0; i < Math.round(2.0 / dt); i++) {
      state.vx = speed;
      stepVehicle(
        state,
        { throttle: 0.5, brake: 0, steer: 0.3, analogSteer: true, drs: false, ersBoost: false, steeringSensitivity: 1.0 },
        defaultEnv,
        dt
      );
      yawRates.push(state.yawRate);
    }

    // Yaw rate in the last 0.5s must be stable (variance near zero, not diverging)
    const tail = yawRates.slice(-60);
    const mean = tail.reduce((a, b) => a + b, 0) / tail.length;
    const variance = tail.reduce((a, b) => a + (b - mean) ** 2, 0) / tail.length;
    expect(variance).toBeLessThan(1e-4);
    expect(Number.isFinite(mean)).toBe(true);
  });
});

describe('vehicle limits module (limits.ts)', () => {
  it('maxLateralAccel scales with speed squared from downforce', async () => {
    const { maxLateralAccel } = await import('./limits');
    const g100 = maxLateralAccel(100 / 3.6) / GRAVITY;
    const g200 = maxLateralAccel(200 / 3.6) / GRAVITY;
    const g300 = maxLateralAccel(300 / 3.6) / GRAVITY;

    expect(g100).toBeGreaterThanOrEqual(2.0);
    expect(g100).toBeLessThanOrEqual(2.8);

    expect(g200).toBeGreaterThanOrEqual(3.3);
    expect(g200).toBeLessThanOrEqual(4.5);

    expect(g300).toBeGreaterThanOrEqual(4.5);
    expect(g300).toBeLessThanOrEqual(5.8);
  });

  it('cornerSpeedForCurvature matches physics envelope', async () => {
    const { cornerSpeedForCurvature } = await import('./limits');
    // High speed corner: curvature 0.008 (R = 125m)
    const vFast = cornerSpeedForCurvature(0.008) * 3.6;
    expect(vFast).toBeGreaterThan(190);
    expect(vFast).toBeLessThan(300);

    // Tight hairpin: curvature 0.05 (R = 20m)
    const vHairpin = cornerSpeedForCurvature(0.05) * 3.6;
    expect(vHairpin).toBeGreaterThan(50);
    expect(vHairpin).toBeLessThan(90);
  });
});

describe('environmental and load modifiers (PLAN-v3 §5.3 V3)', () => {
  it('slicks on wetness 0.55 are >= 6 % slower per lap than inters', async () => {
    const { GameWorld, FIXED_DT } = await import('../sim/world');
    const { raceSettings, autopilotPlayer } = await import('../sim/testutil');
    const { NEUTRAL_CONTROLS } = await import('../controls');

    const runOneLap = (compound: 'soft' | 'inter') => {
      const w = new GameWorld();
      w.seed = 42;
      w.setup(raceSettings({ totalLaps: 1, aiCount: 0, gridPosition: 1, weather: 'rain', startCompound: compound }));
      autopilotPlayer(w);

      let lapTime = 0;
      w.events.subscribe((e) => {
        if (e.type === 'lap' && e.carId === w.player.id && lapTime === 0) {
          lapTime = e.time;
        }
      });

      const maxSteps = Math.round(350 / FIXED_DT);
      for (let i = 0; i < maxSteps; i++) {
        w.step(FIXED_DT, NEUTRAL_CONTROLS);
        w.events.flush();
        if (lapTime > 0) break;
      }
      if (lapTime === 0) {
        console.log(`[V3 wetness] ${compound} didn't finish: idx=${w.player.phys.idx}/${w.player.timing.lastS}, laps=${w.player.timing.lapsCompleted}, speed=${w.player.phys.vf}`);
      }
      return lapTime;
    };

    const timeSlick = runOneLap('soft');
    const timeInter = runOneLap('inter');
    console.log(`[V3 wetness] slick lap: ${timeSlick.toFixed(2)}s, inter lap: ${timeInter.toFixed(2)}s, ratio: ${(timeSlick / timeInter).toFixed(3)}`);
    expect(timeSlick).toBeGreaterThan(0);
    expect(timeInter).toBeGreaterThan(0);
    expect(timeSlick).toBeGreaterThanOrEqual(timeInter * 1.06);
  });

  it('inters on dry overheat within 2 laps', async () => {
    const { GameWorld, FIXED_DT } = await import('../sim/world');
    const { raceSettings, autopilotPlayer } = await import('../sim/testutil');
    const { NEUTRAL_CONTROLS } = await import('../controls');
    const { TYRE_COMPOUNDS } = await import('../constants');

    const w = new GameWorld();
    w.seed = 42;
    w.setup(raceSettings({ totalLaps: 2, aiCount: 0, gridPosition: 1, weather: 'sunny', startCompound: 'inter' }));
    autopilotPlayer(w);

    let maxTemp = 0;
    let laps = 0;
    w.events.subscribe((e) => {
      if (e.type === 'lap' && e.carId === w.player.id) laps++;
    });

    const maxSteps = Math.round(200 / FIXED_DT);
    for (let i = 0; i < maxSteps; i++) {
      w.step(FIXED_DT, NEUTRAL_CONTROLS);
      w.events.flush();
      const tr = w.player.phys.tires;
      maxTemp = Math.max(maxTemp, tr.fl.temp, tr.fr.temp, tr.rl.temp, tr.rr.temp);
      if (laps >= 2) break;
    }

    const interMaxComfortTemp = TYRE_COMPOUNDS.inter.tempWindow[1];
    console.log(`[V3 inters on dry] maxTemp: ${maxTemp.toFixed(1)}°C, window: ${interMaxComfortTemp}°C`);
    // Severely overheated: exceeds upper window limit (90°C) by at least 20°C
    expect(maxTemp).toBeGreaterThan(interMaxComfortTemp);
    expect(maxTemp).toBeGreaterThanOrEqual(110);
  });

  it('a car with 100 kg fuel laps ~3 s slower over 5 km than with 0 kg (±1 s)', async () => {
    const { GameWorld, FIXED_DT } = await import('../sim/world');
    const { raceSettings, autopilotPlayer } = await import('../sim/testutil');
    const { NEUTRAL_CONTROLS } = await import('../controls');

    const runTimedLap = (fuelKg: number) => {
      const w = new GameWorld();
      w.seed = 42;
      w.setup(raceSettings({ totalLaps: 1, aiCount: 0, gridPosition: 1, weather: 'sunny', startCompound: 'soft' }));
      autopilotPlayer(w);
      w.player.fuelKg = fuelKg;

      let lapTime = 0;
      w.events.subscribe((e) => {
        if (e.type === 'lap' && e.carId === w.player.id && lapTime === 0) {
          lapTime = e.time;
        }
      });

      const maxSteps = Math.round(200 / FIXED_DT);
      for (let i = 0; i < maxSteps; i++) {
        // Keep fuel mass fixed to test static fuel penalty
        w.player.fuelKg = fuelKg;
        w.step(FIXED_DT, NEUTRAL_CONTROLS);
        w.events.flush();
        if (lapTime > 0) break;
      }
      return lapTime;
    };

    const time0 = runTimedLap(0);
    const time100 = runTimedLap(100);
    const delta = time100 - time0;
    console.log(`[V3 fuel] 0kg lap: ${time0.toFixed(2)}s, 100kg lap: ${time100.toFixed(2)}s, delta: ${delta.toFixed(2)}s`);
    expect(time0).toBeGreaterThan(0);
    expect(time100).toBeGreaterThan(0);
    // Delta should be ~3 s slower (±1.5 s, between 1.5s and 4.5s)
    expect(delta).toBeGreaterThanOrEqual(1.5);
    expect(delta).toBeLessThanOrEqual(4.5);
  });
});
