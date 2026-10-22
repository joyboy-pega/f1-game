import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type GameSettings } from '../gameState';
import { NEUTRAL_CONTROLS } from '../controls';
import { DRIVER_ROSTER } from '../constants';
import { GameWorld, FIXED_DT } from './world';
import { createBrain } from './ai';
import { track } from '../track';

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

describe('GameWorld edge-triggered input', () => {
  type Trigger = 'drsToggleRequested' | 'resetRequested' | 'pitStopRequested' | 'compoundCycleRequested' | 'brakeBiasUp';

  /** Records the player's trigger flag as each fixed step sees it. */
  function spyOnSteps(w: GameWorld, key: Trigger): boolean[] {
    const seen: boolean[] = [];
    const priv = w as unknown as { fixedStep: (dt: number) => void };
    const orig = priv.fixedStep.bind(w);
    priv.fixedStep = (dt: number) => {
      seen.push(w.player.ctrl[key]);
      orig(dt);
    };
    return seen;
  }

  const triggers: Trigger[] = ['drsToggleRequested', 'resetRequested', 'pitStopRequested', 'compoundCycleRequested', 'brakeBiasUp'];

  for (const key of triggers) {
    it(`${key} pressed on a zero-step frame is applied exactly once`, () => {
      const w = new GameWorld();
      w.setup({ ...DEFAULT_SETTINGS, mode: 'timetrial' });
      const seen = spyOnSteps(w, key);
      // 4 ms is less than one 8.33 ms fixed step, so this frame runs no step.
      w.step(0.004, { ...NEUTRAL_CONTROLS, [key]: true });
      expect(seen).toHaveLength(0);
      // 5 ms later the accumulator crosses one step; the latched press must arrive now.
      w.step(0.005, NEUTRAL_CONTROLS);
      expect(seen).toEqual([true]);
      for (let i = 0; i < 5; i++) w.step(FIXED_DT, NEUTRAL_CONTROLS);
      expect(seen.slice(1).every((v) => v === false)).toBe(true);
    });
  }

  it('a press on a multi-step frame reaches only the first step', () => {
    const w = new GameWorld();
    w.setup({ ...DEFAULT_SETTINGS, mode: 'timetrial' });
    const seen = spyOnSteps(w, 'drsToggleRequested');
    w.step(FIXED_DT * 3 + 0.0001, { ...NEUTRAL_CONTROLS, drsToggleRequested: true });
    expect(seen).toEqual([true, false, false]);
  });

  it('presses made while paused are dropped, not replayed on resume', () => {
    const w = new GameWorld();
    w.setup({ ...DEFAULT_SETTINGS, mode: 'timetrial' });
    const seen = spyOnSteps(w, 'resetRequested');
    w.paused = true;
    w.step(0.004, { ...NEUTRAL_CONTROLS, resetRequested: true });
    w.paused = false;
    w.step(FIXED_DT, NEUTRAL_CONTROLS);
    expect(seen).toEqual([false]);
  });

  it('a press latched before setup() does not leak into the next session', () => {
    const w = new GameWorld();
    w.setup({ ...DEFAULT_SETTINGS, mode: 'timetrial' });
    w.step(0.004, { ...NEUTRAL_CONTROLS, pitStopRequested: true });
    w.setup({ ...DEFAULT_SETTINGS, mode: 'timetrial' });
    const seen = spyOnSteps(w, 'pitStopRequested');
    w.step(FIXED_DT, NEUTRAL_CONTROLS);
    expect(seen).toEqual([false]);
  });
});

describe('GameWorld track selection', () => {
  it('setup() activates the settings track and falls back to the default for an unknown id', () => {
    const w = new GameWorld();
    w.setup({ ...DEFAULT_SETTINGS, mode: 'timetrial', trackId: 'buddh' });
    expect(track.current.meta.id).toBe('buddh');
    expect(() => w.setup({ ...DEFAULT_SETTINGS, mode: 'timetrial', trackId: 'does-not-exist' })).not.toThrow();
    expect(track.current.meta.id).toBe('buddh');
    expect(w.cars).toHaveLength(1);
  });
});

describe('pit lane speed limit (units)', () => {
  it('an AI car in the pit lane stays under the 80 km/h limit once it is limited, and the stop completes', () => {
    const w = new GameWorld();
    w.seed = 4242;
    w.setup(raceSettings({ totalLaps: 3, aiCount: 3 }));
    autopilotPlayer(w);
    const car = w.cars.find((c) => !c.isPlayer)!;
    car.pitRequest = true;
    let maxKmh = 0;
    let pitSeen = false;
    let exited = false;
    w.events.subscribe((e) => {
      if (e.type === 'pitExit' && e.carId === car.id) exited = true;
    });
    run(w, 300, () => {
      if (car.pit) {
        pitSeen = true;
        // 'enter' takes the car over at race speed and brakes it down; the limiter applies from 'approach' on.
        if (car.pit.stage === 'approach' || car.pit.stage === 'service' || car.pit.stage === 'depart') {
          maxKmh = Math.max(maxKmh, car.phys.kmh);
        }
      }
      return exited && !car.pit;
    });
    expect(pitSeen).toBe(true);
    expect(exited).toBe(true);
    // the controller aims 3 % under the limit; allow a little overshoot on entry
    expect(maxKmh).toBeLessThan(80 * 1.04);
    expect(maxKmh).toBeGreaterThan(40); // it did drive down the lane at limiter speed
  });
});
