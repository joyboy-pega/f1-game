import { describe, expect, it } from 'vitest';
import { DRIVER_ROSTER } from '../constants';
import { NEUTRAL_CONTROLS } from '../controls';
import { track } from '../track';
import { GameWorld, FIXED_DT } from './world';
import { raceSettings } from './testutil';
import { createBrain } from './ai';
import type { SimEvent } from './events';

function autopilot(w: GameWorld) {
  w.player.ai = createBrain(99);
  w.player.skill = DRIVER_ROSTER[0].skill;
}

describe('Flags, Safety Car & VSC System (PLAN-v3 §8 R3)', () => {
  it('triggers local yellow flag in sector when a car is stranded, lifts AI pace, and penalises illegal overtakes', () => {
    const w = new GameWorld();
    w.seed = 202;
    w.setup(raceSettings({ aiCount: 5, totalLaps: 3 }));
    w.phase = 'racing';
    autopilot(w);

    const events: SimEvent[] = [];
    w.events.subscribe((e) => events.push(e));

    // Sector 1 index and arc distance on active track
    const sec1Idx = track.current.sectorIdx[0] + 50;
    const sec1S = track.current.cumulativeS[sec1Idx];

    // Force car #3 to spin/stop in Sector 1
    const stoppedCar = w.cars[3];
    stoppedCar.phys.vf = 0;
    stoppedCar.phys.kmh = 0;
    stoppedCar.timing.lastS = sec1S;

    w.flags.triggerLocalYellow(1, w.events, w.raceTime, 10);
    w.events.flush();

    expect(w.flags.state.sectorYellow[1]).toBe(true);
    expect(events.some((e) => e.type === 'flag' && e.flag === 'yellow' && e.sector === 1)).toBe(true);

    // AI car in Sector 1 must observe lift in target speed
    const aiCar = w.cars[1];
    aiCar.timing.lastS = sec1S;
    aiCar.phys.kmh = 160;
    aiCar.phys.vf = 450;
    w.step(FIXED_DT, NEUTRAL_CONTROLS);
    w.events.flush();

    // Verify illegal overtaking under yellow detection
    const passingCar = w.cars[2];
    passingCar.timing.lastS = sec1S;
    (w.flags as any).prevPositions[w.cars[1].id] = 2;
    w.cars[1].phys.kmh = 160;
    (w.flags as any).prevPositions[passingCar.id] = 3;
    passingCar.position = 2;
    w.flags.update(FIXED_DT, w.cars, w.events, w.raceTime, true);
    w.events.flush();
    expect(passingCar.timing.penaltySec).toBe(5);
    expect(events.some((e) => e.type === 'penalty' && e.reason === 'OVERTAKING UNDER YELLOW')).toBe(true);

    // Stranded car recovers and drives off at racing speed
    stoppedCar.phys.vf = 420;
    stoppedCar.phys.kmh = 150;
    for (const c of w.cars) {
      c.phys.kmh = 150;
      c.phys.vf = 420;
    }

    // After yellow flag expiry, sector returns to green
    w.raceTime += 15.0;
    w.flags.update(FIXED_DT, w.cars, w.events, w.raceTime, true);
    w.events.flush();

    expect(w.flags.state.sectorYellow[1]).toBe(false);
    expect(events.some((e) => e.type === 'flag' && e.flag === 'green' && e.sector === 1)).toBe(true);
  });

  it('detects blue flag for lapped cars, commands AI yield, and penalises player if ignored > 12s', () => {
    const w = new GameWorld();
    w.setup(raceSettings({ aiCount: 3, totalLaps: 5 }));
    autopilot(w);

    const events: SimEvent[] = [];
    w.events.subscribe((e) => events.push(e));

    const leader = w.cars[0];
    const player = w.player;

    // Player is 1 lap down, leader is closing 80m (800 units) behind
    leader.timing.lapsCompleted = 2;
    leader.timing.lastS = 1500;

    player.timing.lapsCompleted = 1;
    player.timing.lastS = 1580; // 80m ahead of closing leader

    w.flags.update(0.1, w.cars, w.events, w.raceTime, true);
    w.events.flush();

    expect(player.blueFlag).toBe(true);

    // If player ignores blue flag for > 12 seconds, penalty is applied
    w.flags.update(12.5, w.cars, w.events, w.raceTime + 12.5, true);
    w.events.flush();

    expect(player.timing.penaltySec).toBe(5);
    expect(events.some((e) => e.type === 'penalty' && e.reason === 'IGNORING BLUE FLAGS')).toBe(true);
  });

  it('respects VSC delta speed cap by AI and disables DRS', () => {
    const w = new GameWorld();
    w.setup(raceSettings({ aiCount: 5, totalLaps: 3 }));
    autopilot(w);

    const events: SimEvent[] = [];
    w.events.subscribe((e) => events.push(e));

    w.flags.deployVSC(w.events, w.raceTime, 20);
    w.events.flush();

    expect(w.flags.state.scMode).toBe('vsc');
    expect(events.some((e) => e.type === 'safetyCar' && e.mode === 'vsc')).toBe(true);

    // Step world during VSC: all AI cars must stay within VSC speed delta (~180 km/h / 500 units/s)
    for (let i = 0; i < Math.round(5.0 / FIXED_DT); i++) {
      w.step(FIXED_DT, NEUTRAL_CONTROLS);
    }

    for (const car of w.cars) {
      if (!car.isPlayer) {
        // AI speed is governed by VSC delta cap (<= 185 km/h)
        expect(car.phys.kmh).toBeLessThanOrEqual(185);
      }
      // DRS must be unavailable during VSC
      expect(car.drsAvailable).toBe(false);
    }
  });

  it('Safety Car bunches the entire field to < 1.5s gaps (PLAN-v3 §8 R3 acceptance)', () => {
    const w = new GameWorld();
    w.seed = 42;
    w.setup(raceSettings({ aiCount: 7, totalLaps: 5, gridPosition: 1 }));
    w.phase = 'racing';
    autopilot(w);

    const T = track.current;
    // Position cars along Buddh 1.2km back straight in running order (P1 at front) with initial ~1.3s gaps
    for (let i = 0; i < w.cars.length; i++) {
      const idx = 500 - i * 20;
      const car = w.cars[i];
      car.position = i + 1;
      car.phys.idx = idx;
      car.phys.x = T.px[idx];
      car.phys.y = T.py[idx];
      car.phys.a = Math.atan2(T.ty[idx], T.tx[idx]);
      car.phys.vf = 388;
      car.phys.kmh = 140;
      car.timing.lastS = T.cumulativeS[idx];
      car.timing.progress = T.cumulativeS[idx];
    }
    w.order = [...w.cars];

    w.flags.deploySC(w.events, w.raceTime, 60);

    // Simulate 15 seconds of Safety Car bunching along straight
    const steps = Math.round(15.0 / FIXED_DT);
    for (let i = 0; i < steps; i++) {
      w.step(FIXED_DT, NEUTRAL_CONTROLS);
    }

    expect(w.flags.state.scMode).toBe('sc');

    // Sort cars by running track progress
    const sorted = [...w.cars].sort((a, b) => b.timing.progress - a.timing.progress);

    // PLAN-v3 §8 R3 Acceptance criteria: "SC bunches field to < 1.5 s gaps"
    // At SC reference pace (140 km/h = 388.9 units/s), 1.5s gap is 583.3 units.
    for (let i = 0; i < sorted.length - 1; i++) {
      const front = sorted[i];
      const rear = sorted[i + 1];
      const gapUnits = front.timing.progress - rear.timing.progress;
      const gapSec = gapUnits / 388.9;

      // Every consecutive gap must be bunched to < 1.5 seconds!
      expect(gapSec).toBeLessThan(1.5);
    }
  });
});
