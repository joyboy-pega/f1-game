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
