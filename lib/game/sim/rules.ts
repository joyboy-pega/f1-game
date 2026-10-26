import type { WorldCar } from './types';
import type { EventBus } from './events';
import type { TyreCompound } from '../constants';
import { track } from '../track';
import { sectorOf } from './race';

export type EngineMode = 'lean' | 'standard' | 'push';
export type ERSMode = 'balanced' | 'overtake' | 'recharge';
export type RegulationsEra = '2022' | '2026';

export interface CarSetup {
  aeroPreset: 'low' | 'medium' | 'high';
  brakeBias: number; // e.g. 56 (%)
  diffOnThrottle: number; // e.g. 70 (%)
  rideHeightM: number; // e.g. 0.035
  tirePressureBar: number; // e.g. 1.5
}

export const DEFAULT_SETUP: CarSetup = {
  aeroPreset: 'medium',
  brakeBias: 56,
  diffOnThrottle: 70,
  rideHeightM: 0.035,
  tirePressureBar: 1.5,
};

export const AERO_PRESET_CONFIG = {
  low: { ClA: 2.8, CdA: 0.90, desc: 'Low downforce · Maximum straight-line speed' },
  medium: { ClA: 3.6, CdA: 1.05, desc: 'Medium downforce · Balanced performance' },
  high: { ClA: 4.4, CdA: 1.22, desc: 'High downforce · Maximum cornering grip' },
};

export const ENGINE_MODE_FACTORS = {
  lean: { power: 0.95, fuel: 0.82 },
  standard: { power: 1.0, fuel: 1.0 },
  push: { power: 1.04, fuel: 1.25 },
};

export const POINTS_TABLE = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

export function compoundToBit(c: TyreCompound): number {
  switch (c) {
    case 'soft': return 1 << 0;
    case 'medium': return 1 << 1;
    case 'hard': return 1 << 2;
    case 'inter': return 1 << 3;
    case 'wet': return 1 << 4;
  }
}

/** Check for false start / jump-start before lights out (PLAN-v3 §8 R5). */
export function checkJumpStart(car: WorldCar, phase: string, events: EventBus): boolean {
  if (phase === 'grid' || phase === 'lights') {
    // If car moves forward at > 4 km/h before lights out
    if (car.phys.kmh > 4.0 && !car.jumpStart) {
      car.jumpStart = true;
      car.timing.penaltySec += 5;
      events.emit({ type: 'penalty', carId: car.id, seconds: 5, reason: 'JUMP START' });
      return true;
    }
  }
  return false;
}

/** Check for pit lane speeding penalty (PLAN-v3 §8 R6). */
export function checkPitSpeeding(car: WorldCar, events: EventBus): boolean {
  if (car.inPit || car.pit) {
    const limit = track.current.pit.speedLimitKmh || 80;
    if (car.phys.kmh > limit + 2.0 && !car.pitSpeedingPenalized) {
      car.pitSpeedingPenalized = true;
      car.timing.penaltySec += 5;
      events.emit({ type: 'penalty', carId: car.id, seconds: 5, reason: 'PIT LANE SPEEDING' });
      return true;
    }
  } else {
    car.pitSpeedingPenalized = false;
  }
  return false;
}

/** Check mandatory two dry tyre compounds rule in dry races >= 10 laps (PLAN-v3 §8 R6 / F1 Sporting Regs Art 30.5). */
export function checkTwoCompoundRule(car: WorldCar, totalLaps: number, isDryRace: boolean, events: EventBus): boolean {
  if (!isDryRace || totalLaps < 10) return true;
  // Count dry compounds (soft, medium, hard) used
  const dryMask = car.compoundsUsedMask & 0b00111;
  const dryCount = (dryMask & 1 ? 1 : 0) + (dryMask & 2 ? 1 : 0) + (dryMask & 4 ? 1 : 0);
  if (dryCount < 2) {
    car.timing.penaltySec += 20;
    events.emit({ type: 'penalty', carId: car.id, seconds: 20, reason: 'FAILED TO USE TWO DRY COMPOUNDS' });
    return false;
  }
  return true;
}

/** F1 World Championship points scale 25-18-15-12-10-8-6-4-2-1 + 1 fastest lap (PLAN-v3 §8 R9). */
export function calculateChampionshipPoints(classification: WorldCar[], fastestLapCarId?: number): Map<number, number> {
  const points = new Map<number, number>();
  for (let i = 0; i < classification.length; i++) {
    const car = classification[i];
    let pts = i < POINTS_TABLE.length ? POINTS_TABLE[i] : 0;
    if (i < 10 && fastestLapCarId !== undefined && car.id === fastestLapCarId) {
      pts += 1;
    }
    points.set(car.id, pts);
  }
  return points;
}

/** Tactical race engineer messages and strategy notices (PLAN-v3 §8 R8). */
export class EngineerManager {
  private boxAlertEmitted = false;
  private lastRivalPittedId = -1;

  reset() {
    this.boxAlertEmitted = false;
    this.lastRivalPittedId = -1;
  }

  update(player: WorldCar, cars: WorldCar[], events: EventBus, dt: number) {
    const p = player;
    if (p.timing.finished) return;

    // 1. Box this lap notification when pit request is active in final sector
    const sec = sectorOf(p.timing.lastS);
    if (p.pitRequest && sec === 2 && !this.boxAlertEmitted) {
      this.boxAlertEmitted = true;
      events.emit({
        type: 'penalty',
        carId: p.id,
        seconds: 0,
        reason: `BOX THIS LAP · FITTING ${p.nextCompound.toUpperCase()}`,
      });
    } else if (!p.pitRequest || p.inPit) {
      this.boxAlertEmitted = false;
    }

    // 2. Rival pitted alert (car directly ahead or behind enters the pits)
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      if (c.id === p.id) continue;
      if (Math.abs(c.position - p.position) === 1 && c.inPit && c.id !== this.lastRivalPittedId) {
        this.lastRivalPittedId = c.id;
        events.emit({
          type: 'penalty',
          carId: p.id,
          seconds: 0,
          reason: `RIVAL PITTED · P${c.position} IN PIT LANE`,
        });
        break;
      }
    }
  }
}

/** Telemetry CSV export (PLAN-v3 §8 R11). */
export interface TelemetrySample {
  distanceM: number;
  speedKmh: number;
  throttle: number;
  brake: number;
  gear: number | string;
  rpm: number;
  drs: boolean;
  lateralG: number;
  longitudinalG: number;
}

export function exportLapTelemetryCsv(samples: TelemetrySample[]): string {
  const header = 'distance_m,speed_kmh,throttle,brake,gear,rpm,drs,lat_g,lon_g\n';
  const rows = samples.map((s) =>
    [
      s.distanceM.toFixed(1),
      s.speedKmh.toFixed(1),
      s.throttle.toFixed(2),
      s.brake.toFixed(2),
      s.gear,
      Math.round(s.rpm),
      s.drs ? 1 : 0,
      s.lateralG.toFixed(2),
      s.longitudinalG.toFixed(2),
    ].join(',')
  );
  return header + rows.join('\n');
}

/** 2026 regulations active aero and override modes (PLAN-v3 §8 R12). */
export function get2026AeroModifiers(isOnStraight: boolean): { cdaScale: number; claScale: number } {
  // In 2026 active aero "Straight Mode", straight-line drag is reduced by 25% and downforce by 35%
  if (isOnStraight) {
    return { cdaScale: 0.75, claScale: 0.65 };
  }
  // Corner mode: full downforce
  return { cdaScale: 1.0, claScale: 1.0 };
}
