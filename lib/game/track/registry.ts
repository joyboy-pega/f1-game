import { buddhControlPoints, buddhMeta } from '../tracks/buddh';
import { buildTrack } from './build';
import type { TrackMeta, TrackRuntime } from './types';

/**
 * Track registry. Buddh is bundled (it is the default and must exist synchronously); every further circuit is a lazy
 * `import()` of its own module so only the selected track is downloaded. Runtimes are immutable and cached by id.
 */
export interface TrackModule {
  meta: TrackMeta;
  /** Points in world units. */
  controlPoints: [number, number][];
  /** 2 = Catmull-Rom with two samples per control point (Buddh); 1 for already-dense imported centrelines. */
  samplesPerPoint?: number;
}

/** What the lobby needs to list a track without loading its module. */
export interface TrackCatalogEntry {
  id: string;
  name: string;
  country: string;
  lengthM: number;
  /** Published facts shown on the lobby card (not derived from the centreline). */
  turns?: number;
  lapRecord?: { time: number; driver: string; year: number };
}

const CATALOG: TrackCatalogEntry[] = [
  {
    id: 'buddh',
    name: buddhMeta.name,
    country: buddhMeta.country,
    lengthM: 5125, // official length shown in the lobby; buddhMeta.lengthM is the as-built length until T2 rescales
    turns: 16,
    lapRecord: { time: 87.249, driver: 'Sebastian Vettel', year: 2011 },
  },
  {
    id: 'monza',
    name: 'Autodromo Nazionale Monza',
    country: 'Italy',
    lengthM: 5793,
    turns: 11,
    lapRecord: { time: 81.046, driver: 'Rubens Barrichello', year: 2004 },
  },
  {
    id: 'redbullring',
    name: 'Red Bull Ring',
    country: 'Austria',
    lengthM: 4318,
    turns: 10,
    lapRecord: { time: 65.619, driver: 'Carlos Sainz', year: 2020 },
  },
];

/** Lazy loaders for non-bundled tracks (T6 adds entries like `monza: () => import('../tracks/monza')`). */
const lazyModules: Record<string, () => Promise<TrackModule>> = {
  monza: () => import('../tracks/monza').then((m) => m.default),
  redbullring: () => import('../tracks/redbullring').then((m) => m.default),
};

const bundled: Record<string, () => TrackRuntime> = {
  buddh: () => buildTrack(buddhMeta, buddhControlPoints),
};

const built = new Map<string, TrackRuntime>();

export const DEFAULT_TRACK_ID = 'buddh';

export function trackCatalog(): readonly TrackCatalogEntry[] {
  return CATALOG;
}

export function trackIds(): string[] {
  return CATALOG.map((c) => c.id);
}

export function hasTrack(id: string): boolean {
  return id in bundled || id in lazyModules;
}

/** True when `getTrack(id)` can answer synchronously (bundled, or already loaded). */
export function isTrackLoaded(id: string): boolean {
  return built.has(id) || id in bundled;
}

/** Synchronous access; throws for a lazy track that has not been loaded with `ensureTrack` yet. */
export function getTrack(id: string): TrackRuntime {
  let rt = built.get(id);
  if (!rt) {
    const make = bundled[id];
    if (!make) throw new Error(`Track "${id}" is unknown or not loaded (await ensureTrack first)`);
    rt = make();
    built.set(id, rt);
  }
  return rt;
}

/** Load (once) and build a track; resolves immediately for bundled or already-loaded tracks. */
export async function ensureTrack(id: string): Promise<TrackRuntime> {
  if (isTrackLoaded(id)) return getTrack(id);
  const load = lazyModules[id];
  if (!load) throw new Error(`Unknown track "${id}"`);
  const m = await load();
  const rt = buildTrack(m.meta, m.controlPoints, m.samplesPerPoint ?? 2);
  built.set(id, rt);
  return rt;
}

/** Test hook: register a lazy module (production tracks are added to `lazyModules` above). */
export function registerLazyTrackForTests(entry: TrackCatalogEntry, load: () => Promise<TrackModule>) {
  CATALOG.push(entry);
  lazyModules[entry.id] = load;
}
