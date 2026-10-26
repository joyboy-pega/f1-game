import { describe, expect, it } from 'vitest';
import { DRIVER_ROSTER } from '../constants';
import { NEUTRAL_CONTROLS } from '../controls';
import { GameWorld, FIXED_DT } from './world';
import { raceSettings } from './testutil';
import { sortQualifyingOrder } from './race';
import { createBrain } from './ai';
import type { SimEvent } from './events';

function autopilot(w: GameWorld) {
  w.player.ai = createBrain(99);
  w.player.skill = DRIVER_ROSTER[0].skill;
}

describe('Qualifying System (PLAN-v3 §8 R2)', () => {
  it('runs one-shot qualifying and emits qualifyingComplete event with grid order', () => {
    const w = new GameWorld();
    w.seed = 101;
    w.setup({
      ...raceSettings({ aiCount: 9 }),
      mode: 'qualifying',
      qualifyingFormat: 'oneshot',
    });
    autopilot(w);

    expect(w.isQualifying).toBe(true);
    expect(w.qualifyingFormat).toBe('oneshot');
    expect(w.phase).toBe('racing');
    expect(w.cars.length).toBe(10); // 9 AI + 1 player

    let completedGrid: string[] | null = null;
    w.events.subscribe((e: SimEvent) => {
      if (e.type === 'qualifyingComplete') completedGrid = e.grid;
    });

    // Simulate completion of player's flying lap
    w.player.timing.lapStartTime = 10.0;
    w.player.timing.bestLap = 89.452;
    w.player.timing.lapsCompleted = 1;

    // Set sample best lap times for AI cars
    const paceTimes = [88.92, 89.15, 89.82, 90.04, 90.55, 91.12, 91.88, 92.45, 93.10];
    const aiCars = w.cars.filter((c) => !c.isPlayer);
    for (let i = 0; i < aiCars.length; i++) {
      aiCars[i].timing.bestLap = paceTimes[i];
      aiCars[i].timing.lapsCompleted = 1;
    }

    // Step world to trigger order sort and qualifying completion check
    w.step(FIXED_DT, NEUTRAL_CONTROLS);
    w.events.flush();

    expect(w.phase).toBe('finished');
    expect(completedGrid).not.toBeNull();
    expect(completedGrid).toHaveLength(10);

    // Player lap (89.452) is between paceTimes[1] (89.15) and paceTimes[2] (89.82)
    // So player should be in 3rd position (index 2)
    expect(completedGrid![2]).toBe('player');
    expect(completedGrid![0]).toBe(aiCars[0].driver.code);
    expect(completedGrid![1]).toBe(aiCars[1].driver.code);
  });

  it('sorts cars by best valid lap time, placing invalid or no-time laps behind valid laps', () => {
    const w = new GameWorld();
    w.setup({
      ...raceSettings({ aiCount: 5 }),
      mode: 'qualifying',
      qualifyingFormat: 'oneshot',
    });

    const c0 = w.cars[0]; // 90.5s
    const c1 = w.cars[1]; // 88.2s (fastest)
    const c2 = w.cars[2]; // 92.1s
    const c3 = w.cars[3]; // null (invalid / no time)
    const c4 = w.cars[4]; // 89.9s
    const c5 = w.cars[5]; // null

    c0.timing.bestLap = 90.5;
    c1.timing.bestLap = 88.2;
    c2.timing.bestLap = 92.1;
    c3.timing.bestLap = null;
    c4.timing.bestLap = 89.9;
    c5.timing.bestLap = null;

    c3.timing.progress = 200;
    c5.timing.progress = 100;

    const list = [c0, c1, c2, c3, c4, c5];
    sortQualifyingOrder(list);

    // Order: 88.2s (c1) -> 89.9s (c4) -> 90.5s (c0) -> 92.1s (c2) -> no-time cars
    expect(list[0]).toBe(c1);
    expect(list[1]).toBe(c4);
    expect(list[2]).toBe(c0);
    expect(list[3]).toBe(c2);
    expect(list[4]).toBe(c3);
    expect(list[5]).toBe(c5);
  });

  it('replaces pseudo-qualifying and sets race starting grid to match qualifying result', () => {
    // 1. Establish qualifying order
    const qualifyingGrid = ['CAL', 'VAR', 'player', 'MOR', 'LIN', 'MAL', 'HAL', 'TAN', 'BEL', 'BRO'];

    // 2. Setup Grand Prix race with the qualifyingGrid result
    const w = new GameWorld();
    w.setup({
      ...raceSettings({ aiCount: 9 }),
      mode: 'race',
      qualifyingGrid,
    });

    expect(w.cars).toHaveLength(10);
    expect(w.player).toBeDefined();

    // Player qualified 3rd ('player' is index 2 in qualifyingGrid) -> starts P3
    expect(w.player.position).toBe(3);

    // Grid order must equal qualifying order (PLAN-v3 §8 R2 acceptance criteria)
    expect(w.cars[0].driver.code).toBe('CAL'); // Pole position (P1)
    expect(w.cars[1].driver.code).toBe('VAR'); // P2
    expect(w.cars[2].isPlayer).toBe(true);     // P3 (Player)
    expect(w.cars[3].driver.code).toBe('MOR'); // P4
    expect(w.cars[4].driver.code).toBe('LIN'); // P5
    expect(w.cars[5].driver.code).toBe('MAL'); // P6
    expect(w.cars[6].driver.code).toBe('HAL'); // P7
    expect(w.cars[7].driver.code).toBe('TAN'); // P8
    expect(w.cars[8].driver.code).toBe('BEL'); // P9
    expect(w.cars[9].driver.code).toBe('BRO'); // P10
  });

  it('runs short format 12-minute qualifying and decrements session countdown timer', () => {
    const w = new GameWorld();
    w.setup({
      ...raceSettings({ aiCount: 5 }),
      mode: 'qualifying',
      qualifyingFormat: 'short',
    });

    expect(w.qualifyingFormat).toBe('short');
    expect(w.qualifyingTimeRemaining).toBe(720); // 12 minutes

    // Advance 10 seconds of simulation
    for (let i = 0; i < Math.round(10.0 / FIXED_DT); i++) {
      w.step(FIXED_DT, NEUTRAL_CONTROLS);
    }

    expect(w.qualifyingTimeRemaining).toBeCloseTo(710, 0.1);
    expect(w.phase).toBe('racing');
  });
});
