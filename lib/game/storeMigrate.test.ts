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

  it('defaults include trackId and the version is 3', () => {
    expect(DEFAULT_SETTINGS.trackId).toBe('buddh');
    expect(STORE_VERSION).toBe(3);
  });

  it('v2 -> v3 prefixes legacy best-lap keys with buddh: and keeps new-style keys', () => {
    const v2 = {
      settings: { trackId: 'buddh' },
      records: { racesStarted: 3, bestLaps: { 'timetrial:sunny': 90.5, 'practice:rain': 101.2, 'monza:timetrial:sunny': 80.1 } },
    };
    const out = migrateStore(v2, 2) as { records: { racesStarted: number; bestLaps: Record<string, number> } };
    expect(out.records.bestLaps).toEqual({ 'buddh:timetrial:sunny': 90.5, 'buddh:practice:rain': 101.2, 'monza:timetrial:sunny': 80.1 });
    expect(out.records.racesStarted).toBe(3);
    expect(v2.records.bestLaps).toHaveProperty('timetrial:sunny'); // input not mutated
  });

  it('v1 -> v3 runs both steps', () => {
    const out = migrateStore({ settings: {}, records: { bestLaps: { 'timetrial:sunny': 88 } } }, 1) as {
      settings: { trackId: string };
      records: { bestLaps: Record<string, number> };
    };
    expect(out.settings.trackId).toBe('buddh');
    expect(out.records.bestLaps).toEqual({ 'buddh:timetrial:sunny': 88 });
  });

  it('tolerates records without bestLaps or with junk entries', () => {
    expect(() => migrateStore({ records: {} }, 2)).not.toThrow();
    expect(() => migrateStore({ records: { bestLaps: null } }, 2)).not.toThrow();
    const out = migrateStore({ records: { bestLaps: { 'timetrial:sunny': 'fast', 'practice:sunny': 70 } } }, 2) as {
      records: { bestLaps: Record<string, number> };
    };
    expect(out.records.bestLaps).toEqual({ 'buddh:practice:sunny': 70 });
  });
});
