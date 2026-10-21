import { CAR_SCALE, DRS_CONFIG, N, cumulativeS, drsDetectionIdx, TRACK_LENGTH, type DrsZone } from '../constants';
import { arcDelta } from './ai';
import { CHECKPOINTS_PER_LAP as CP, type WorldCar } from './types';
import { timeGap } from './race';

const CP_LEN = TRACK_LENGTH / CP;
const ZONE_SLACK_IDX = 6;

interface ZoneInfo {
  zone: DrsZone;
  detectIdx: number;
  /** Checkpoint-in-lap index of the detection point. */
  detectCp: number;
}

export const DRS_ZONES: ZoneInfo[] = DRS_CONFIG.zones.map((zone) => {
  const detectIdx = drsDetectionIdx(zone);
  // ceil: the checkpoint must lie at/after the detection point, or the car is still outside the zone
  // on the step detection fires and the activation is cancelled immediately.
  return { zone, detectIdx, detectCp: Math.ceil(cumulativeS[detectIdx] / CP_LEN) % CP };
});

/** True when idx lies in the (wrap-aware) range [start, end]. */
function inRange(idx: number, start: number, end: number): boolean {
  return start <= end ? idx >= start && idx <= end : idx >= start || idx <= end;
}

export interface DrsContext {
  isRace: boolean;
  /** Cars sorted by running order (index 0 = leader). */
  order: WorldCar[];
}

/**
 * DRS rules (real-F1 style):
 *  - Races: enabled from lap 2. When a car passes a zone's detection point within 1.0 s of the car
 *    directly ahead it may open DRS in that zone. The leader never gets DRS.
 *  - Time trial / practice: DRS is always available inside the zones.
 * Physics only lets a car open DRS while `drsAvailable` is set.
 */
export function updateDrsAvailability(cars: WorldCar[], ctx: DrsContext) {
  for (const car of cars) {
    const t = car.timing;
    const idx = car.phys.idx;
    const enabled = !ctx.isRace || t.lapsCompleted >= DRS_CONFIG.enabledAfterLaps;

    if (!enabled || car.inPit || t.finished) {
      car.drsAvailable = false;
      car.drsDetect.zoneActive = -1;
      car.drsDetect.lastG = t.lastCheckpoint;
      continue;
    }

    if (!ctx.isRace) {
      let any = false;
      for (const z of DRS_ZONES) if (inRange(idx, z.detectIdx, z.zone.end)) any = true;
      car.drsAvailable = any;
      continue;
    }

    // Detection: evaluate when a checkpoint matching a detection point was passed since last step
    const g1 = t.lastCheckpoint;
    for (let g = car.drsDetect.lastG + 1; g <= g1 && g >= 0; g++) {
      const cpIn = g % CP;
      for (let zi = 0; zi < DRS_ZONES.length; zi++) {
        if (DRS_ZONES[zi].detectCp !== cpIn) continue;
        const pos = car.position;
        const ahead = pos > 1 ? ctx.order[pos - 2] : null;
        let ok = false;
        if (ahead && !ahead.inPit && ahead !== car) {
          // On the same lap or lapping: gap measured at this checkpoint
          const gap = timeGap(t, ahead.timing);
          ok = gap !== null && gap >= 0 && gap <= DRS_CONFIG.detectionGapSec;
        }
        car.drsDetect.zoneActive = ok ? zi : -1;
      }
    }
    car.drsDetect.lastG = g1;

    const zi = car.drsDetect.zoneActive;
    if (zi >= 0) {
      const z = DRS_ZONES[zi];
      if (inRange(idx, (z.detectIdx - ZONE_SLACK_IDX + N) % N, z.zone.end)) car.drsAvailable = true;
      else {
        car.drsAvailable = false;
        car.drsDetect.zoneActive = -1;
      }
    } else {
      car.drsAvailable = false;
    }
  }
}

/** Slipstream: a car close behind another at speed on a straight gets less drag (0..1). */
const DRAFT_RANGE = 640;
const DRAFT_HALF_WIDTH = 2.4 * CAR_SCALE;
export function updateSlipstream(cars: WorldCar[], dt: number) {
  for (const car of cars) {
    const p = car.phys;
    let target = 0;
    if (!car.pit && p.vf > 300 && Math.abs(p.steer) < 0.3) {
      for (const o of cars) {
        if (o === car || o.pit) continue;
        const ds = arcDelta(car.timing.lastS, o.timing.lastS);
        if (ds < 30 || ds > DRAFT_RANGE || o.phys.vf < 300) continue;
        const dl = Math.abs(o.lateral - car.lateral);
        if (dl > DRAFT_HALF_WIDTH) continue;
        const w = Math.pow(1 - ds / DRAFT_RANGE, 1.2) * (1 - dl / DRAFT_HALF_WIDTH);
        if (w > target) target = w;
      }
    }
    car.draft += (target - car.draft) * Math.min(1, 6 * dt);
  }
}
