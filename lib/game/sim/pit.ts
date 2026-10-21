import { HW, N, PIT_LANE, TRACK_LENGTH, cumulativeS, tangents, type TyreCompound } from '../constants';
import { fitFreshTires } from '../physics';
import { arcDelta } from './ai';
import { lineOffset } from './racingLine';
import type { EventBus } from './events';
import { bestCompoundForWetness, compoundMismatch } from './tyres';
import type { WorldCar } from './types';

/**
 * Pit stops. A car with `pitRequest` that crosses PIT_LANE.entryIdx is taken over by this module
 * (the player too): it is driven along the pit lane under an 80 km/h limiter, stops in its own box,
 * gets fresh tyres, waits for a clear lane and rejoins at the exit.
 * Every car has its own box (by car id), so two cars can never share one.
 */

const SIDE = PIT_LANE.side;
/** Fast lane (nearer the track) and working lane (the boxes). */
export const FAST_LAT = SIDE * (PIT_LANE.laneOffset - 11);
export const BOX_LAT = SIDE * (PIT_LANE.laneOffset + 9);
const EXIT_LAT = SIDE * 30;
/** Slightly under the limit so the controller never trips the 80 km/h line. */
const LIMIT = (PIT_LANE.speedLimitKmh / 0.37) * 0.97;
const BOX_COUNT = 12;
const ENTRY_BLEND = 450;
const EXIT_BLEND = 650;

const ENTRY_S = cumulativeS[PIT_LANE.entryIdx];
const BOX_SPACING_IDX = (PIT_LANE.boxEndIdx - PIT_LANE.boxStartIdx) / BOX_COUNT;

export function boxIndexFor(carId: number): number {
  return Math.round(PIT_LANE.boxStartIdx + (carId + 0.5) * BOX_SPACING_IDX);
}

/** Signed spline-index distance to the pit entry, in (-N/2, N/2]. */
export function entryDelta(idx: number): number {
  return ((idx - PIT_LANE.entryIdx + N + N / 2) % N) - N / 2;
}

/** Arc length from the pit entry line to arc position s (wrap-aware, may be slightly negative). */
function arcFromEntry(s: number): number {
  let d = s - ENTRY_S;
  if (d < -TRACK_LENGTH / 4) d += TRACK_LENGTH;
  else if (d > (3 * TRACK_LENGTH) / 4) d -= TRACK_LENGTH;
  return d;
}

const EXIT_ARC = arcFromEntry(cumulativeS[PIT_LANE.exitIdx]);
const ss = (x: number) => {
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);

const COMPOUND_ORDER: TyreCompound[] = ['soft', 'medium', 'hard', 'inter', 'wet'];

export function togglePitRequest(car: WorldCar) {
  if (car.pit) return;
  car.pitRequest = !car.pitRequest;
}

export function cycleNextCompound(car: WorldCar) {
  const i = COMPOUND_ORDER.indexOf(car.nextCompound);
  car.nextCompound = COMPOUND_ORDER[(i + 1) % COMPOUND_ORDER.length];
}

export interface PitContext {
  cars: WorldCar[];
  raceTime: number;
  events: EventBus;
  rand: () => number;
  /** Track wetness 0..1 for the current weather. */
  wetness: number;
  isRace: boolean;
  totalLaps: number;
}

/** Called after physics each step; takes the car over when it crosses the pit entry with a request. */
export function checkPitEntry(car: WorldCar, idxBefore: number, ctx: PitContext) {
  if (car.pit || !car.pitRequest || car.timing.finished) return;
  if (car.phys.vf <= 0) return;
  if (entryDelta(idxBefore) < 0 && entryDelta(car.phys.idx) >= 0 && Math.abs(entryDelta(car.phys.idx)) < 30) {
    car.pit = {
      stage: 'enter',
      boxIdx: boxIndexFor(car.id),
      entryLateral: car.lateral,
      serviceLeft: 0,
      serviceTime: 0,
      fit: car.nextCompound,
      stationary: 0,
      enteredAt: ctx.raceTime,
    };
    car.inPit = true;
    car.drsAvailable = false;
    ctx.events.emit({ type: 'pitEnter', carId: car.id });
  }
}

function latTarget(car: WorldCar, sArc: number, boxArc: number): number {
  const pit = car.pit!;
  let lat = FAST_LAT;
  if (sArc < ENTRY_BLEND) lat = lerp(pit.entryLateral, FAST_LAT, ss(sArc / ENTRY_BLEND));
  if (pit.stage === 'approach' || pit.stage === 'service') lat = lerp(FAST_LAT, BOX_LAT, ss((sArc - (boxArc - 130)) / 70));
  else if (pit.stage === 'depart') lat = lerp(BOX_LAT, FAST_LAT, ss((sArc - (boxArc + 40)) / 70));
  if (sArc > EXIT_ARC - EXIT_BLEND) lat = lerp(lat, EXIT_LAT, ss((sArc - (EXIT_ARC - EXIT_BLEND)) / EXIT_BLEND));
  return lat;
}

/** Another pit car is in the fast lane close behind this box (unsafe to release). */
function laneBusyBehind(car: WorldCar, cars: WorldCar[]): boolean {
  for (const o of cars) {
    if (o === car || !o.pit || o.pit.stage === 'service') continue;
    const ds = arcDelta(o.timing.lastS, car.timing.lastS); // >0: o is behind me
    if (ds > -60 && ds < 260 && Math.abs(o.lateral - FAST_LAT) < 16) return true;
  }
  return false;
}

/**
 * Drives a car that is in the pit lane (writes `car.ctrl`). Returns true when the car has left the
 * pit lane and control goes back to the player / AI.
 */
export function driveInPit(car: WorldCar, ctx: PitContext, dt: number): boolean {
  const pit = car.pit!;
  const p = car.phys;
  const ctrl = car.ctrl;
  const v = Math.max(0, p.vf);
  const sArc = arcFromEntry(car.timing.lastS);
  const boxArc = arcFromEntry(cumulativeS[pit.boxIdx]);

  // ---- stage transitions -----------------------------------------------------------------
  if (pit.stage === 'enter' && sArc > boxArc - 330) pit.stage = 'approach';
  if (pit.stage === 'depart' && sArc > boxArc + 130) pit.stage = 'exit';

  let target = LIMIT;
  let hold = false;

  if (pit.stage === 'approach') {
    const dist = boxArc - sArc;
    target = Math.min(LIMIT, Math.sqrt(2 * 450 * Math.max(0, dist - 2)));
    if (dist < 6) target = 0;
    if (v < 6 && dist < 24 && dist > -30) {
      pit.stage = 'service';
      pit.serviceTime = 2.2 + ctx.rand() * 1.3 + (ctx.rand() < 0.12 ? 1.5 + ctx.rand() * 2.5 : 0);
      pit.serviceLeft = pit.serviceTime;
      pit.stationary = 0;
    }
  }

  if (pit.stage === 'service') {
    target = 0;
    hold = true;
    pit.stationary += dt;
    if (pit.serviceLeft > 0) pit.serviceLeft -= dt;
    else if (!laneBusyBehind(car, ctx.cars) || pit.stationary > pit.serviceTime + 8) {
      // Tyres go on at the end of the stop; they start cool and warm up on track.
      car.compound = pit.fit;
      fitFreshTires(p, 62 + ctx.rand() * 8);
      car.damage = 0;
      car.timing.pitStops++;
      car.nextCompound = pit.fit === 'soft' ? 'medium' : 'soft';
      ctx.events.emit({ type: 'pitExit', carId: car.id, compound: car.compound, stationaryTime: pit.stationary });
      pit.stage = 'depart';
    }
  }

  if (pit.stage === 'exit' && sArc > EXIT_ARC - 120) target = 520; // limiter ends before the exit line

  // ---- queue behind slower pit traffic -----------------------------------------------------
  for (const o of ctx.cars) {
    if (o === car || !o.pit) continue;
    const ds = arcDelta(car.timing.lastS, o.timing.lastS);
    if (ds > 0 && ds < 110 && Math.abs(o.lateral - car.lateral) < 14) {
      const ov = Math.max(0, o.phys.vf);
      target = Math.min(target, ds < 62 ? Math.max(0, ov - 30) : ov);
    }
  }

  // ---- lateral guidance: Stanley on the centreline heading with the lane offset as reference ----
  const idx = p.idx;
  const lat = latTarget(car, sArc, boxArc);
  const latAhead = latTarget(car, sArc + 60, boxArc);
  const slope = (latAhead - lat) / 60;
  const e = car.lateral - lat;
  const th = Math.atan2(tangents[idx][1], tangents[idx][0]);
  const velAng = v > 40 ? Math.atan2(p.vy, p.vx) : p.a;
  const want = th + Math.atan(slope) - Math.atan2(2.0 * e, v + 40);
  let herr = want - velAng;
  herr = Math.atan2(Math.sin(herr), Math.cos(herr));
  const vv = Math.max(v, 60);
  const yawPerSteer = (2.6 * Math.max(0.3, p.tires.frontGrip) * Math.min(vv / 220, 1)) / (1 + vv / 620);
  ctrl.steer = hold ? 0 : clamp((4.0 * herr) / yawPerSteer, -1, 1);
  ctrl.analogSteer = true;

  // ---- speed ---------------------------------------------------------------------------------
  if (hold) {
    ctrl.throttle = 0;
    ctrl.brake = 1;
  } else if (v > target + 3) {
    ctrl.throttle = 0;
    ctrl.brake = clamp((v - target) / 25, 0, 1);
  } else {
    ctrl.brake = target <= 0 ? 1 : 0;
    ctrl.throttle = target <= 0 ? 0 : clamp((target - v) / 20 + 0.1, 0, 1);
  }
  ctrl.handbrake = false;
  ctrl.ersBoost = false;
  ctrl.drsToggleRequested = false;

  // ---- done? ---------------------------------------------------------------------------------
  if (sArc >= EXIT_ARC) {
    car.pit = null;
    car.inPit = false;
    car.pitRequest = false;
    if (car.ai) car.ai.shift = clamp(car.lateral - lineOffset[p.idx], -HW + 12, HW - 12);
    return true;
  }
  return false;
}

// ---- AI strategy -----------------------------------------------------------------------------

export function chooseNextCompound(remainingLaps: number, wetness: number): TyreCompound {
  if (wetness >= 0.12) return bestCompoundForWetness(wetness);
  if (remainingLaps > 8) return 'hard';
  if (remainingLaps > 3) return 'medium';
  return 'soft';
}

/** Decide whether an AI car should box this lap. Cheap; call about once per second. */
export function aiPitStrategy(car: WorldCar, ctx: PitContext) {
  if (!ctx.isRace || !car.ai || car.pit || car.pitRequest || car.timing.finished) return;
  const t = car.timing;
  const lapsDone = Math.max(0, t.lapsCompleted);
  const remaining = ctx.totalLaps - lapsDone;
  if (remaining < 2) return;
  const wearLimit = (car.ai.wearLimit as number) ?? 0.6;
  const plannedFrac = (car.ai.plannedStopFrac as number) ?? 0.5;
  if (t.pitStops > 0 && lapsDone - ((car.ai.lastStopLap as number) ?? 0) < 2) return;

  const mismatch = compoundMismatch(car.compound, ctx.wetness);
  const worn = car.phys.tires.avgWear > wearLimit;
  const planned = ctx.totalLaps >= 8 && t.pitStops === 0 && lapsDone >= Math.round(ctx.totalLaps * plannedFrac);
  if (mismatch || worn || planned) {
    car.pitRequest = true;
    car.nextCompound = chooseNextCompound(remaining - 1, ctx.wetness);
    car.ai.lastStopLap = lapsDone;
  }
}
