import { buddhControlPoints, buddhMeta } from '../tracks/buddh';
import { buildTrack } from './build';
import type { TrackRuntime } from './types';

/**
 * Track registry. Buddh is bundled; T4 turns further entries into lazy `import()`s (each track module is loaded on demand
 * and built once). Runtimes are immutable and cached by id.
 */
const builders: Record<string, () => TrackRuntime> = {
  buddh: () => buildTrack(buddhMeta, buddhControlPoints),
};

const built = new Map<string, TrackRuntime>();

export const DEFAULT_TRACK_ID = 'buddh';

export function trackIds(): string[] {
  return Object.keys(builders);
}

export function hasTrack(id: string): boolean {
  return id in builders;
}

export function getTrack(id: string): TrackRuntime {
  let rt = built.get(id);
  if (!rt) {
    const make = builders[id];
    if (!make) throw new Error(`Unknown track "${id}"`);
    rt = make();
    built.set(id, rt);
  }
  return rt;
}
