import {
  catmullRomClosed,
  maxCurvatureJump,
  minSeparation,
  nearestIndex,
  openRing,
  projectEquirectangular,
  resampleClosed,
  ringLength,
  rotateRing,
  selfIntersections,
  signedArea,
  smoothClosed,
  type Pt,
} from './geo';

export interface ImportOptions {
  /** Official lap length in metres; the centreline is scaled to it. Default: the file's `properties.length`. */
  lengthM?: number;
  /** Point spacing in metres (default 2.5). */
  spacingM?: number;
  /** Start/finish point as [lon, lat]; index 0 becomes the sample nearest to it. Default: the file's first coordinate. */
  startLonLat?: [number, number];
  smoothPasses?: number;
  smoothLambda?: number;
  /** Smoothing never moves a point further than this from the resampled position (metres). */
  maxMoveM?: number;
}

export interface ImportedCircuit {
  /** Centreline in METRES, x east, y south (see geo.ts), index 0 = start/finish, `n` points, spacing `lengthM / n`. */
  pointsM: Pt[];
  n: number;
  lengthM: number;
  direction: 'cw' | 'ccw';
  props: { id?: string; Location?: string; Name?: string; length?: number; altitude?: number };
  stats: {
    rawPoints: number;
    rawLengthM: number;
    scale: number;
    maxCurvatureJump: number;
    selfIntersections: number;
    minSeparationM: number;
    startOffsetM: number;
  };
}

interface GeoJsonLike {
  type: string;
  features?: { properties?: Record<string, unknown>; geometry: { type: string; coordinates: [number, number][] } }[];
}

/** GeoJSON LineString (bacinger/f1-circuits layout) -> uniformly resampled, smoothed centreline in metres. */
export function importCircuit(geojsonText: string, opts: ImportOptions = {}): ImportedCircuit {
  const gj = JSON.parse(geojsonText) as GeoJsonLike;
  const feat = gj.features?.[0];
  if (!feat || feat.geometry.type !== 'LineString') throw new Error('Expected a FeatureCollection whose first feature is a LineString');
  const props = (feat.properties ?? {}) as ImportedCircuit['props'];
  const coords = feat.geometry.coordinates;
  if (coords.length < 8) throw new Error(`Too few coordinates (${coords.length})`);

  const spacing = opts.spacingM ?? 2.5;
  const lengthM = opts.lengthM ?? props.length;
  if (!lengthM || !Number.isFinite(lengthM)) throw new Error('No lap length: pass lengthM or provide properties.length');

  const { pts: proj, lon0, lat0 } = projectEquirectangular(coords);
  const ring = openRing(proj);
  const rawLengthM = ringLength(ring);

  // Smooth curve through the sparse survey points, then equal arc-length spacing.
  const dense = catmullRomClosed(ring, 24);
  const n = Math.max(64, Math.round(lengthM / spacing));
  let pts = resampleClosed(dense, n);
  pts = smoothClosed(pts, opts.smoothPasses ?? 8, opts.smoothLambda ?? 0.5, opts.maxMoveM ?? 1.5);

  // Scale to the official length (smoothing shortens the ring slightly), then re-space exactly.
  const scale = lengthM / ringLength(pts);
  pts = resampleClosed(pts.map((p): Pt => [p[0] * scale, p[1] * scale]), n);

  // Start line: nearest sample to the requested lon/lat (default: the file's first coordinate).
  const k = Math.PI / 180;
  const cos0 = Math.cos(lat0 * k);
  const [sLon, sLat] = opts.startLonLat ?? coords[0];
  const startPt: Pt = [6371000 * (sLon - lon0) * k * cos0 * scale, -6371000 * (sLat - lat0) * k * scale];
  const si = nearestIndex(pts, startPt);
  const startOffsetM = Math.hypot(pts[si][0] - startPt[0], pts[si][1] - startPt[1]);
  pts = rotateRing(pts, si);

  const actualSpacing = lengthM / n;
  return {
    pointsM: pts,
    n,
    lengthM,
    direction: signedArea(pts) > 0 ? 'cw' : 'ccw',
    props,
    stats: {
      rawPoints: ring.length,
      rawLengthM,
      scale,
      maxCurvatureJump: maxCurvatureJump(pts),
      selfIntersections: selfIntersections(pts),
      minSeparationM: minSeparation(pts, actualSpacing, 60),
      startOffsetM,
    },
  };
}
