import { describe, expect, it } from 'vitest';
import { GHOST_STRIDE, ghostKey, migrateLegacyGhostKeys, parseGhost, serializeGhost, type GhostLap } from './ghost';

function fakeStorage(initial: Record<string, string>) {
  const m = new Map(Object.entries(initial));
  return {
    m,
    api: {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    },
  };
}

const lap = (trackId: string): GhostLap => ({ trackId, weather: 'sunny', lapTime: 1, n: 2, data: new Float32Array(2 * GHOST_STRIDE) });

describe('ghost keys', () => {
  it('are scoped by track and weather', () => {
    expect(ghostKey('buddh', 'sunny')).toBe('buddh-gp-ghost:buddh:sunny');
    expect(ghostKey('monza', 'sunny')).not.toBe(ghostKey('buddh', 'sunny'));
  });

  it('round-trips the track id; a ghost saved without one is Buddh', () => {
    expect(parseGhost(serializeGhost(lap('monza')))!.trackId).toBe('monza');
    const legacy = JSON.parse(serializeGhost(lap('buddh')));
    delete legacy.k;
    expect(parseGhost(JSON.stringify(legacy))!.trackId).toBe('buddh');
  });
});

describe('migrateLegacyGhostKeys', () => {
  it('moves old per-weather ghosts under the buddh track and deletes the old keys', () => {
    const f = fakeStorage({ 'buddh-gp-ghost:sunny': 'A', 'buddh-gp-ghost:rain': 'B', other: 'x' });
    expect(migrateLegacyGhostKeys(f.api)).toBe(2);
    expect(f.m.get('buddh-gp-ghost:buddh:sunny')).toBe('A');
    expect(f.m.get('buddh-gp-ghost:buddh:rain')).toBe('B');
    expect(f.m.has('buddh-gp-ghost:sunny')).toBe(false);
    expect(f.m.get('other')).toBe('x');
  });

  it('never overwrites an existing new-style ghost, and is idempotent', () => {
    const f = fakeStorage({ 'buddh-gp-ghost:sunny': 'OLD', 'buddh-gp-ghost:buddh:sunny': 'NEW' });
    expect(migrateLegacyGhostKeys(f.api)).toBe(0);
    expect(f.m.get('buddh-gp-ghost:buddh:sunny')).toBe('NEW');
    expect(f.m.has('buddh-gp-ghost:sunny')).toBe(false);
    expect(migrateLegacyGhostKeys(f.api)).toBe(0);
  });

  it('survives a storage that throws', () => {
    const boom = { getItem: () => { throw new Error('denied'); }, setItem: () => {}, removeItem: () => {} };
    expect(migrateLegacyGhostKeys(boom)).toBe(0);
  });
});
