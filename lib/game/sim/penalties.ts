import { TRACK_LIMITS } from '../constants';
import { inPitBand, track, trackCache } from '../track';
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
  const warnDist = track.current.halfWidth[idx] + 12;
  const off = car.surface.dist > warnDist;
  const inCorner = getCornerZones().zone[idx];

  // Leaving the corner clears the "already warned" latch
  if (L.lastCornerId >= 0 && inCorner !== L.lastCornerId) L.lastCornerId = -1;

  // Chicane shortcut detection: start recording arc progress when leaving track in a corner
  if (off && inCorner >= 0 && L.cutStartS < 0) {
    L.cutStartS = track.current.cumulativeS[idx];
    L.cutStartTime = ctx.raceTime;
  }

  if (!off || car.inPit || inPitBand(idx, car.lateral)) {
    // When rejoining, check if an unpunished chicane shortcut occurred
    if (!off && L.cutStartS >= 0) {
      const currentS = track.current.cumulativeS[idx];
      let deltaS = currentS - L.cutStartS;
      if (deltaS < -track.current.length / 2) deltaS += track.current.length;
      const elapsed = ctx.raceTime - L.cutStartTime;
      L.cutStartS = -1;
      L.cutStartTime = -1;

      // Traversed > 180 units (~18m) across the corner zone while off track
      if (deltaS > 180 && elapsed > 0.05) {
        const expectedTime = deltaS / 38; // ~137 km/h expected traversing speed
        const gained = expectedTime - elapsed;
        // If driver carried speed on throttle without giving the time back
        if (gained > 0.35 && car.ctrl.throttle > 0.45) {
          t.lapValid = false;
          if (t.currentSector === 2) t.nextLapInvalid = true;
          t.penaltySec += 5;
          ctx.events.emit({ type: 'penalty', carId: car.id, seconds: 5, reason: 'CHICANE CUT' });
          ctx.events.emit({ type: 'chicaneCut', carId: car.id, gainedSec: gained });
        }
      }
    }

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

  // Invalidate current lap (and next lap if in final sector)
  t.lapValid = false;
  if (t.currentSector === 2) t.nextLapInvalid = true;
  ctx.events.emit({ type: 'lapInvalid', carId: car.id, lap: t.lapsCompleted + 1, reason: 'TRACK LIMITS' });

  t.trackLimitWarnings++;
  ctx.events.emit({ type: 'trackLimits', carId: car.id, warnings: t.trackLimitWarnings });
  if (t.trackLimitWarnings >= TRACK_LIMITS.warningsBeforePenalty) {
    t.penaltySec += TRACK_LIMITS.penaltySec;
    ctx.events.emit({ type: 'penalty', carId: car.id, seconds: TRACK_LIMITS.penaltySec, reason: 'TRACK LIMITS' });
  }
}
