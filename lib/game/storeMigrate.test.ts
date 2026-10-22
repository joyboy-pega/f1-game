import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './gameState';
import { STORE_VERSION, migrateStore } from './storeMigrate';

describe('persisted store migration', () => {
  it('v1 -> v2 adds trackId "buddh" and keeps every other setting and the records', () => {
    const v1 = { settings: { difficulty: 'legend', totalLaps: 7, quality: 'LOW' }, records: { racesStarted: 12 } };
    const out = migrateStore(v1, 1) as { settings: Record<string, unknown>; records: unknown };
    expect(out.settings.trackId).toBe('buddh');
    expect(out.settings.difficulty).toBe('legend');
    expect(out.settings.totalLaps).toBe(7);
    expect(out.settings.quality).toBe('LOW');
    expect(out.records).toEqual({ racesStarted: 12 });
    expect(v1.settings).not.toHaveProperty('trackId'); // input not mutated
  });

  it('keeps a valid trackId and replaces a junk one', () => {
    expect((migrateStore({ settings: { trackId: 'monza' } }, 1) as { settings: { trackId: string } }).settings.trackId).toBe('monza');
    expect((migrateStore({ settings: { trackId: 42 } }, 1) as { settings: { trackId: string } }).settings.trackId).toBe('buddh');
  });

  it('handles a store with no settings, and junk payloads, without throwing', () => {
    expect((migrateStore({}, 1) as { settings: { trackId: string } }).settings.trackId).toBe('buddh');
    expect(migrateStore(null, 1)).toBeNull();
    expect(migrateStore('x', 1)).toBe('x');
  });

  it('leaves a current-version store untouched', () => {
    const v2 = { settings: { trackId: 'buddh' } };
    expect(migrateStore(v2, STORE_VERSION)).toBe(v2);
  });

  it('defaults include trackId and the version is 2', () => {
    expect(DEFAULT_SETTINGS.trackId).toBe('buddh');
    expect(STORE_VERSION).toBe(2);
  });
});
