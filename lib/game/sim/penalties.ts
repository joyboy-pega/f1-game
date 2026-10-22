import { TRACK_LIMITS } from '../constants';
import { inPitBand, trackCache } from '../track';
import type { EventBus } from './events';
import type { WorldCar } from './types';

/** Corner zones: stretches where curvature is high (R < 700), merged and padded. Built once per track. */
interface CornerZones {
  zone: Int16Array;
  count: number;
}

const getCornerZones = trackCache((rt): CornerZones => {
  const N = rt.N;
  const zone = new Int16Array(N).fill(-1);
  const isCorner = new Uint8Array(N);
  for (let i = 0; i < N; i++) isCorner[i] = rt.segLen[i] / Math.max(1e-6, rt.smoothCurvature[i]) < 700 ? 1 : 0;
  const GAP = 25;
  const PAD = 20;
  // find runs (cyclic), merge runs closer than GAP
  const runs: [number, number][] = [];
  let start = -1;
  for (let i = 0; i < N; i++) {
    if (isCorner[i]) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      runs.push([start, i - 1]);
      start = -1;
    }
  }
  if (start >= 0) runs.push([start, N - 1]);
  const merged: [number, number][] = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && r[0] - last[1] <= GAP) last[1] = r[1];
    else merged.push([r[0], r[1]]);
  }
  merged.forEach((r, id) => {
    for (let i = r[0] - PAD; i <= r[1] + PAD; i++) zone[((i % N) + N) % N] = id;
  });
  return { zone, count: merged.length };
});

/** Corner id (or -1) per spline index, and the number of corners, for the active track. */
export function cornerZoneOf(idx: number): number {
  return getCornerZones().zone[idx];
}

export function cornerCount(): number {
  return getCornerZones().count;
}

export interface LimitsContext {
  raceTime: number;
  dt: number;
  events: EventBus;
  /** Only races police track limits. */
  enabled: boolean;
}

/**
 * Track limits: a car whose centre is beyond HW+12 (all four wheels over the line) for more than
 * 0.2 s at a corner earns one warning for that corner. The third warning and every one after it
 * costs +5 s. Pit lane use, gravel excursions (which cost time anyway), crawling cars and running
 * wide after contact are not penalised.
 */
export function updateTrackLimits(car: WorldCar, ctx: LimitsContext): void {
  const L = car.limits;
  const t = car.timing;
  if (!ctx.enabled) return;
  const idx = car.phys.idx;
  const off = car.surface.dist > TRACK_LIMITS.warnDist;
  const inCorner = getCornerZones().zone[idx];

  // Leaving the corner clears the "already warned" latch
  if (L.lastCornerId >= 0 && inCorner !== L.lastCornerId) L.lastCornerId = -1;

  if (!off || car.inPit || inPitBand(idx, car.lateral)) {
    L.offTime = 0;
    L.counted = false;
    L.exempt = false;
    return;
  }

  L.offTime += ctx.dt;
  if (ctx.raceTime - car.lastCollisionTime < TRACK_LIMITS.collisionGrace) L.exempt = true;
  if (L.counted || L.exempt || L.offTime < TRACK_LIMITS.minDuration) return;

  L.counted = true; // one verdict per excursion
  if (inCorner < 0) return; // not a corner
  if (car.surface.gravel || car.phys.kmh < 60) return; // lost time anyway
  if (inCorner === L.lastCornerId) return; // one warning per corner incident
  L.lastCornerId = inCorner;

  t.trackLimitWarnings++;
  ctx.events.emit({ type: 'trackLimits', carId: car.id, warnings: t.trackLimitWarnings });
  if (t.trackLimitWarnings >= TRACK_LIMITS.warningsBeforePenalty) {
    t.penaltySec += TRACK_LIMITS.penaltySec;
    ctx.events.emit({ type: 'penalty', carId: car.id, seconds: TRACK_LIMITS.penaltySec, reason: 'TRACK LIMITS' });
  }
}
