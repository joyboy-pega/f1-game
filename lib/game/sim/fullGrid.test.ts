import { describe, expect, it } from 'vitest';
import { DRIVER_ROSTER, MAX_AI_CARS } from '../constants';
import { NEUTRAL_CONTROLS } from '../controls';
import { track } from '../track';
import { GameWorld, FIXED_DT } from './world';
import { raceSettings } from './testutil';
import { gridSlotIndex } from './race';
import { createBrain } from './ai';

function autopilotAll(w: GameWorld) {
  w.player.ai = createBrain(99);
  w.player.skill = DRIVER_ROSTER[0].skill;
}

describe('Full 20-car Grid (PLAN-v3 §8 R4)', () => {
  it('defines 2-car teams with unique driver timing codes and car numbers in DRIVER_ROSTER', () => {
    expect(DRIVER_ROSTER.length).toBeGreaterThanOrEqual(20);
    expect(MAX_AI_CARS).toBe(19);

    const codes = new Set<string>();
    const numbers = new Set<number>();
    const teamCounts = new Map<string, number>();

    for (const d of DRIVER_ROSTER) {
      expect(d.code).toHaveLength(3);
      expect(codes.has(d.code)).toBe(false);
      codes.add(d.code);

      expect(d.livery.number).toBeGreaterThan(0);
      expect(numbers.has(d.livery.number)).toBe(false);
      numbers.add(d.livery.number);

      teamCounts.set(d.team, (teamCounts.get(d.team) || 0) + 1);
    }

    // Every team in the roster has 2 drivers (2-car teams)
    for (const [, count] of teamCounts.entries()) {
      expect(count).toBe(2);
    }
  });

  it('builds a 20-car grid (19 AI + 1 player) arranged in 10 staggered 2-car rows behind the line', () => {
    const w = new GameWorld();
    w.setup(raceSettings({ aiCount: 19, gridPosition: 20, totalLaps: 2 }));

    expect(w.cars).toHaveLength(20);
    expect(w.player).toBeDefined();
    expect(w.player.position).toBe(20);
    expect(w.phase).toBe('grid');

    // Verify 10 staggered rows of 2 cars
    for (let slot = 0; slot < 20; slot++) {
      const car = w.cars[slot];
      expect(car.timing.progress).toBeLessThan(0);
      expect(car.timing.lapsCompleted).toBe(-1);

      // Staggered lateral alternating positions
      const hw = track.current.halfWidth[car.phys.idx];
      const expectedSide = slot % 2 === 0 ? -1 : 1;
      expect(Math.sign(car.lateral)).toBe(expectedSide);
      expect(Math.abs(car.lateral)).toBeCloseTo(hw * 0.42, 1);

      // Check grid index matches gridSlotIndex
      expect(car.phys.idx).toBe(gridSlotIndex(slot));
    }

    // Verify grid slot spacing is monotonically further behind line
    const N = track.current.N;
    for (let slot = 1; slot < 20; slot++) {
      const prevIdx = gridSlotIndex(slot - 1);
      const currIdx = gridSlotIndex(slot);
      // currIdx is further back (smaller index or wrapped around N)
      let distBehind = prevIdx - currIdx;
      if (distBehind < 0) distBehind += N;
      expect(distBehind).toBe(4); // 4 spline indices (~10m) between successive slots
    }
  });

  it('executes a full 20-car race start and sim steps with all cars racing cleanly', async () => {
    const w = new GameWorld();
    w.seed = 42;
    w.setup(raceSettings({ aiCount: 19, gridPosition: 10, totalLaps: 2 }));
    autopilotAll(w);

    const neutral = NEUTRAL_CONTROLS;
    const fullThrottle = { ...NEUTRAL_CONTROLS, throttle: 1 };

    let lightsOutSeen = false;
    w.events.subscribe((e) => {
      if (e.type === 'lightsOut') lightsOutSeen = true;
    });

    // Step through grid hold and 5-light sequence until lights out (up to 9s)
    const maxStartSteps = Math.round(10.0 / FIXED_DT);
    for (let i = 0; i < maxStartSteps && w.phase !== 'racing'; i++) {
      w.step(FIXED_DT, fullThrottle);
      w.events.flush();
    }

    expect(w.phase).toBe('racing');
    expect(lightsOutSeen).toBe(true);

    // Simulate 15 seconds of full 20-car race pack racing
    const raceSteps = Math.round(15.0 / FIXED_DT); // 1800 simulation steps
    for (let i = 0; i < raceSteps; i++) {
      w.step(FIXED_DT, neutral);
      w.events.flush();
    }

    // All 20 cars must be actively driving with positive speed, finite coordinates, and valid progression
    for (const car of w.cars) {
      expect(Number.isFinite(car.phys.x)).toBe(true);
      expect(Number.isFinite(car.phys.y)).toBe(true);
      expect(Number.isFinite(car.phys.kmh)).toBe(true);
      expect(car.phys.kmh).toBeGreaterThan(35); // Racing at speed through T1
      expect(car.timing.progress).toBeGreaterThan(-100); // Progressing down the circuit
    }

    // Check positions are valid 1..20
    const positions = w.cars.map((c) => c.position).sort((a, b) => a - b);
    expect(positions).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  });
});
