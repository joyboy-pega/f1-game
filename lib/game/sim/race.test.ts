import { describe, expect, it } from 'vitest';
import { TRACK_LENGTH } from '../constants';
import { NEUTRAL_CONTROLS } from '../controls';
import { EventBus, type SimEvent } from './events';
import { advanceTiming, createOverallBests } from './race';
import { FIXED_DT, GameWorld } from './world';
import { autopilotPlayer, raceSettings, run, runRace } from './testutil';

function freshWorld(patch: Parameters<typeof raceSettings>[0] = {}, seed = 1) {
  const w = new GameWorld();
  w.seed = seed;
  w.setup(raceSettings(patch));
  return w;
}

describe('AI racing', () => {
  const w = freshWorld({ totalLaps: 5, aiCount: 9, gridPosition: 10 });
  autopilotPlayer(w);
  const { logs, swaps } = runRace(w, 900);

  it('finishes a 5-lap race with a full classification', () => {
    expect(w.cars.every((c) => c.timing.finished)).toBe(true);
    expect(w.buildResults().classification).toHaveLength(10);
  });

  it('produces real position changes', () => {
    expect(swaps).toBeGreaterThanOrEqual(2);
  });

  it('keeps cars on the asphalt', () => {
    for (const l of logs) expect(l.offTrack).toBeLessThan(8);
  });

  it('keeps tyre temperatures in a sane window', () => {
    for (const l of logs) {
      expect(l.minTemp).toBeGreaterThan(55);
      expect(l.maxTemp).toBeLessThan(125);
    }
  });

  it('wears softs to roughly 25–55 % over five laps', () => {
    for (const c of w.cars) {
      expect(c.phys.tires.avgWear).toBeGreaterThan(0.2);
      expect(c.phys.tires.avgWear).toBeLessThan(0.6);
    }
  });

  it('turns repeat track-limit warnings into +5 s penalties', () => {
    for (const c of w.cars) {
      expect(c.timing.penaltySec).toBe(Math.max(0, c.timing.trackLimitWarnings - 2) * 5);
    }
  });

  it('orders difficulty tiers by pace', () => {
    const mean = (difficulty: 'rookie' | 'pro' | 'legend') => {
      const world = freshWorld({ totalLaps: 3, aiCount: 5, difficulty });
      autopilotPlayer(world);
      const laps: number[] = [];
      world.events.subscribe((e) => e.type === 'lap' && laps.push(e.time));
      runRace(world, 600);
      return laps.reduce((a, b) => a + b, 0) / laps.length;
    };
    const [rookie, pro, legend] = [mean('rookie'), mean('pro'), mean('legend')];
    expect(rookie).toBeGreaterThan(pro * 1.04);
    expect(legend).toBeLessThan(pro);
  });
});

describe('DRS rules', () => {
  it('is never available on lap 1, and only opens when available', () => {
    const w = freshWorld({ totalLaps: 5, aiCount: 9, gridPosition: 10 });
    autopilotPlayer(w);
    let availableOnLap1 = false;
    let everAvailable = false;
    let openedWithoutPermission = 0;
    const wasOpen = new Map<number, boolean>();
    run(w, 600, () => {
      for (const c of w.cars) {
        if (c.drsAvailable) {
          everAvailable = true;
          if (c.timing.lapsCompleted < 1) availableOnLap1 = true;
        }
        const was = wasOpen.get(c.id) ?? false;
        if (c.phys.drsOpen && !was && !c.drsAvailable) openedWithoutPermission++;
        wasOpen.set(c.id, c.phys.drsOpen);
      }
      return w.cars.every((c) => c.timing.finished);
    });
    expect(availableOnLap1).toBe(false);
    expect(everAvailable).toBe(true);
    expect(openedWithoutPermission).toBe(0);
  });
});

describe('collisions', () => {
  it('separates overlapping cars and reports the contact', () => {
    const w = freshWorld({ aiCount: 3, gridPosition: 3 });
    const events: SimEvent[] = [];
    w.events.subscribe((e) => events.push(e));
    run(w, 10, () => w.phase === 'racing');
    const [a, b] = [w.cars[0], w.cars[1]];
    b.phys.x = a.phys.x + 4;
    b.phys.y = a.phys.y + 4;
    b.phys.a = a.phys.a;
    // closing at ~90 u/s so the contact is above the event threshold
    b.phys.vx = a.phys.vx - 63;
    b.phys.vy = a.phys.vy - 63;
    const before = Math.hypot(b.phys.x - a.phys.x, b.phys.y - a.phys.y);
    run(w, 0.25);
    const after = Math.hypot(b.phys.x - a.phys.x, b.phys.y - a.phys.y);
    expect(after).toBeGreaterThan(before + 4);
    expect(Number.isFinite(a.phys.x + a.phys.y + b.phys.x + b.phys.y)).toBe(true);
    expect(events.some((e) => e.type === 'collision')).toBe(true);
  });
});

describe('pit stops', () => {
  const lapsTotal = 3;
  const finishTime = (withStop: boolean) => {
    const w = freshWorld({ totalLaps: lapsTotal, aiCount: 3, gridPosition: 4 });
    autopilotPlayer(w);
    if (withStop) {
      w.player.pitRequest = true;
      w.player.nextCompound = 'hard';
    }
    const events: SimEvent[] = [];
    w.events.subscribe((e) => events.push(e));
    run(w, 600, () => w.player.timing.finished);
    return { w, events, time: w.player.timing.finishTime! };
  };

  const stop = finishTime(true);
  const clean = finishTime(false);

  it('completes the full stop and fits the chosen compound', () => {
    expect(stop.w.player.timing.pitStops).toBe(1);
    expect(stop.w.player.compound).toBe('hard');
    expect(stop.w.player.inPit).toBe(false);
    expect(stop.events.some((e) => e.type === 'pitEnter' && e.carId === stop.w.player.id)).toBe(true);
    expect(stop.events.some((e) => e.type === 'pitExit' && e.carId === stop.w.player.id)).toBe(true);
  });

  it('costs roughly 15–35 s versus staying out', () => {
    const cost = stop.time - clean.time;
    expect(cost).toBeGreaterThan(15);
    expect(cost).toBeLessThan(35);
  });

  it('gives fresh tyres', () => {
    expect(stop.w.player.phys.tires.avgWear).toBeLessThan(clean.w.player.phys.tires.avgWear);
  });
});

describe('lap counting', () => {
  it('cannot be gained by reversing over the start line', () => {
    const w = new GameWorld();
    w.setup({ ...raceSettings(), mode: 'timetrial' });
    const car = w.player;
    const events = new EventBus();
    const ctx = { raceTime: 0, dt: FIXED_DT, standingStart: false, overall: createOverallBests(), events };
    const L = TRACK_LENGTH;
    const sweep = (from: number, to: number) => {
      const step = (to - from) / 400;
      for (let i = 0; i <= 400; i++) {
        ctx.raceTime += FIXED_DT;
        advanceTiming(car, (((from + step * i) % L) + L) % L, ctx);
      }
    };
    sweep(L - 200, L + 200); // forward over the line (untimed out-lap)
    const lapsAfterFirst = car.timing.lapsCompleted;
    sweep(L + 200, L - 200); // reverse back over it
    sweep(L - 200, L + 200); // and forward again
    expect(car.timing.lapsCompleted).toBe(lapsAfterFirst);
    expect(car.timing.lapTimes).toHaveLength(0);
  });
});

describe('controls neutral', () => {
  it('a parked player never moves before lights out', () => {
    const w = freshWorld();
    const x = w.player.phys.x;
    for (let i = 0; i < 300; i++) w.step(FIXED_DT, { ...NEUTRAL_CONTROLS, throttle: 1 });
    expect(w.phase).not.toBe('racing');
    expect(w.player.phys.x).toBeCloseTo(x);
  });
});
