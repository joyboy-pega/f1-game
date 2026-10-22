import type { GameMode } from './constants';

/**
 * Best-lap record keys: `<trackId>:<mode>:<weather>`. (Before T4 they were `<mode>:<weather>`; the store migration
 * prefixes those with `buddh:` — see storeMigrate.ts.)
 */
export function recordKey(trackId: string, mode: GameMode, weather: string): string {
  return `${trackId}:${mode}:${weather}`;
}

export interface ParsedRecordKey {
  trackId: string;
  mode: string;
  weather: string;
}

export function parseRecordKey(key: string): ParsedRecordKey {
  const parts = key.split(':');
  if (parts.length >= 3) return { trackId: parts[0], mode: parts[1], weather: parts.slice(2).join(':') };
  // legacy two-part key (pre-T4): always Buddh
  return { trackId: 'buddh', mode: parts[0] ?? '', weather: parts[1] ?? '' };
}

/** Prefix legacy `<mode>:<weather>` keys with `buddh:`. Existing three-part keys are kept; on a clash the faster lap wins. */
export function migrateBestLapKeys(bestLaps: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, time] of Object.entries(bestLaps)) {
    if (typeof time !== 'number' || !Number.isFinite(time)) continue;
    const k = key.split(':').length >= 3 ? key : `buddh:${key}`;
    if (out[k] === undefined || time < out[k]) out[k] = time;
  }
  return out;
}
