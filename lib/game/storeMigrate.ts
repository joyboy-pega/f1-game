import { DEFAULT_INPUT_SETTINGS, type GameSettings } from './gameState';
import { migrateBestLapKeys } from './records';

/** Persisted store shape (only the parts a migration touches). */
export interface PersistedStore {
  settings?: Partial<GameSettings>;
  records?: unknown;
}

/** Version of the persisted `buddh-gp` store. Bump when the shape changes and add a step to `migrateStore`. */
export const STORE_VERSION = 4;

/**
 * v1 -> v2: settings gained `trackId` (the game had one circuit, Buddh). Missing or non-string values become 'buddh'.
 * v2 -> v3: `records.bestLaps` keys gained the track id (`buddh:` prefix on the old `<mode>:<weather>` keys).
 * v3 -> v4: settings gained `input` (A3 keyboard ramp and gamepad / wheel calibration and remapping).
 * Never throws on junk input: an unusable payload is passed through for the store's `merge` to fill with defaults.
 */
export function migrateStore(persisted: unknown, fromVersion: number): unknown {
  if (!persisted || typeof persisted !== 'object') return persisted;
  const p = persisted as PersistedStore;
  let out: PersistedStore = p;
  if (fromVersion < 2) {
    const settings = { ...(out.settings ?? {}) } as Partial<GameSettings>;
    if (typeof settings.trackId !== 'string') settings.trackId = 'buddh';
    out = { ...out, settings };
  }
  if (fromVersion < 3) {
    // v3: best-lap keys gained the track id prefix; every pre-existing lap was set on Buddh.
    const records = out.records as { bestLaps?: Record<string, number> } | undefined;
    if (records && typeof records === 'object' && records.bestLaps && typeof records.bestLaps === 'object') {
      out = { ...out, records: { ...records, bestLaps: migrateBestLapKeys(records.bestLaps) } };
    }
  }
  if (fromVersion < 4) {
    const settings = { ...(out.settings ?? {}) } as Partial<GameSettings>;
    settings.input = { ...DEFAULT_INPUT_SETTINGS, ...(settings.input ?? {}) };
    out = { ...out, settings };
  }
  return out === p ? persisted : out;
}
