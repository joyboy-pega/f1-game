import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type GameSettings } from '../gameState';
import { NEUTRAL_CONTROLS } from '../controls';
import { DRIVER_ROSTER } from '../constants';
import { GameWorld, FIXED_DT } from './world';
import { createBrain } from './ai';

const SEED = 12345;

function goldenSettings(): GameSettings {
  return { ...DEFAULT_SETTINGS, mode: 'race', totalLaps: 3, aiCount: 9, difficulty: 'pro', weather: 'sunny', gridPosition: 10 };
}

/** FNV-1a over a string: tiny, dependency-free, stable across platforms. */
function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Runs the golden race and returns a digest string (human-readable) of finish order + lap times. */
function runGoldenRace(): { digest: string; simSeconds: number } {
  const w = new GameWorld();
  w.seed = SEED;
  w.setup(goldenSettings());
  // The AI drives the player too so the race is headless and fully deterministic.
  w.player.ai = createBrain(99);
  w.player.skill = DRIVER_ROSTER[0].skill;
  const laps = new Map<number, number[]>();
  w.events.subscribe((e) => {
    if (e.type === 'lap') {
      const list = laps.get(e.carId) ?? [];
      list.push(e.time);
      laps.set(e.carId, list);
    }
  });
  const maxSteps = Math.round(900 / FIXED_DT);
  let steps = 0;
  while (steps < maxSteps && !w.cars.every((c) => c.timing.finished)) {
    w.step(FIXED_DT, NEUTRAL_CONTROLS);
    w.events.flush();
    steps++;
  }
  const finishOrder = w.cars
    .filter((c) => c.timing.finished)
    .sort((a, b) => (a.timing.finishTime ?? 0) - (b.timing.finishTime ?? 0))
    .map((c) => c.id);
  const lapText = w.cars.map((c) => `${c.id}:${(laps.get(c.id) ?? []).map((t) => t.toFixed(6)).join(',')}`).join('|');
  return { digest: `order=${finishOrder.join(',')};${lapText}`, simSeconds: steps * FIXED_DT };
}

describe('golden race (R5/R6)', () => {
  it('finishes within the time cap', () => {
    const { digest, simSeconds } = runGoldenRace();
    expect(simSeconds).toBeLessThan(900);
    expect(digest.startsWith('order=')).toBe(true);
  });

  it('is deterministic: the same seed twice in one process gives an identical digest', () => {
    expect(runGoldenRace().digest).toBe(runGoldenRace().digest);
  });

  it('matches the recorded golden hash', () => {
    const { digest } = runGoldenRace();
    // Update ONLY when behaviour changes on purpose (R5), and log old/new values in docs/WORKLOG.md.
    console.log(`[golden] ${digest}`);
    expect(fnv1a(digest)).toBe('9c69d82f');
  });
});

describe('determinism rules (R6)', () => {
  const root = path.resolve(__dirname, '..');
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) return sourceFiles(full);
      return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) && name !== 'testutil.ts' ? [full] : [];
    });
  }
  const files = [
    ...sourceFiles(path.join(root, 'sim')),
    path.join(root, 'physics.ts'),
    ...readdirSync(root).filter((n) => /^physics.*\.ts$/.test(n)).map((n) => path.join(root, n)),
    ...(statSync(path.join(root, 'vehicle'), { throwIfNoEntry: false })?.isDirectory() ? sourceFiles(path.join(root, 'vehicle')) : []),
  ];

  it('scans a plausible set of files', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('sim/physics/vehicle code has no Date.now or performance.now', () => {
    const offenders = files.filter((f) => /Date\.now|performance\.now/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('Math.random appears only in the seed fallback in world.ts', () => {
    const hits: string[] = [];
    for (const f of files) {
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        if (line.includes('Math.random') && !line.trimStart().startsWith('//')) hits.push(`${path.relative(root, f)}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatch(/^sim\/world\.ts:\d+: this\.rand = makeRng\(this\.seed \?\? Math\.floor\(Math\.random\(\)/);
  });
});

describe('sim cost (logged, not asserted)', () => {
  it('12 cars: wall time per simulated second', () => {
    const w = new GameWorld();
    w.seed = SEED;
    w.setup({ ...goldenSettings(), aiCount: 11, totalLaps: 50 });
    w.player.ai = createBrain(99);
    w.player.skill = DRIVER_ROSTER[0].skill;
    const simSeconds = 30;
    const steps = Math.round(simSeconds / FIXED_DT);
    // Warm up past the start sequence and JIT.
    for (let i = 0; i < Math.round(12 / FIXED_DT); i++) w.step(FIXED_DT, NEUTRAL_CONTROLS);
    const t0 = performance.now();
    for (let i = 0; i < steps; i++) {
      w.step(FIXED_DT, NEUTRAL_CONTROLS);
      w.events.flush();
    }
    const ms = performance.now() - t0;
    console.log(`[bench] 12 cars: ${(ms / simSeconds).toFixed(2)} ms per simulated second (${simSeconds}s sim, ${ms.toFixed(0)} ms wall)`);
    expect(ms).toBeGreaterThan(0);
  });
});
