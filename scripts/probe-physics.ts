// Physics probe (PLAN-v3 S6): drives updateCarPhysics directly and prints a table in the shape of PLAN-v3 §11.1.
//   npm run probe          (vite-node scripts/probe-physics.ts)
// The car runs on a "treadmill" along the longest straight of the active track: whenever it nears the end it is
// shifted back along the straight, so a single straight is enough for any run length. Pure measurement, no game state.

import { DRS_CONFIG } from '../lib/game/constants';
import { track } from '../lib/game/track';
import { KMH_PER_UNIT } from '../lib/game/units';
import { NEUTRAL_CONTROLS, type ControlState } from '../lib/game/controls';
import { createInitialCarState, findNearestTrackPoint, updateCarPhysics, type CarPhysicsState } from '../lib/game/physics';
import { getRacingLine } from '../lib/game/sim/racingLine';

import { aeroForces, createAeroForces } from '../lib/game/vehicle/aero';
import { CAR } from '../lib/game/vehicle/params';

const DT = 1 / 120; // the sim's fixed step
const M_PER_UNIT = KMH_PER_UNIT / 3.6; // 1 unit = 0.1 m (units.ts)
const G = 9.81; // m/s^2

const T = track.current;
const N = T.N;
const TRACK_LENGTH = T.length;
const lineLapTimeEstimate = getRacingLine().lapTimeEstimate;
/** Spline points as tuples, for the straight finder (probe code, not a hot path). */
const trackSplinePoints: [number, number][] = Array.from({ length: N }, (_, i) => [T.px[i], T.py[i]]);

// The back straight sits inside a DRS zone, but the treadmill moves the car through spline indices; lift the zone
// requirement for the probe only so DRS can be tested anywhere on the straight.
DRS_CONFIG.requireDrsZones = false;

interface Straight {
  i0: number;
  len: number; // units
  ux: number;
  uy: number;
}

/** Longest run of spline points that stays within `tol` units of its own chord. */
function findStraight(tol = 3): Straight {
  let best: Straight = { i0: 0, len: 0, ux: 1, uy: 0 };
  for (let i0 = 0; i0 < N; i0 += 4) {
    const p0 = trackSplinePoints[i0];
    let lastOk = 0;
    for (let k = 8; k < N / 2; k += 4) {
      const p1 = trackSplinePoints[(i0 + k) % N];
      const cx = p1[0] - p0[0];
      const cy = p1[1] - p0[1];
      const cl = Math.hypot(cx, cy);
      let ok = true;
      for (let j = 1; j < k; j += 2) {
        const q = trackSplinePoints[(i0 + j) % N];
        const dev = Math.abs((q[0] - p0[0]) * (cy / cl) - (q[1] - p0[1]) * (cx / cl));
        if (dev > tol) {
          ok = false;
          break;
        }
      }
      if (!ok) break;
      lastOk = k;
    }
    if (lastOk >= 8) {
      const p1 = trackSplinePoints[(i0 + lastOk) % N];
      const cl = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      if (cl > best.len) best = { i0, len: cl, ux: (p1[0] - p0[0]) / cl, uy: (p1[1] - p0[1]) / cl };
    }
  }
  return best;
}

const straight = findStraight();
const startPt = trackSplinePoints[straight.i0];

function newCar(): CarPhysicsState {
  const car = createInitialCarState(straight.i0, 0);
  car.x = startPt[0];
  car.y = startPt[1];
  car.a = Math.atan2(straight.uy, straight.ux);
  return car;
}

function setSpeed(car: CarPhysicsState, kmh: number) {
  const v = kmh / KMH_PER_UNIT;
  car.vx = Math.cos(car.a) * v;
  car.vy = Math.sin(car.a) * v;
}

function ctrl(patch: Partial<ControlState>): ControlState {
  return { ...NEUTRAL_CONTROLS, ...patch };
}

/** Shift the car back along the straight when it gets within 25 % of the end. */
function treadmill(car: CarPhysicsState) {
  const along = (car.x - startPt[0]) * straight.ux + (car.y - startPt[1]) * straight.uy;
  if (along > straight.len * 0.75) {
    const shift = straight.len * 0.5;
    car.x -= straight.ux * shift;
    car.y -= straight.uy * shift;
    car.idx = findNearestTrackPoint(car.x, car.y, straight.i0)[0];
  }
}

function step(car: CarPhysicsState, c: ControlState) {
  const r = updateCarPhysics(car, c, DT, 'sunny');
  treadmill(car);
  return r;
}

const speedKmh = (car: CarPhysicsState) => Math.hypot(car.vx, car.vy) * KMH_PER_UNIT;

// ---- Straight-line acceleration -------------------------------------------------------------------------------------
interface AccelResult {
  t100: number | null;
  t200: number | null;
  t300: number | null;
  top: number;
  gears: number;
  maxRpm: number;
}

function accelRun(opts: { drs: boolean; ers: boolean; seconds: number }): AccelResult {
  const car = newCar();
  const res: AccelResult = { t100: null, t200: null, t300: null, top: 0, gears: 0, maxRpm: 0 };
  const steps = Math.round(opts.seconds / DT);
  for (let i = 0; i < steps; i++) {
    step(car, ctrl({ throttle: 1, ersBoost: opts.ers, drsToggleRequested: opts.drs && !car.drsOpen }));
    const v = speedKmh(car);
    const t = (i + 1) * DT;
    if (res.t100 === null && v >= 100) res.t100 = t;
    if (res.t200 === null && v >= 200) res.t200 = t;
    if (res.t300 === null && v >= 300) res.t300 = t;
    res.top = Math.max(res.top, v);
    if (typeof car.gear === 'number') res.gears = Math.max(res.gears, car.gear);
    res.maxRpm = Math.max(res.maxRpm, car.rpm);
  }
  return res;
}

// ---- Braking ---------------------------------------------------------------------------------------------------------
interface BrakeResult {
  fromKmh: number;
  time: number;
  distM: number;
  peakG: number;
}

function brakeRun(fromKmh: number, toKmh: number): BrakeResult {
  const car = newCar();
  setSpeed(car, fromKmh);
  // Let brake pedal ramp be part of the measurement (it is part of the game); warm the thermal state for a fair run.
  let t = 0;
  let dist = 0;
  let peak = 0;
  let prev = speedKmh(car);
  while (speedKmh(car) > toKmh && t < 20) {
    step(car, ctrl({ brake: 1 }));
    const v = speedKmh(car);
    dist += (v / 3.6) * DT;
    peak = Math.max(peak, ((prev - v) / 3.6 / DT) / G);
    prev = v;
    t += DT;
  }
  return { fromKmh, time: t, distM: dist, peakG: peak };
}

// ---- Steady lateral acceleration (full lock) -------------------------------------------------------------------------
interface LateralResult {
  kmh: number;
  g: number;
  offTrack: boolean;
}

function lateralRun(kmh: number): LateralResult {
  const car = newCar();
  setSpeed(car, kmh);
  car.steer = 1; // skip the steering ramp: measure the limit, not the transient
  let offTrack = false;
  const start = Math.round(0.35 / DT);
  const end = Math.round(0.55 / DT);
  let course0 = 0;
  let speedSum = 0;
  for (let i = 0; i <= end; i++) {
    // Hold speed with a simple P controller so the grip limit is read at the requested speed.
    const err = kmh - speedKmh(car);
    const c = ctrl({ steer: 1, throttle: Math.max(0, Math.min(1, 0.5 + err * 0.1)), brake: err < -2 ? Math.min(1, -err * 0.05) : 0 });
    const r = step(car, c);
    if (!r.onTrack) offTrack = true;
    const course = Math.atan2(car.vy, car.vx);
    if (i === start) course0 = course;
    if (i > start) speedSum += Math.hypot(car.vx, car.vy);
  }
  const course1 = Math.atan2(car.vy, car.vx);
  let dCourse = course1 - course0;
  while (dCourse > Math.PI) dCourse -= 2 * Math.PI;
  while (dCourse < -Math.PI) dCourse += 2 * Math.PI;
  const omega = Math.abs(dCourse) / ((end - start) * DT); // rad/s
  const vMean = (speedSum / (end - start)) * M_PER_UNIT; // m/s
  return { kmh, g: (omega * vMean) / G, offTrack };
}

// ---- Report ----------------------------------------------------------------------------------------------------------
function band(value: number | null, lo: number, hi: number): string {
  if (value === null) return 'NOT REACHED';
  return value >= lo && value <= hi ? 'in band' : value < lo ? 'BELOW' : 'ABOVE';
}
const f = (v: number | null, d = 2) => (v === null ? 'n/a' : v.toFixed(d));

const plain = accelRun({ drs: false, ers: false, seconds: 60 });
const drs = accelRun({ drs: true, ers: false, seconds: 60 });
const drsErs = accelRun({ drs: true, ers: true, seconds: 60 });
const brake = plain.top >= 300 ? brakeRun(300, 80) : brakeRun(Math.floor(plain.top), 80);
const lat = [100, 200, 300].map(lateralRun);
const lengthM = TRACK_LENGTH * M_PER_UNIT;

const aeroCheck = createAeroForces();
aeroForces(250 / 3.6, { drs: false, draft: 0, dirtyAir: 0 }, aeroCheck);
const downforce250Ratio = aeroCheck.downforce / (CAR.massKg * G);

const rows: [string, string, string, string][] = [
  ['Track length (m)', f(lengthM, 0), '5125', band(lengthM, 5125 * 0.995, 5125 * 1.005)],
  ['0-100 km/h (s)', f(plain.t100), '2.4-3.0', band(plain.t100, 2.4, 3.0)],
  ['0-200 km/h (s)', f(plain.t200), '4.5-5.5', band(plain.t200, 4.5, 5.5)],
  ['0-300 km/h (s)', f(plain.t300), '(none)', plain.t300 === null ? 'not reached' : 'reached'],
  ['Top speed no DRS (km/h)', f(plain.top, 0), '315-330', band(plain.top, 315, 330)],
  ['Top speed DRS (km/h)', f(drs.top, 0), '325-340', band(drs.top, 325, 340)],
  ['Top speed DRS+ERS (km/h)', f(drsErs.top, 0), '330-350', band(drsErs.top, 330, 350)],
  [`${brake.fromKmh}->80 km/h braking time (s)`, f(brake.time), '1.6-2.2', band(brake.time, 1.6, 2.2)],
  [`${brake.fromKmh}->80 km/h braking distance (m)`, f(brake.distM, 0), '80-120', band(brake.distM, 80, 120)],
  [`Peak braking decel from ${brake.fromKmh} (g)`, f(brake.peakG), '4.5-6', band(brake.peakG, 4.5, 6)],
  ['Lateral g at 100 km/h', f(lat[0].g) + (lat[0].offTrack ? ' (left track)' : ''), '2.0-2.6', band(lat[0].g, 2.0, 2.6)],
  ['Lateral g at 200 km/h', f(lat[1].g) + (lat[1].offTrack ? ' (left track)' : ''), '3.5-4.5', band(lat[1].g, 3.5, 4.5)],
  ['Lateral g at 300 km/h', f(lat[2].g) + (lat[2].offTrack ? ' (left track)' : ''), '4.5-5.5', band(lat[2].g, 4.5, 5.5)],
  ['Gears (max reached)', String(plain.gears), '8', plain.gears === 8 ? 'in band' : 'differs'],
  ['Max rpm', f(plain.maxRpm, 0), '~15000', band(plain.maxRpm, 14000, 15500)],
  ['Downforce at 250 km/h (x weight)', f(downforce250Ratio), '1.5-2.2', band(downforce250Ratio, 1.5, 2.2)],
  ['Racing-line lap estimate (s)', f(lineLapTimeEstimate, 1), '84-92', band(lineLapTimeEstimate, 84, 92)],
];

const w = [Math.max(...rows.map((r) => r[0].length)), 16, 10, 14];
const pad = (s: string, n: number) => s.padEnd(n);
console.log(`\nPhysics probe  (straight: idx ${straight.i0}, ${(straight.len * M_PER_UNIT).toFixed(0)} m, treadmill; 1 unit = ${M_PER_UNIT.toFixed(5)} m)\n`);
console.log([pad('Metric', w[0]), pad('Measured', w[1]), pad('Target', w[2]), 'Verdict'].join('  '));
console.log('-'.repeat(w[0] + w[1] + w[2] + 14 + 6));
for (const r of rows) console.log([pad(r[0], w[0]), pad(r[1], w[1]), pad(r[2], w[2]), r[3]].join('  '));
console.log('');
