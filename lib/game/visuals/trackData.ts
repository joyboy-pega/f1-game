// Derived track data and geometry helpers shared by every world component.
// Pure data + three BufferGeometry builders; no React. Units: 1 unit ~ 0.1 m.
import * as THREE from 'three';
import {
  N,
  HW,
  trackSplinePoints,
  tangents,
  normals,
  cumulativeS,
  segmentLengths,
  TRACK_LENGTH,
} from '@/lib/game/constants';

export const wrapIdx = (i: number) => ((Math.floor(i) % N) + N) % N;

/** Deterministic PRNG so the world looks identical every session. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1)));
  return t * t * (3 - 2 * t);
};

/** Interpolated frame at fractional spline index f: [x, z, tx, tz, nx, nz]. */
export function frameAt(f: number): [number, number, number, number, number, number] {
  const i0 = wrapIdx(f);
  const i1 = (i0 + 1) % N;
  const t = f - Math.floor(f);
  const a = trackSplinePoints[i0];
  const b = trackSplinePoints[i1];
  const tx = tangents[i0][0] * (1 - t) + tangents[i1][0] * t;
  const tz = tangents[i0][1] * (1 - t) + tangents[i1][1] * t;
  const l = Math.hypot(tx, tz) || 1;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, tx / l, tz / l, -tz / l, tx / l];
}

/** Spline index (float) at arc length s. */
export function indexAtS(s: number): number {
  const L = TRACK_LENGTH;
  const ss = ((s % L) + L) % L;
  let lo = 0;
  let hi = N;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cumulativeS[mid] <= ss) lo = mid;
    else hi = mid;
  }
  return lo + (ss - cumulativeS[lo]) / (segmentLengths[lo] || 1);
}

// --- curvature ------------------------------------------------------------
/** Signed turn angle per sample (rad); positive = turning towards +normal. */
export const signedTurn = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const a = tangents[i];
  const b = tangents[(i + 1) % N];
  signedTurn[i] = a[0] * b[1] - a[1] * b[0];
}

export function smoothSigned(win: number): Float32Array {
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let k = -win; k <= win; k++) s += signedTurn[(i + k + N) % N];
    out[i] = s / (win * 2 + 1);
  }
  return out;
}
const ss6 = smoothSigned(6);

export interface Corner {
  start: number;
  end: number; // inclusive, may exceed N-1 when wrapping (use wrapIdx)
  apex: number;
  peak: number;
  /** +1 when the inside of the corner is on the +normal side. */
  inside: 1 | -1;
}

function detectCorners(): Corner[] {
  const THR = 0.02;
  // start scanning at a quiet sample so runs never straddle the loop seam
  let s0 = 0;
  for (let i = 0; i < N; i++) if (Math.abs(ss6[i]) < 0.006) { s0 = i; break; }
  const runs: Corner[] = [];
  let cur: Corner | null = null;
  for (let k = 0; k < N; k++) {
    const i = (s0 + k) % N;
    const v = ss6[i];
    const on = Math.abs(v) > THR;
    const sg: 1 | -1 = v > 0 ? 1 : -1;
    if (on && cur && cur.inside === sg) {
      cur.end = s0 + k;
      if (Math.abs(v) > cur.peak) { cur.peak = Math.abs(v); cur.apex = s0 + k; }
    } else if (on) {
      if (cur) runs.push(cur);
      cur = { start: s0 + k, end: s0 + k, apex: s0 + k, peak: Math.abs(v), inside: sg };
    } else if (cur && k - (cur.end - s0) > 8) {
      runs.push(cur);
      cur = null;
    }
  }
  if (cur) runs.push(cur);
  return runs.filter((c) => c.peak > 0.028 && c.end - c.start >= 5);
}
export const corners: Corner[] = detectCorners();

/** Per-side (index 0 = -normal, 1 = +normal) smooth masks over the lap. */
function maskFrom(fn: (c: Corner, i: number) => number): [Float32Array, Float32Array] {
  const m: [Float32Array, Float32Array] = [new Float32Array(N), new Float32Array(N)];
  for (const c of corners) {
    for (let i = c.start - 14; i <= c.end + 20; i++) {
      const w = fn(c, i);
      if (w <= 0) continue;
      const idx = wrapIdx(i);
      const inside = c.inside > 0 ? 1 : 0;
      const side = w > 0 ? inside : inside;
      m[side][idx] = Math.max(m[side][idx], w);
    }
  }
  return m;
}
function outsideMask(fn: (c: Corner, i: number) => number): [Float32Array, Float32Array] {
  const m: [Float32Array, Float32Array] = [new Float32Array(N), new Float32Array(N)];
  for (const c of corners) {
    const side = c.inside > 0 ? 0 : 1;
    for (let i = c.start - 14; i <= c.end + 20; i++) {
      const w = fn(c, i);
      if (w <= 0) continue;
      const idx = wrapIdx(i);
      m[side][idx] = Math.max(m[side][idx], w);
    }
  }
  return m;
}

/** Kerbs on the inside of corners, with lead-in/out. Sharp edges (kerbs end bluntly). */
export const kerbInside = maskFrom((c, i) => (i >= c.start - 5 && i <= c.end + 5 ? 1 : 0));
/** Exit kerbs on the outside, only after the apex of the tighter corners. */
export const kerbOutside = outsideMask((c, i) => (c.peak > 0.045 && i >= c.apex - 2 && i <= c.end + 6 ? 1 : 0));
/** Soft run-off weight on the outside of corners (1 inside corner, ramps out). */
export const runoffOutside = outsideMask((c, i) => {
  const a = smoothstep(c.start - 14, c.start - 2, i);
  const b = 1 - smoothstep(c.end + 2, c.end + 20, i);
  return Math.min(a, b);
});

export function sideIdx(side: 1 | -1) {
  return side > 0 ? 1 : 0;
}

/** Runs of consecutive samples where mask > thr (handles wrap). Returns [from, count]. */
export function maskRuns(mask: Float32Array, thr = 0.5, minLen = 2): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  // begin at a masked-off sample so runs do not straddle the seam
  let s0 = 0;
  for (let i = 0; i < N; i++) if (mask[i] <= thr) { s0 = i; break; }
  for (let k = 0; k <= N; k++) {
    const i = (s0 + k) % N;
    const on = k < N && mask[i] > thr;
    if (on && start < 0) start = s0 + k;
    if (!on && start >= 0) {
      const len = s0 + k - start;
      if (len >= minLen) out.push([start, len]);
      start = -1;
    }
  }
  return out;
}

// --- spatial lookup -------------------------------------------------------
const CELL = 500;
const grid = new Map<string, number[]>();
for (let i = 0; i < N; i += 2) {
  const p = trackSplinePoints[i];
  const key = `${Math.floor(p[0] / CELL)},${Math.floor(p[1] / CELL)}`;
  const a = grid.get(key);
  if (a) a.push(i);
  else grid.set(key, [i]);
}
/** Approximate distance from (x,z) to the centreline (searches ~1000 units around). */
export function distToTrack(x: number, z: number): number {
  const cx = Math.floor(x / CELL);
  const cz = Math.floor(z / CELL);
  let best = 1e9;
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      const a = grid.get(`${cx + dx},${cz + dz}`);
      if (!a) continue;
      for (const i of a) {
        const p = trackSplinePoints[i];
        const d = Math.hypot(p[0] - x, p[1] - z);
        if (d < best) best = d;
      }
    }
  }
  return best;
}

export const TRACK_BOUNDS = (() => {
  let a = 1e9, b = -1e9, c = 1e9, d = -1e9;
  for (const p of trackSplinePoints) {
    a = Math.min(a, p[0]); b = Math.max(b, p[0]);
    c = Math.min(c, p[1]); d = Math.max(d, p[1]);
  }
  return { minX: a, maxX: b, minZ: c, maxZ: d, cx: (a + b) / 2, cz: (c + d) / 2 };
})();

// --- geometry builders ----------------------------------------------------
export type Fn = number | ((i: number) => number);
const ev = (f: Fn, i: number) => (typeof f === 'number' ? f : f(i));
export type RGBA = [number, number, number, number];

export interface SweepPoint {
  /** signed lateral offset from the centreline (+ = +normal side) */
  o: Fn;
  y: Fn;
  u: Fn;
  col?: RGBA | ((i: number) => RGBA);
}
export interface SweepOpts {
  from: number;
  count: number;
  profile: SweepPoint[];
  /** units of arc length per unit of v (or u when swapUV) */
  vScale: number;
  vOffset?: number;
  swapUV?: boolean;
  /** reverse triangle winding (use for -normal side mirrored profiles) */
  flip?: boolean;
  /** colour attribute size: 3 (opaque) or 4 (alpha). Default 3. */
  colorSize?: 3 | 4;
}

/**
 * Extrude a cross-section along the spline. Each profile segment gets its own
 * vertices so hard edges and per-segment colours work. A profile segment faces
 * (d_o * up - d_y * normal): increasing o faces up, rising y faces the -normal side.
 */
export function sweep(opts: SweepOpts): THREE.BufferGeometry {
  const { from, count, profile, vScale, vOffset = 0, swapUV, flip } = opts;
  const cs = opts.colorSize ?? 3;
  const segs = profile.length - 1;
  const cols = count + 1;
  const vertCount = cols * segs * 2;
  const pos = new Float32Array(vertCount * 3);
  const uv = new Float32Array(vertCount * 2);
  const col = new Float32Array(vertCount * cs);
  const idx = new Uint32Array(count * segs * 6);
  let s = cumulativeS[wrapIdx(from)];
  let vi = 0;
  let ii = 0;
  for (let k = 0; k < cols; k++) {
    const i = from + k;
    const w = wrapIdx(i);
    const p = trackSplinePoints[w];
    const nx = normals[w][0];
    const nz = normals[w][1];
    const v = s / vScale + vOffset;
    for (let r = 0; r < segs; r++) {
      for (let e = 0; e < 2; e++) {
        const pt = profile[r + e];
        const o = ev(pt.o, w);
        const base = (k * segs + r) * 2 + e;
        pos[base * 3] = p[0] + nx * o;
        pos[base * 3 + 1] = ev(pt.y, w);
        pos[base * 3 + 2] = p[1] + nz * o;
        const pu = ev(pt.u, w);
        uv[base * 2] = swapUV ? v : pu;
        uv[base * 2 + 1] = swapUV ? pu : v;
        const c = pt.col ? (typeof pt.col === 'function' ? pt.col(w) : pt.col) : null;
        col[base * cs] = c ? c[0] : 1;
        col[base * cs + 1] = c ? c[1] : 1;
        col[base * cs + 2] = c ? c[2] : 1;
        if (cs === 4) col[base * cs + 3] = c ? c[3] : 1;
      }
    }
    s += segmentLengths[w];
    vi++;
  }
  for (let k = 0; k < count; k++) {
    for (let r = 0; r < segs; r++) {
      const a = (k * segs + r) * 2;
      const b = a + 1;
      const c = ((k + 1) * segs + r) * 2;
      const d = c + 1;
      if (!flip) {
        idx[ii++] = a; idx[ii++] = b; idx[ii++] = c;
        idx[ii++] = c; idx[ii++] = b; idx[ii++] = d;
      } else {
        idx[ii++] = a; idx[ii++] = c; idx[ii++] = b;
        idx[ii++] = c; idx[ii++] = d; idx[ii++] = b;
      }
    }
  }
  void vi;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, cs));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  return g;
}

/** Horizontal band between |a| and |b| on a side. Faces up. */
export interface SidePt { d: Fn; y: Fn; u: Fn; col?: SweepPoint['col'] }
/**
 * Cross-section for one side from points listed outward (d = distance from the centreline).
 * On the -normal side the list is mirrored and reversed so horizontal faces still face up.
 */
export function sideProfile(side: 1 | -1, pts: SidePt[]): SweepPoint[] {
  const sg = (f: Fn): Fn => (side > 0 ? f : typeof f === 'number' ? -f : (i: number) => -f(i));
  const out = pts.map((p) => ({ o: sg(p.d), y: p.y, u: p.u, col: p.col }));
  return side > 0 ? out : out.reverse();
}

/** Flat-shaded geometry assembled from quads/boxes in world space. */
export class GeoBuilder {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  cs: 3 | 4;
  constructor(colorSize: 3 | 4 = 3) { this.cs = colorSize; }

  private pushCol(c: RGBA) {
    this.col.push(c[0], c[1], c[2]);
    if (this.cs === 4) this.col.push(c[3]);
  }

  /** Quad p0..p3 in order (CCW seen from the front). uv rect [u0,v0,u1,v1]. */
  quad(
    p0: [number, number, number], p1: [number, number, number], p2: [number, number, number], p3: [number, number, number],
    color: RGBA = [1, 1, 1, 1], uvr: [number, number, number, number] = [0, 0, 1, 1],
  ) {
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
    const vx = p3[0] - p0[0], vy = p3[1] - p0[1], vz = p3[2] - p0[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const b = this.pos.length / 3;
    for (const p of [p0, p1, p2, p3]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(nx, ny, nz);
      this.pushCol(color);
    }
    this.uv.push(uvr[0], uvr[1], uvr[2], uvr[1], uvr[2], uvr[3], uvr[0], uvr[3]);
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }

  /** Axis-aligned (then yawed) box centred at (cx,cy,cz). yaw rotates about Y. */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, yaw = 0, color: RGBA = [1, 1, 1, 1], uvr?: [number, number, number, number]) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const P = (x: number, y: number, z: number): [number, number, number] => [cx + x * c + z * s, cy + y, cz - x * s + z * c];
    const v = {
      a: P(-hx, -hy, hz), b: P(hx, -hy, hz), c: P(hx, hy, hz), d: P(-hx, hy, hz),
      e: P(-hx, -hy, -hz), f: P(hx, -hy, -hz), g: P(hx, hy, -hz), h: P(-hx, hy, -hz),
    };
    this.quad(v.a, v.b, v.c, v.d, color, uvr);
    this.quad(v.f, v.e, v.h, v.g, color, uvr);
    this.quad(v.b, v.f, v.g, v.c, color, uvr);
    this.quad(v.e, v.a, v.d, v.h, color, uvr);
    this.quad(v.d, v.c, v.g, v.h, color, uvr);
    this.quad(v.e, v.f, v.b, v.a, color, uvr);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, this.cs));
    g.setIndex(this.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    return g;
  }
}

export { HW };
