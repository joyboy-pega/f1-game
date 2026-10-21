import { TRACK_LENGTH, cumulativeS, trackSplinePoints, tangents, normals, SECTOR_BOUNDS, N } from '../constants';
import type { SectorStatus } from '../gameState';
import type { CarPhysicsState } from '../physics';
import type { EventBus } from './events';
import { CHECKPOINTS_PER_LAP as CP, MAX_TRACKED_LAPS, type CarTiming, type WorldCar } from './types';

const L = TRACK_LENGTH;
const CP_LEN = L / CP;
export const SECTOR_S: [number, number] = [cumulativeS[SECTOR_BOUNDS[0]], cumulativeS[SECTOR_BOUNDS[1]]];

export interface OverallBests {
  bestLap: number | null;
  bestLapCarId: number | null;
  bestSectors: (number | null)[];
}

export function createOverallBests(): OverallBests {
  return { bestLap: null, bestLapCarId: null, bestSectors: [null, null, null] };
}

export interface ArcPos {
  s: number;
  lateral: number;
}

/**
 * Arc-length position along the lap and signed lateral offset for a car. Writes into the caller-owned `out`
 * (and returns it) so the 120 Hz step allocates nothing (R7).
 */
export function arcPosition(phys: CarPhysicsState, out: ArcPos): ArcPos {
  const i = phys.idx;
  const p = trackSplinePoints[i];
  const dx = phys.x - p[0];
  const dy = phys.y - p[1];
  let s = cumulativeS[i] + dx * tangents[i][0] + dy * tangents[i][1];
  if (s < 0) s += L;
  else if (s >= L) s -= L;
  out.s = s;
  out.lateral = dx * normals[i][0] + dy * normals[i][1];
  return out;
}

export function sectorOf(s: number): number {
  return s < SECTOR_S[0] ? 0 : s < SECTOR_S[1] ? 1 : 2;
}

/**
 * @param s arc-length position of the car
 * @param behindLine true when the car starts on the grid behind the start line
 */
export function createTiming(s: number, behindLine: boolean): CarTiming {
  const progress = behindLine && s > L / 2 ? s - L : s;
  return {
    progress,
    lastS: s,
    lapsCompleted: progress < 0 ? -1 : 0,
    lapStartTime: null,
    lapTimes: [],
    lastLap: null,
    bestLap: null,
    currentSector: sectorOf(s),
    sectorStartTime: null,
    sectorTimes: [null, null, null],
    lastSectorTimes: [null, null, null],
    bestSectors: [null, null, null],
    checkpointTimes: new Float64Array((MAX_TRACKED_LAPS + 2) * CP).fill(NaN),
    currentLapTrace: new Float32Array(CP).fill(NaN),
    bestLapTrace: null,
    lastCheckpoint: Math.floor(progress / CP_LEN) + CP,
    finished: false,
    finishTime: null,
    penaltySec: 0,
    trackLimitWarnings: 0,
    pitStops: 0,
  };
}

export interface TimingContext {
  raceTime: number; // race clock at the END of this step
  dt: number;
  /** Race mode: lap 1 is timed from lights out. Otherwise the out-lap is untimed. */
  standingStart: boolean;
  overall: OverallBests;
  events: EventBus;
}

export interface TimingResult {
  lapCompleted: boolean;
  crossTime: number;
}

function sectorStatus(time: number, personal: number | null, overall: number | null): SectorStatus {
  if (overall === null || time < overall) return 'overall';
  if (personal === null || time < personal) return 'personal';
  return 'slower';
}

function completeSector(car: WorldCar, sector: number, at: number, ctx: TimingContext) {
  const t = car.timing;
  if (t.sectorStartTime === null) return;
  const time = at - t.sectorStartTime;
  const status = sectorStatus(time, t.bestSectors[sector], ctx.overall.bestSectors[sector]);
  t.sectorTimes[sector] = time;
  if (t.bestSectors[sector] === null || time < (t.bestSectors[sector] as number)) t.bestSectors[sector] = time;
  if (status === 'overall') ctx.overall.bestSectors[sector] = time;
  ctx.events.emit({ type: 'sector', carId: car.id, sector, time, status });
}

/** Shared by every advanceTiming call (R7). Read it before the next call; never keep a reference. */
const timingResult: TimingResult = { lapCompleted: false, crossTime: 0 };

/**
 * Advance a car's timing state to arc position `s`. Call once per fixed step, after physics.
 * The returned object is reused: consume `lapCompleted` / `crossTime` immediately.
 */
export function advanceTiming(car: WorldCar, s: number, ctx: TimingContext): TimingResult {
  const t = car.timing;
  const result = timingResult;
  result.lapCompleted = false;
  result.crossTime = ctx.raceTime;
  const prevProgress = t.progress;
  let delta = s - t.lastS;
  if (delta < -L / 2) delta += L;
  else if (delta > L / 2) delta -= L;
  t.progress += delta;
  t.lastS = s;
  if (delta <= 0) return result;

  const t0 = ctx.raceTime - ctx.dt;

  const gNow = Math.floor(t.progress / CP_LEN) + CP;
  for (let g = t.lastCheckpoint + 1; g <= gNow; g++) {
    if (g < 0) continue;
    const cpProgress = (g - CP) * CP_LEN;
    // Interpolated crossing time within this step.
    const tCross = t0 + ((cpProgress - prevProgress) / delta) * ctx.dt;
    if (g < t.checkpointTimes.length) t.checkpointTimes[g] = tCross;
    t.lastCheckpoint = g;
    const cpInLap = g % CP;

    if (cpInLap === 0) {
      const lapNow = g / CP - 1; // laps completed once this line crossing happens
      if (lapNow > t.lapsCompleted) {
        if (lapNow >= 1 && t.lapStartTime !== null) {
          completeSector(car, 2, tCross, ctx);
          const lapTime = tCross - t.lapStartTime;
          const personalBest = t.bestLap === null || lapTime < t.bestLap;
          const overallBest = ctx.overall.bestLap === null || lapTime < ctx.overall.bestLap;
          t.lapTimes.push(lapTime);
          t.lastLap = lapTime;
          if (personalBest) {
            t.bestLap = lapTime;
            t.bestLapTrace = t.currentLapTrace.slice();
          }
          if (overallBest) {
            ctx.overall.bestLap = lapTime;
            ctx.overall.bestLapCarId = car.id;
          }
          t.lastSectorTimes = t.sectorTimes.slice();
          ctx.events.emit({ type: 'lap', carId: car.id, lap: lapNow, time: lapTime, personalBest, overallBest });
          result.lapCompleted = true;
          result.crossTime = tCross;
        }
        // Race: lap 1 is timed from lights out, which was set when the race began.
        if (!(lapNow === 0 && ctx.standingStart && t.lapStartTime !== null)) t.lapStartTime = tCross;
        t.lapsCompleted = lapNow;
        t.currentLapTrace.fill(NaN);
        t.sectorTimes = [null, null, null];
        t.currentSector = 0;
        t.sectorStartTime = t.lapStartTime;
      }
    }

    if (t.lapStartTime !== null && t.lapsCompleted >= 0) t.currentLapTrace[cpInLap] = tCross - t.lapStartTime;
  }

  // Sector boundaries inside the lap
  const sec = sectorOf(s);
  if (t.lapsCompleted >= 0 && sec === t.currentSector + 1) {
    completeSector(car, t.currentSector, ctx.raceTime, ctx);
    t.currentSector = sec;
    t.sectorStartTime = ctx.raceTime;
  }

  return result;
}

/** Time gap of `behind` to `ahead` at the latest checkpoint both passed; null if unknown. */
export function timeGap(behind: CarTiming, ahead: CarTiming): number | null {
  const g = behind.lastCheckpoint;
  if (g < 0 || g >= behind.checkpointTimes.length) return null;
  const tb = behind.checkpointTimes[g];
  const ta = ahead.checkpointTimes[g];
  if (Number.isNaN(tb) || Number.isNaN(ta)) return null;
  return tb - ta;
}

export function lapsBehind(behind: CarTiming, ahead: CarTiming): number {
  return Math.floor((ahead.progress - behind.progress) / L);
}

export function formatGap(behind: CarTiming, ahead: CarTiming): string {
  const laps = lapsBehind(behind, ahead);
  if (laps >= 1) return `+${laps} LAP${laps > 1 ? 'S' : ''}`;
  const g = timeGap(behind, ahead);
  return g === null ? '--' : `+${Math.max(0, g).toFixed(3)}`;
}

/** Live delta of the lap in progress vs. the personal best, at the last checkpoint. */
export function liveDelta(t: CarTiming): number | null {
  if (!t.bestLapTrace || t.lastCheckpoint < 0) return null;
  const cp = t.lastCheckpoint % CP;
  const cur = t.currentLapTrace[cp];
  const best = t.bestLapTrace[cp];
  if (Number.isNaN(cur) || Number.isNaN(best)) return null;
  return cur - best;
}

/** > 0 when `b` should be ahead of `a`: finished cars by finish time, then by distance covered, then by id. */
function compareRunning(a: WorldCar, b: WorldCar): number {
  const fa = a.timing.finished;
  const fb = b.timing.finished;
  let d: number;
  if (fa && fb) d = (a.timing.finishTime ?? 0) - (b.timing.finishTime ?? 0);
  else if (fa !== fb) d = fa ? -1 : 1;
  else d = b.timing.progress - a.timing.progress;
  // Id tie-break reproduces the previous stable sort of the id-ordered car list.
  return d !== 0 ? d : a.id - b.id;
}

/**
 * Running order, sorted IN PLACE. The order is almost sorted every step, so insertion sort is ~O(n) and, unlike
 * `[...cars].sort(...)`, allocates nothing (R7). Returns the same array.
 */
export function sortRunningOrder(order: WorldCar[]): WorldCar[] {
  for (let i = 1; i < order.length; i++) {
    const x = order[i];
    let j = i - 1;
    while (j >= 0 && compareRunning(order[j], x) > 0) {
      order[j + 1] = order[j];
      j--;
    }
    order[j + 1] = x;
  }
  return order;
}

/** Spline index `k` slots behind the start line (grid). */
export function gridSlotIndex(slot: number): number {
  return (N - 6 - slot * 4 + N * 4) % N;
}
