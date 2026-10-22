/**
 * Geometry helpers for the track importer (PLAN-v3 T5). Pure functions on plain arrays, no I/O, so they are unit-testable.
 * Convention: output coordinates are x = east, y = SOUTH (y = -north). That is the orientation the in-game minimap draws
 * (screen y grows downward), so an imported circuit looks like its map with north up, and a circuit that runs
 * clockwise on the map has a POSITIVE `signedArea` here (same as Buddh's control points; see geo.test.ts).
 */

export const EARTH_RADIUS_M = 6371000;

export type Pt = [number, number];

/** Equirectangular projection around the centroid of the points: metres, x east, y south. */
export function projectEquirectangular(lonLat: [number, number][]): { pts: Pt[]; lon0: number; lat0: number } {
  let lon0 = 0;
  let lat0 = 0;
  for (const [lon, lat] of lonLat) {
    lon0 += lon;
    lat0 += lat;
  }
  lon0 /= lonLat.length;
  lat0 /= lonLat.length;
  const k = Math.PI / 180;
  const cos0 = Math.cos(lat0 * k);
  const pts = lonLat.map(([lon, lat]): Pt => [EARTH_RADIUS_M * (lon - lon0) * k * cos0, -EARTH_RADIUS_M * (lat - lat0) * k]);
  return { pts, lon0, lat0 };
}

/** Drop a duplicated closing point (GeoJSON rings repeat the first coordinate). */
export function openRing(pts: Pt[]): Pt[] {
  if (pts.length > 2) {
    const a = pts[0];
    const b = pts[pts.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6) return pts.slice(0, -1);
  }
  return pts;
}

export function ringLength(pts: Pt[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return s;
}

/**
 * Shoelace sum / 2 with y pointing DOWN: positive = clockwise as drawn on screen (and on a north-up map, given our y = south).
 */
export function signedArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/**
 * Closed centripetal Catmull-Rom (alpha 0.5) through `pts`, `perSegment` samples per segment. Centripetal
 * parametrisation avoids the overshoot and loops uniform Catmull-Rom makes on unevenly spaced points.
 */
export function catmullRomClosed(pts: Pt[], perSegment: number): Pt[] {
  const n = pts.length;
  const out: Pt[] = [];
  const knot = (a: Pt, b: Pt) => Math.max(1e-9, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i + n - 1) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const t0 = 0;
    const t1 = t0 + knot(p0, p1);
    const t2 = t1 + knot(p1, p2);
    const t3 = t2 + knot(p2, p3);
    for (let s = 0; s < perSegment; s++) {
      const t = t1 + ((t2 - t1) * s) / perSegment;
      const q: Pt = [0, 0];
      for (let d = 0; d < 2; d++) {
        const a1 = ((t1 - t) / (t1 - t0)) * p0[d] + ((t - t0) / (t1 - t0)) * p1[d];
        const a2 = ((t2 - t) / (t2 - t1)) * p1[d] + ((t - t1) / (t2 - t1)) * p2[d];
        const a3 = ((t3 - t) / (t3 - t2)) * p2[d] + ((t - t2) / (t3 - t2)) * p3[d];
        const b1 = ((t2 - t) / (t2 - t0)) * a1 + ((t - t0) / (t2 - t0)) * a2;
        const b2 = ((t3 - t) / (t3 - t1)) * a2 + ((t - t1) / (t3 - t1)) * a3;
        q[d] = ((t2 - t) / (t2 - t1)) * b1 + ((t - t1) / (t2 - t1)) * b2;
      }
      out.push(q);
    }
  }
  return out;
}

/** `n` points equally spaced by arc length along the closed polyline (point 0 stays at pts[0]). */
export function resampleClosed(pts: Pt[], n: number): Pt[] {
  const m = pts.length;
  const cum = new Float64Array(m + 1);
  for (let i = 0; i < m; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % m];
    cum[i + 1] = cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  const total = cum[m];
  const out: Pt[] = [];
  let seg = 0;
  for (let k = 0; k < n; k++) {
    const target = (total * k) / n;
    while (seg < m - 1 && cum[seg + 1] <= target) seg++;
    const a = pts[seg];
    const b = pts[(seg + 1) % m];
    const len = cum[seg + 1] - cum[seg] || 1;
    const f = (target - cum[seg]) / len;
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return out;
}

/**
 * Laplacian smoothing of a closed polyline: each point moves toward the midpoint of its neighbours by `lambda` per pass,
 * but never further than `maxMove` from where it started, so corners keep their shape.
 */
export function smoothClosed(pts: Pt[], passes: number, lambda: number, maxMove: number): Pt[] {
  const n = pts.length;
  let cur = pts.map((p): Pt => [p[0], p[1]]);
  for (let it = 0; it < passes; it++) {
    const next: Pt[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const a = cur[(i + n - 1) % n];
      const b = cur[(i + 1) % n];
      const c = cur[i];
      let x = c[0] + lambda * ((a[0] + b[0]) / 2 - c[0]);
      let y = c[1] + lambda * ((a[1] + b[1]) / 2 - c[1]);
      const dx = x - pts[i][0];
      const dy = y - pts[i][1];
      const d = Math.hypot(dx, dy);
      if (d > maxMove) {
        x = pts[i][0] + (dx / d) * maxMove;
        y = pts[i][1] + (dy / d) * maxMove;
      }
      next[i] = [x, y];
    }
    cur = next;
  }
  return cur;
}

/** Rotate the ring so `startIndex` becomes index 0. */
export function rotateRing<T>(pts: T[], startIndex: number): T[] {
  const n = pts.length;
  const s = ((startIndex % n) + n) % n;
  return pts.slice(s).concat(pts.slice(0, s));
}

export function nearestIndex(pts: Pt[], target: Pt): number {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - target[0], pts[i][1] - target[1]);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/** Unsigned curvature (1/m) per point from the heading change over its two neighbours. */
export function curvatureProfile(pts: Pt[]): Float64Array {
  const n = pts.length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = pts[(i + n - 1) % n];
    const b = pts[i];
    const c = pts[(i + 1) % n];
    const h1 = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const h2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
    let dh = h2 - h1;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    const ds = (Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.hypot(c[0] - b[0], c[1] - b[1])) / 2;
    out[i] = Math.abs(dh) / Math.max(1e-9, ds);
  }
  return out;
}

/** Largest change in curvature between consecutive points (1/m per sample): the "spike" measure. */
export function maxCurvatureJump(pts: Pt[]): number {
  const k = curvatureProfile(pts);
  let m = 0;
  for (let i = 0; i < k.length; i++) m = Math.max(m, Math.abs(k[(i + 1) % k.length] - k[i]));
  return m;
}

function segmentsIntersect(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
  const d = (a: Pt, b: Pt, c: Pt) => (c[0] - a[0]) * (b[1] - a[1]) - (b[0] - a[0]) * (c[1] - a[1]);
  const d1 = d(p3, p4, p1);
  const d2 = d(p3, p4, p2);
  const d3 = d(p1, p2, p3);
  const d4 = d(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Number of crossing pairs among non-adjacent segments of the closed polyline (0 for a simple loop). O(n²). */
export function selfIntersections(pts: Pt[]): number {
  const n = pts.length;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // adjacent through the wrap
      const c = pts[j];
      const d = pts[(j + 1) % n];
      if (segmentsIntersect(a, b, c, d)) count++;
    }
  }
  return count;
}

/** Minimum distance between two non-neighbouring parts of the ring (points more than `skipM` of arc apart). */
export function minSeparation(pts: Pt[], arcSpacingM: number, skipM: number): number {
  const n = pts.length;
  const skip = Math.ceil(skipM / arcSpacingM);
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    for (let j = i + skip; j < n; j++) {
      if (n - (j - i) < skip) continue; // close through the wrap
      const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
      if (d < best) best = d;
    }
  }
  return best;
}
