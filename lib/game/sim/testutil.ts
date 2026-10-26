import { DEFAULT_SETTINGS, type GameSettings } from '../gameState';
import { track } from '../track';
import { NEUTRAL_CONTROLS } from '../controls';
import { DRIVER_ROSTER } from '../constants';
import { GameWorld, FIXED_DT } from './world';
import { createBrain } from './ai';

export function raceSettings(patch: Partial<GameSettings> = {}): GameSettings {
  return { ...DEFAULT_SETTINGS, mode: 'race', totalLaps: 2, aiCount: 5, gridPosition: 3, ...patch };
}

/** Let the AI controller drive the player too, so a full race can run headless. */
export function autopilotPlayer(w: GameWorld) {
  w.player.ai = createBrain(99, 4242);
  w.player.skill = DRIVER_ROSTER[0].skill;
  w.settings.steeringSensitivity = 1.0;
}

export function run(w: GameWorld, seconds: number, until?: () => boolean) {
  const steps = Math.round(seconds / FIXED_DT);
  for (let i = 0; i < steps; i++) {
    w.step(FIXED_DT, NEUTRAL_CONTROLS);
    w.events.flush();
    if (until?.()) return;
  }
}

export interface CarLog {
  offTrack: number;
  minTemp: number;
  maxTemp: number;
  posChanges: number;
}

/** Run a race to the flag, sampling per-car diagnostics every step. */
export function runRace(w: GameWorld, maxSeconds = 900) {
  const logs: CarLog[] = w.cars.map(() => ({ offTrack: 0, minTemp: 999, maxTemp: 0, posChanges: 0 }));
  let prevOrder = w.order.map((c) => c.id);
  let swaps = 0;
  let raceStarted = false;
  run(w, maxSeconds, () => {
    if (w.phase === 'racing') raceStarted = true;
    if (raceStarted) {
      for (const c of w.cars) {
        const l = logs[c.id];
        if (!c.surface.onTrack && !c.inPit) l.offTrack += FIXED_DT;
        const tr = c.phys.tires;
        for (const k of ['fl', 'fr', 'rl', 'rr'] as const) {
          l.minTemp = Math.min(l.minTemp, tr[k].temp);
          l.maxTemp = Math.max(l.maxTemp, tr[k].temp);
        }
      }
      const cur = w.order.map((c) => c.id);
      // count adjacent swaps among cars that are on the lead lap and racing
      for (let i = 0; i < cur.length; i++) {
        if (cur[i] !== prevOrder[i]) {
          swaps++;
          break;
        }
      }
      prevOrder = cur;
    }
    return w.cars.every((c) => c.timing.finished);
  });
  return { logs, swaps };
}
