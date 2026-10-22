import type { GameSettings } from './gameState';

/** Persisted store shape (only the parts a migration touches). */
export interface PersistedStore {
  settings?: Partial<GameSettings>;
  records?: unknown;
}

/** Version of the persisted `buddh-gp` store. Bump when the shape changes and add a step to `migrateStore`. */
export const STORE_VERSION = 2;

/**
 * v1 -> v2: settings gained `trackId` (the game had one circuit, Buddh). Missing or non-string values become 'buddh'.
 * Never throws on junk input: an unusable payload is passed through for the store's `merge` to fill with defaults.
 */
export function migrateStore(persisted: unknown, fromVersion: number): unknown {
  if (!persisted || typeof persisted !== 'object') return persisted;
  const p = persisted as PersistedStore;
  if (fromVersion < 2) {
    const settings = { ...(p.settings ?? {}) } as Partial<GameSettings>;
    if (typeof settings.trackId !== 'string') settings.trackId = 'buddh';
    return { ...p, settings };
  }
  return persisted;
}
