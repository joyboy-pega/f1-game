import { HW, type TyreCompound } from '../constants';
import { track, trackCache } from '../track';
import { KMH_PER_UNIT } from '../units';
import { fitFreshTires } from '../physics';
import { arcDelta } from './ai';
import { getRacingLine } from './racingLine';
import type { EventBus } from './events';
import { bestCompoundForWetness, compoundMismatch } from './tyres';
import { compoundToBit } from './rules';
import type { WorldCar } from './types';

/**
 * Pit stops. A car with `pitRequest` that crosses the pit entry (track.current.pit.entryIdx) is taken over by this module
 * (the player too): it is driven along the pit lane under an 80 km/h limiter, stops in its own box,
 * gets fresh tyres, waits for a clear lane and rejoins at the exit.
 * Every car has its own box (by car id), so two cars can never share one.
 */

const BOX_COUNT = 12;
const ENTRY_BLEND = 450;
const EXIT_BLEND = 650;

/** Pit-lane geometry derived once per track: lateral lanes, limiter speed and the arc positions the controller needs. */
interface PitGeo {
  /** Fast lane (nearer the track) and working lane (the boxes), signed lateral offsets. */
  fastLat: number;
  boxLat: number;
  exitLat: number;
  /** Slightly under the limit so the controller never trips the 80 km/h line. */
  limit: number;
  entryS: number;
  exitArc: number;
  boxSpacingIdx: number;
}

const getPitGeo = trackCache((rt): PitGeo => {
  const pit = rt.pit;
  const entryS = rt.cumulativeS[pit.entryIdx];
  return {
    fastLat: pit.side * (pit.laneOffset - 11),
    boxLat: pit.side * (pit.laneOffset + 9),
    exitLat: pit.side * 30,
    limit: (pit.speedLimitKmh / KMH_PER_UNIT) * 0.97,
    entryS,
    exitArc: arcFromEntryS(rt.cumulativeS[pit.exitIdx], entryS, rt.length),
    boxSpacingIdx: (pit.boxEndIdx - pit.boxStartIdx) / BOX_COUNT,
  };
});

export function boxIndexFor(carId: number): number {
  const T = track.current;
  return Math.round(T.pit.boxStartIdx + (carId + 0.5) * getPitGeo().boxSpacingIdx);
}

/** Signed spline-index distance to the pit entry, in (-N/2, N/2]. */
export function entryDelta(idx: number): number {
  const T = track.current;
  const N = T.N;
  return ((idx - T.pit.entryIdx + N + N / 2) % N) - N / 2;
}

/** Arc length from the pit entry line (arc `entryS`) to arc position s (wrap-aware, may be slightly negative). */
function arcFromEntryS(s: number, entryS: number, L: number): number {
  let d = s - entryS;
  if (d < -L / 4) d += L;
  else if (d > (3 * L) / 4) d -= L;
  return d;
}

function arcFromEntry(s: number): number {
  return arcFromEntryS(s, getPitGeo().entryS, track.current.length);
}

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
  const G = getPitGeo();
  const FAST_LAT = G.fastLat;
  const BOX_LAT = G.boxLat;
  const EXIT_ARC = G.exitArc;
  let lat = FAST_LAT;
  if (sArc < ENTRY_BLEND) lat = lerp(pit.entryLateral, FAST_LAT, ss(sArc / ENTRY_BLEND));
  if (pit.stage === 'approach' || pit.stage === 'service') lat = lerp(FAST_LAT, BOX_LAT, ss((sArc - (boxArc - 130)) / 70));
  else if (pit.stage === 'depart') lat = lerp(BOX_LAT, FAST_LAT, ss((sArc - (boxArc + 40)) / 70));
  if (sArc > EXIT_ARC - EXIT_BLEND) lat = lerp(lat, G.exitLat, ss((sArc - (EXIT_ARC - EXIT_BLEND)) / EXIT_BLEND));
  return lat;
}

/** Another pit car is in the fast lane close behind this box (unsafe to release). */
function laneBusyBehind(car: WorldCar, cars: WorldCar[]): boolean {
  const FAST_LAT = getPitGeo().fastLat;
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
  const T = track.current;
  const G = getPitGeo();
  const LIMIT = G.limit;
  const EXIT_ARC = G.exitArc;
  const sArc = arcFromEntry(car.timing.lastS);
  const boxArc = arcFromEntry(T.cumulativeS[pit.boxIdx]);

  // ---- stage transitions -----------------------------------------------------------------
  if (pit.stage === 'enter' && (v <= LIMIT * 1.02 || sArc > boxArc - 180)) pit.stage = 'approach';
  if (pit.stage === 'depart' && sArc > boxArc + 130) pit.stage = 'exit';

  let target = LIMIT;
  let hold = false;

  if (pit.stage === 'approach') {
    const dist = boxArc - sArc;
    target = Math.min(LIMIT, Math.sqrt(2 * 180 * Math.max(0, dist - 12)));
    if (dist < 4) target = 0;
    if (p.kmh < 5 && dist < 45 && dist > -45) {
      pit.stage = 'service';
      // Tyre change is ~2.5s; front-wing replacement adds ~8.0s (§5.3 V3)
      const wingRepair = car.damage > 0.05 ? 8.0 : 0;
      pit.serviceTime = 2.2 + ctx.rand() * 1.3 + (ctx.rand() < 0.12 ? 1.5 + ctx.rand() * 2.5 : 0) + wingRepair;
      pit.serviceLeft = pit.serviceTime;
      pit.stationary = 0;
    }
  }

  if (pit.stage === 'service') {
    target = 0;
    hold = true;
    pit.stationary += dt;
    // Align car straight in the pit box
    p.a = Math.atan2(T.ty[p.idx], T.tx[p.idx]);
    if (p._veh) {
      p._veh.yaw = p.a;
      p._veh.yawRate = 0;
      p._veh.vy = 0;
    }
    if (pit.serviceLeft > 0) pit.serviceLeft -= dt;
    else if (!laneBusyBehind(car, ctx.cars) || pit.stationary > pit.serviceTime + 8) {
      // Tyres go on at the end of the stop; they start cool and warm up on track.
      car.compound = pit.fit;
      car.compoundsUsedMask |= compoundToBit(pit.fit);
      fitFreshTires(p, 62 + ctx.rand() * 8, pit.fit);
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
  const th = Math.atan2(T.ty[idx], T.tx[idx]);
  const velAng = v > 40 ? Math.atan2(p.vy, p.vx) : p.a;
  const want = th + Math.atan(slope) - Math.atan2(2.0 * e, v + 40);
  let herr = want - velAng;
  herr = Math.atan2(Math.sin(herr), Math.cos(herr));
  const vv = Math.max(v, 60);
  const yawPerSteer = (2.6 * Math.max(0.3, p.tires.frontGrip) * Math.min(vv / 220, 1)) / (1 + vv / 620);
  // In the pit lane, clamp steering so cars never spin or turn sideways into the wall
  ctrl.steer = hold ? 0 : clamp((2.5 * herr) / yawPerSteer, -0.25, 0.25);
  ctrl.analogSteer = true;

  // ---- speed ---------------------------------------------------------------------------------
  if (hold) {
    ctrl.throttle = 0;
    ctrl.brake = 1;
  } else if (v > target + 1) {
    ctrl.throttle = 0;
    ctrl.brake = clamp((v - target) / 10, 0, 1);
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
    const hw = track.current.halfWidth[p.idx];
    if (car.ai) car.ai.shift = clamp(car.lateral - getRacingLine().offset[p.idx], -hw + 12, hw - 12);
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
  // In short sprint races (< 6 laps), pitting costs 25+ seconds, so only pit if tyres are completely gone
  const worn = (ctx.totalLaps >= 6) ? car.phys.tires.avgWear > wearLimit : car.phys.tires.avgWear > 0.88;
  const planned = ctx.totalLaps >= 8 && t.pitStops === 0 && lapsDone >= Math.round(ctx.totalLaps * plannedFrac);
  if (mismatch || worn || planned) {
    car.pitRequest = true;
    car.nextCompound = chooseNextCompound(remaining - 1, ctx.wetness);
    car.ai.lastStopLap = lapsDone;
  }
}
