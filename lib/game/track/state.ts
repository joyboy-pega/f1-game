import { DEFAULT_TRACK_ID, getTrack } from './registry';
import type { TrackRuntime } from './types';

/**
 * The active track. Read `track.current` at CALL time (inside functions / frame loops), never cache its arrays at module load:
 * `setActiveTrack` swaps it between sessions.
 */
export const track: { current: TrackRuntime } = { current: getTrack(DEFAULT_TRACK_ID) };

export function setActiveTrack(id: string): TrackRuntime {
  track.current = getTrack(id); // throws on an unknown id and leaves the active track untouched
  return track.current;
}

/**
 * Per-track derived data (racing line, corner zones, DRS info, ...): `build` runs once per track id, on first use.
 * Usage: `const getThing = trackCache((rt) => compute(rt));` then `getThing()` for the active track.
 */
export function trackCache<T>(build: (rt: TrackRuntime) => T): () => T {
  const cache = new Map<string, T>();
  return () => {
    const rt = track.current;
    let v = cache.get(rt.meta.id);
    if (v === undefined) {
      v = build(rt);
      cache.set(rt.meta.id, v);
    }
    return v;
  };
}
