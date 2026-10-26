import { HW } from '../constants';
import { UNITS_PER_M } from '../units';
import type { DrsZoneIdx, TrackMeta, TrackRuntime } from './types';

// The arithmetic below is moved verbatim from the old module-level code in constants.ts (same expressions, same order)
// so Buddh's floats stay bit-identical. Do not "improve" it in T1.

/** Closed Catmull-Rom through `controlPoints`, `samples` points per control point. */
function catmullRom(controlPoints: [number, number][], samples: number): [number, number][] {
  const out: [number, number][] = [];
  const n = controlPoints.length;
  for (let i = 0; i < n; i++) {
    const p0 = controlPoints[(i + n - 1) % n];
    const p1 = controlPoints[i];
    const p2 = controlPoints[(i + 1) % n];
    const p3 = controlPoints[(i + 2) % n];
    for (let s = 0; s < samples; s++) {
      const t = s / samples;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  return out;
}

/** Index whose arc length (in metres) is closest to `sM`. cumulativeS is monotonic, so a binary search suffices. */
export function indexAtM(cumulativeS: Float32Array, N: number, sM: number): number {
  const target = sM * UNITS_PER_M;
  let lo = 0;
  let hi = N - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cumulativeS[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  // lo is the first index at or beyond the target; the previous one may be closer.
  if (lo > 0 && Math.abs(cumulativeS[lo - 1] - target) <= Math.abs(cumulativeS[lo] - target)) lo--;
  return lo % N;
}

/**
 * Interpolates periodic keyframes [sM, val] along closed track arc length 0..totalLengthM
 * using smooth cubic Hermite (smoothstep) blending.
 */
export function interpolatePeriodicKeyframes(
  keyframes: [number, number][],
  sM: number,
  totalLengthM: number
): number {
  if (keyframes.length === 0) return 0;
  if (keyframes.length === 1) return keyframes[0][1];

  const s = ((sM % totalLengthM) + totalLengthM) % totalLengthM;
  const n = keyframes.length;

  let k = 0;
  for (let i = 0; i < n; i++) {
    if (keyframes[i][0] <= s) k = i;
  }
  const nextK = (k + 1) % n;

  const s0 = keyframes[k][0];
  let s1 = keyframes[nextK][0];
  if (s1 <= s0) s1 += totalLengthM;

  let curS = s;
  if (curS < s0) curS += totalLengthM;

  const ds = s1 - s0;
  if (ds <= 1e-6) return keyframes[k][1];

  const t = Math.max(0, Math.min(1, (curS - s0) / ds));
  const w = t * t * (3 - 2 * t);
  return keyframes[k][1] * (1 - w) + keyframes[nextK][1] * w;
}

/**
 * Build the immutable runtime for a track. `controlPoints` are in world units; `samplesPerPoint` = 2 reproduces
 * today's Buddh spline (imported tracks pass already-dense points with 1).
 */
export function buildTrack(meta: TrackMeta, controlPoints: [number, number][], samplesPerPoint = 2): TrackRuntime {
  const pts = catmullRom(controlPoints, samplesPerPoint);
  const N = pts.length;

  const px = new Float64Array(N);
  const py = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    px[i] = pts[i][0];
    py[i] = pts[i][1];
  }

  // Tangents & normals
  const tx = new Float64Array(N);
  const ty = new Float64Array(N);
  const nx = new Float64Array(N);
  const ny = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const prev = pts[(i + N - 1) % N];
    const next = pts[(i + 1) % N];
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy) || 1;
    tx[i] = dx / len;
    ty[i] = dy / len;
    nx[i] = -dy / len;
    ny[i] = dx / len;
  }

  // Curvature
  const curvature = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = pts[(i + N - 1) % N];
    const b = pts[i];
    const c = pts[(i + 1) % N];
    const v1x = b[0] - a[0], v1y = b[1] - a[1];
    const v2x = c[0] - b[0], v2y = c[1] - b[1];
    const cross = Math.abs(v1x * v2y - v1y * v2x);
    curvature[i] = cross / (Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) + 0.001);
  }
  const smoothCurvature = new Float32Array(N);
  const W2 = 12;
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let k = -W2; k <= W2; k++) s += curvature[(i + k + N) % N];
    smoothCurvature[i] = s / (W2 * 2 + 1);
  }

  // Arc length
  const segLen = new Float32Array(N);
  const cumulativeS = new Float32Array(N + 1);
  for (let i = 0; i < N; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % N];
    segLen[i] = Math.hypot(b[0] - a[0], b[1] - a[1]);
    cumulativeS[i + 1] = cumulativeS[i] + segLen[i];
  }

  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (let i = 0; i < N; i++) {
    minX = Math.min(minX, px[i]);
    maxX = Math.max(maxX, px[i]);
    minY = Math.min(minY, py[i]);
    maxY = Math.max(maxY, py[i]);
  }

  // Metadata (metres) -> spline indices
  const at = (sM: number) => indexAtM(cumulativeS, N, sM);
  const drs: DrsZoneIdx[] = meta.drsZones.map((z) => {
    const start = at(z.startM);
    const end = at(z.endM);
    return { id: z.id, name: z.name, detectIdx: at(z.detectionM), start, end, wraps: end < start };
  });
  const pm = meta.pit;

  // Track width per index (PLAN-v3 §4.2 T2)
  const trackLengthM = cumulativeS[N] / UNITS_PER_M;
  const halfWidth = new Float32Array(N);
  if (typeof meta.widthM === 'number') {
    halfWidth.fill((meta.widthM * UNITS_PER_M) / 2);
  } else if (Array.isArray(meta.widthM)) {
    for (let i = 0; i < N; i++) {
      const sM = cumulativeS[i] / UNITS_PER_M;
      const wM = interpolatePeriodicKeyframes(meta.widthM, sM, trackLengthM);
      halfWidth[i] = (wM * UNITS_PER_M) / 2;
    }
  } else {
    halfWidth.fill(HW);
  }

  // Elevation (pz) and longitudinal grade (PLAN-v3 §4.2 T2)
  const pz = new Float64Array(N);
  const grade = new Float32Array(N);
  if (meta.elevation && meta.elevation.length > 0) {
    for (let i = 0; i < N; i++) {
      const sM = cumulativeS[i] / UNITS_PER_M;
      const hM = interpolatePeriodicKeyframes(meta.elevation, sM, trackLengthM);
      pz[i] = hM * UNITS_PER_M;
    }
    for (let i = 0; i < N; i++) {
      const prev = (i + N - 1) % N;
      const next = (i + 1) % N;
      const ds = segLen[prev] + segLen[i];
      const dpz = pz[next] - pz[prev];
      const rawGrade = ds > 1e-6 ? dpz / ds : 0;
      // Clamp grade to ±10% (§4.2 T2)
      grade[i] = Math.max(-0.10, Math.min(0.10, rawGrade));
    }
  }

  // Camber (radians) (PLAN-v3 §4.2 T2)
  const camber = new Float32Array(N);
  if (meta.camber && meta.camber.length > 0) {
    for (let i = 0; i < N; i++) {
      const sM = cumulativeS[i] / UNITS_PER_M;
      camber[i] = interpolatePeriodicKeyframes(meta.camber, sM, trackLengthM);
    }
  }

  const hwPit = halfWidth[at(pm.entryM)];

  return {
    meta,
    N,
    px, py, pz,
    tx, ty, nx, ny,
    halfWidth,
    camber,
    grade,
    curvature,
    smoothCurvature,
    segLen,
    cumulativeS,
    length: cumulativeS[N],
    sectorIdx: [at(meta.sectorsM[0]), at(meta.sectorsM[1])],
    drs,
    pit: {
      side: pm.side,
      entryIdx: at(pm.entryM),
      exitIdx: at(pm.exitM),
      boxStartIdx: at(pm.boxStartM),
      boxEndIdx: at(pm.boxEndM),
      laneOffset: hwPit + 46,
      laneHalfWidth: 20,
      wallOffset: hwPit + 22,
      garageOffset: hwPit + 96,
      speedLimitKmh: pm.speedLimitKmh,
    },
    bounds: { minX, maxX, minY, maxY },
  };
}
