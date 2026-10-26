import { sectorOf } from './race';
import type { EventBus } from './events';
import type { WorldCar } from './types';
import { arcDelta } from './ai';

export type FlagStatus = 'green' | 'yellow' | 'blue' | 'vsc' | 'sc';

export interface FlagsState {
  scMode: 'none' | 'vsc' | 'sc';
  scEnding: boolean;
  scTimer: number;
  scDeployTime: number;
  sectorYellow: [boolean, boolean, boolean];
  sectorYellowUntil: [number, number, number];
}

/**
 * Flags and Safety Car system (PLAN-v3 §8 R3).
 * Manages local yellow flags at marshal sectors, blue flag yields,
 * Virtual Safety Car (VSC) delta limits, and physical Safety Car (SC)
 * field bunching (< 1.5s gaps).
 */
export class FlagsManager {
  readonly state: FlagsState = {
    scMode: 'none',
    scEnding: false,
    scTimer: 0,
    scDeployTime: 0,
    sectorYellow: [false, false, false],
    sectorYellowUntil: [-1, -1, -1],
  };

  private strandedTime = new Float32Array(32);
  private prevPositions = new Int8Array(32).fill(-1);

  reset() {
    this.state.scMode = 'none';
    this.state.scEnding = false;
    this.state.scTimer = 0;
    this.state.scDeployTime = 0;
    this.state.sectorYellow = [false, false, false];
    this.state.sectorYellowUntil = [-1, -1, -1];
    this.strandedTime.fill(0);
    this.prevPositions.fill(-1);
  }

  deployVSC(events: EventBus, raceTime: number, duration = 25) {
    this.state.scMode = 'vsc';
    this.state.scEnding = false;
    this.state.scTimer = duration;
    this.state.scDeployTime = raceTime;
    events.emit({ type: 'safetyCar', mode: 'vsc' });
  }

  deploySC(events: EventBus, raceTime: number, duration = 45) {
    this.state.scMode = 'sc';
    this.state.scEnding = false;
    this.state.scTimer = duration;
    this.state.scDeployTime = raceTime;
    events.emit({ type: 'safetyCar', mode: 'sc' });
  }

  triggerLocalYellow(sector: number, events: EventBus, raceTime: number, duration = 8) {
    if (sector < 0 || sector > 2) return;
    this.state.sectorYellow[sector] = true;
    this.state.sectorYellowUntil[sector] = raceTime + duration;
    events.emit({ type: 'flag', flag: 'yellow', sector });
  }

  update(dt: number, cars: WorldCar[], events: EventBus, raceTime: number, isRace: boolean, phase: string = 'racing') {
    const s = this.state;

    // 1. Advance yellow flag timers per sector
    for (let sec = 0; sec < 3; sec++) {
      if (s.sectorYellow[sec] && raceTime >= s.sectorYellowUntil[sec]) {
        s.sectorYellow[sec] = false;
        events.emit({ type: 'flag', flag: 'green', sector: sec });
      }
    }

    // 2. Advance Safety Car / VSC timers
    if (s.scMode !== 'none') {
      s.scTimer -= dt;
      if (s.scTimer <= 5.0 && !s.scEnding) {
        s.scEnding = true;
        events.emit({ type: 'safetyCar', mode: s.scMode, ending: true });
      }
      if (s.scTimer <= 0) {
        s.scMode = 'none';
        s.scEnding = false;
        events.emit({ type: 'safetyCar', mode: 'none' });
        events.emit({ type: 'flag', flag: 'green' });
      }
    }

    // 3. Scan for stranded / spun cars to deploy local yellows
    if (isRace && phase === 'racing') {
      for (let i = 0; i < cars.length; i++) {
        const c = cars[i];
        const id = c.id;
        if (c.inPit || c.timing.finished) {
          if (id < 32) this.strandedTime[id] = 0;
          continue;
        }

        // Only detect stranded cars when race is underway past the start launch (> 6.0s)
        if (raceTime > 6.0 && c.phys.kmh < 15) {
          if (id < 32) {
            this.strandedTime[id] += dt;
            if (this.strandedTime[id] >= 2.5) {
              const sec = sectorOf(c.timing.lastS);
              if (!s.sectorYellow[sec]) {
                this.triggerLocalYellow(sec, events, raceTime, 8);
              }
            }
          }
        } else if (c.phys.kmh >= 25) {
          if (id < 32) this.strandedTime[id] = 0;
        }
      }
    }

    // 4. Blue flag detection in races
    if (isRace && phase === 'racing' && cars.length > 1) {
      let leader: WorldCar = cars[0];
      for (let i = 0; i < cars.length; i++) {
        if (cars[i].position === 1) {
          leader = cars[i];
          break;
        }
      }

      for (let i = 0; i < cars.length; i++) {
        const car = cars[i];
        if (car.inPit || car.timing.finished) {
          car.blueFlag = false;
          car.blueFlagTime = 0;
          continue;
        }

        // Is this car at least 1 lap behind the leader?
        const isLapped = leader.timing.lapsCompleted > car.timing.lapsCompleted;
        if (isLapped) {
          // Check if leader is closing behind within ~150m (1500 units)
          const ds = arcDelta(car.timing.lastS, leader.timing.lastS);
          if (ds > -1500 && ds < -50) {
            car.blueFlag = true;
            car.blueFlagTime += dt;
            // 3 marshal posts ~ 900m / 12 seconds
            if (car.isPlayer && car.blueFlagTime > 12.0) {
              car.timing.penaltySec += 5;
              events.emit({ type: 'penalty', carId: car.id, seconds: 5, reason: 'IGNORING BLUE FLAGS' });
              car.blueFlagTime = 0;
            }
          } else {
            car.blueFlag = false;
            car.blueFlagTime = 0;
          }
        } else {
          car.blueFlag = false;
          car.blueFlagTime = 0;
        }
      }
    }

    // 5. Overtaking under Yellow / VSC / SC detection
    if (isRace && phase === 'racing') {
      for (let i = 0; i < cars.length; i++) {
        const car = cars[i];
        const id = car.id;
        const prevPos = id < 32 ? this.prevPositions[id] : -1;
        const currPos = car.position;

        if (prevPos !== -1 && currPos < prevPos) {
          // Car gained position (overtook)
          const sec = sectorOf(car.timing.lastS);
          const illegal = s.scMode !== 'none' || s.sectorYellow[sec];
          if (illegal) {
            // Check if any car overtaken (previous position in [currPos, prevPos - 1]) was actively racing
            let passedActiveCar = false;
            for (let j = 0; j < cars.length; j++) {
              const other = cars[j];
              if (other.id === id) continue;
              const otherPrev = other.id < 32 ? this.prevPositions[other.id] : -1;
              if (otherPrev >= currPos && otherPrev < prevPos) {
                if (other.phys.kmh >= 30 && !other.inPit && !other.timing.finished) {
                  passedActiveCar = true;
                  break;
                }
              }
            }

            if (passedActiveCar) {
              car.timing.penaltySec += 5;
              const reason =
                s.scMode === 'sc'
                  ? 'OVERTAKING UNDER SAFETY CAR'
                  : s.scMode === 'vsc'
                  ? 'OVERTAKING UNDER VSC'
                  : 'OVERTAKING UNDER YELLOW';
              events.emit({ type: 'penalty', carId: car.id, seconds: 5, reason });
            }
          }
        }
      }

      // Record positions for next step
      for (let i = 0; i < cars.length; i++) {
        const id = cars[i].id;
        if (id < 32) this.prevPositions[id] = cars[i].position;
      }
    }
  }
}
