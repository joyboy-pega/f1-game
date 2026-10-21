import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type GameSettings } from '../gameState';
import { NEUTRAL_CONTROLS } from '../controls';
import { DRIVER_ROSTER } from '../constants';
import { GameWorld, FIXED_DT } from './world';
import { createBrain } from './ai';

function raceSettings(patch: Partial<GameSettings> = {}): GameSettings {
  return { ...DEFAULT_SETTINGS, mode: 'race', totalLaps: 2, aiCount: 5, gridPosition: 3, ...patch };
}

/** Let the AI controller drive the player too, so a full race can run headless. */
function autopilotPlayer(w: GameWorld) {
  w.player.ai = createBrain(99);
  w.player.skill = DRIVER_ROSTER[0].skill;
}

function run(w: GameWorld, seconds: number, until?: () => boolean) {
  const steps = Math.round(seconds / FIXED_DT);
  for (let i = 0; i < steps; i++) {
    w.step(FIXED_DT, NEUTRAL_CONTROLS);
    w.events.flush();
    if (until?.()) return;
  }
}

describe('GameWorld race session', () => {
  it('builds the grid with the player in the requested slot', () => {
    const w = new GameWorld();
    w.setup(raceSettings());
    expect(w.cars).toHaveLength(6);
    expect(w.player.position).toBe(3);
    expect(w.cars.every((c) => c.timing.progress < 0)).toBe(true);
    expect(w.phase).toBe('grid');
  });

  it('holds every car still until lights out', () => {
    const w = new GameWorld();
    w.setup(raceSettings());
    const start = w.cars.map((c) => [c.phys.x, c.phys.y]);
    const full = { ...NEUTRAL_CONTROLS, throttle: 1 };
    let lightsSeen = 0;
    w.events.subscribe((e) => {
      if (e.type === 'lightsOn') lightsSeen = Math.max(lightsSeen, e.count);
    });
    for (let i = 0; i < Math.round(6 / FIXED_DT) && w.phase !== 'racing'; i++) {
      w.step(FIXED_DT, full);
      w.events.flush();
    }
    expect(lightsSeen).toBe(5);
    w.cars.forEach((c, i) => {
      expect(c.phys.x).toBeCloseTo(start[i][0]);
      expect(c.phys.y).toBeCloseTo(start[i][1]);
    });
    run(w, 3, () => w.phase === 'racing');
    expect(w.phase).toBe('racing');
  });

  it('runs a full race: laps, finish order and classification are consistent', () => {
    const w = new GameWorld();
    w.setup(raceSettings());
    autopilotPlayer(w);
    const laps: number[] = [];
    w.events.subscribe((e) => {
      if (e.type === 'lap') laps.push(e.time);
    });
    run(w, 600, () => w.cars.every((c) => c.timing.finished));

    expect(w.cars.every((c) => c.timing.finished)).toBe(true);
    expect(laps.length).toBeGreaterThanOrEqual(w.cars.length * 2);
    for (const t of laps) {
      expect(t).toBeGreaterThan(40);
      expect(t).toBeLessThan(240);
    }

    const results = w.buildResults();
    expect(results.classification.map((r) => r.position)).toEqual([1, 2, 3, 4, 5, 6]);
    const times = results.classification.map((r) => r.totalTime!);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(results.fastestLap).not.toBeNull();
  });

  it('produces time gaps (not distances) in the timing tower', () => {
    const w = new GameWorld();
    w.setup(raceSettings({ totalLaps: 3 }));
    autopilotPlayer(w);
    run(w, 60);
    const hud = w.buildHud();
    expect(hud.order[0].gapToLeader).toBe('LEADER');
    for (const row of hud.order.slice(1)) expect(row.gapToLeader).toMatch(/^\+\d+\.\d{3}$/);
  });

  it('time trial starts racing immediately with an untimed out-lap', () => {
    const w = new GameWorld();
    w.setup({ ...DEFAULT_SETTINGS, mode: 'timetrial' });
    autopilotPlayer(w);
    expect(w.cars).toHaveLength(1);
    expect(w.phase).toBe('racing');
    const laps: number[] = [];
    w.events.subscribe((e) => {
      if (e.type === 'lap') laps.push(e.time);
    });
    run(w, 400, () => laps.length >= 2);
    expect(laps.length).toBe(2);
    expect(w.player.timing.bestLapTrace).not.toBeNull();
  });
});
