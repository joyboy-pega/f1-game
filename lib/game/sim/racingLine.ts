import { HW } from '../constants';
import { track, trackCache, type TrackRuntime } from '../track';
import { cornerSpeedForCurvature as limitsCornerSpeed, maxLongAccel } from '../vehicle/limits';
import { UNITS_PER_M } from '../units';

/**
 * Optimal racing line (minimum curvature within the track) and the speed profile that goes with it.
 * Built once per track (~10 ms) by `getRacingLine()`; the typed arrays are shared by the AI, assists and the renderer.
 *
 *  - offset[i]      signed lateral offset from the centreline at spline index i (+ = along normals)
 *  - x / y          world position of the line
 *  - heading[i]     direction of travel along the line
 *  - curv[i]        signed curvature (1/unit), + = turning toward +normal
 *  - seg[i]         distance along the line from i to i+1
 *  - cornerSpeed[i] cornering limit only (no braking / acceleration passes)
 *  - speed[i]       achievable speed with the physics' accel and brake limits
 */
export interface RacingLine {
  offset: Float32Array;
  x: Float32Array;
  y: Float32Array;
  heading: Float32Array;
  curv: Float32Array;
  seg: Float32Array;
  /** Cumulative distance along the line, length N + 1. */
  s: Float32Array;
  cornerSpeed: Float32Array;
  speed: Float32Array;
  length: number;
  lapTimeEstimate: number;
}

export const LINE_MARGIN = 19; // keep the line this far from the track edge
const MAX_OFFSET = HW - LINE_MARGIN;

export const V_TOP = 860; // units/s cap for the profile (just above the unboosted terminal speed)
export const PROFILE_BRAKE_DECEL = 280; // usable deceleration in world units/s² (~2.8 g avg down to slow turns)

/** Max cornering speed for curvature `k` (1/unit), from vehicle limits envelope. */
export function cornerSpeedForCurvature(k: number, steerMax = 1): number {
  const a = Math.abs(k);
  if (a < 1e-6) return V_TOP;
  const kappaSI = a * UNITS_PER_M;
  const vMs = limitsCornerSpeed(kappaSI, 0.88);
  const vUnits = vMs * UNITS_PER_M * steerMax;
  return Math.max(90, Math.min(V_TOP, vUnits));
}

/** Forward acceleration available at speed v (no ERS / DRS). */
export function accelAt(v: number): number {
  return maxLongAccel(v / UNITS_PER_M) * UNITS_PER_M;
}

function optimiseOffsets(rt: TrackRuntime, lineOffset: Float32Array) {
  const N = rt.N;
  const { px, py, nx, ny } = rt;

  // Projected Gauss-Seidel (SOR) on sum |q[i-1] - 2 q[i] + q[i+1]|^2 with q = p + o n.
  // Solved coarse-to-fine so long-wavelength corners converge in few sweeps.
  const solve = (stride: number, o: Float64Array, sweeps: number, omega: number) => {
    const M = N / stride;
    const qx = new Float64Array(M);
    const qy = new Float64Array(M);
    const dx = new Float64Array(M);
    const dy = new Float64Array(M);
    for (let k = 0; k < M; k++) {
      const i = k * stride;
      qx[k] = px[i] + nx[i] * o[i];
      qy[k] = py[i] + ny[i] * o[i];
    }
    const d2 = (k: number) => {
      const a = (k + M - 1) % M;
      const b = (k + 1) % M;
      dx[k] = qx[a] - 2 * qx[k] + qx[b];
      dy[k] = qy[a] - 2 * qy[k] + qy[b];
    };
    for (let k = 0; k < M; k++) d2(k);
    for (let it = 0; it < sweeps; it++) {
      for (let k = 0; k < M; k++) {
        const i = k * stride;
        const a = (k + M - 1) % M;
        const b = (k + 1) % M;
        const gx = dx[a] - 2 * dx[k] + dx[b];
        const gy = dy[a] - 2 * dy[k] + dy[b];
        const g = nx[i] * gx + ny[i] * gy;
        let no = o[i] - (omega * g) / 6;
        if (no > MAX_OFFSET) no = MAX_OFFSET;
        else if (no < -MAX_OFFSET) no = -MAX_OFFSET;
        const delta = no - o[i];
        if (delta === 0) continue;
        o[i] = no;
        qx[k] += nx[i] * delta;
        qy[k] += ny[i] * delta;
        d2(a);
        d2(k);
        d2(b);
      }
    }
    return M;
  };

  const o = new Float64Array(N);
  const stride = 8;
  solve(stride, o, 500, 1.85);
  // Interpolate coarse offsets to all points
  const coarse = new Float64Array(N / stride);
  for (let k = 0; k < coarse.length; k++) coarse[k] = o[k * stride];
  for (let i = 0; i < N; i++) {
    const f = i / stride;
    const k0 = Math.floor(f) % coarse.length;
    const k1 = (k0 + 1) % coarse.length;
    const t = f - Math.floor(f);
    const tt = t * t * (3 - 2 * t);
    o[i] = coarse[k0] * (1 - tt) + coarse[k1] * tt;
  }
  solve(2, o, 120, 1.7);
  // Fill the odd indices skipped by stride 2 by interpolation
  for (let i = 1; i < N; i += 2) o[i] = 0.5 * (o[i - 1] + o[(i + 1) % N]);
  solve(1, o, 60, 1.5);

  for (let i = 0; i < N; i++) lineOffset[i] = o[i];
}

export function buildRacingLine(rt: TrackRuntime): RacingLine {
  const N = rt.N;
  const lineOffset = new Float32Array(N);
  const lineX = new Float32Array(N);
  const lineY = new Float32Array(N);
  const lineHeading = new Float32Array(N);
  const lineCurv = new Float32Array(N);
  const lineSeg = new Float32Array(N);
  const lineS = new Float32Array(N + 1);
  const lineCornerSpeed = new Float32Array(N);
  const lineSpeed = new Float32Array(N);
  optimiseOffsets(rt, lineOffset);
  for (let i = 0; i < N; i++) {
    lineX[i] = rt.px[i] + rt.nx[i] * lineOffset[i];
    lineY[i] = rt.py[i] + rt.ny[i] * lineOffset[i];
  }
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    lineSeg[i] = Math.hypot(lineX[j] - lineX[i], lineY[j] - lineY[i]);
    lineS[i + 1] = lineS[i] + lineSeg[i];
    const p = (i + N - 1) % N;
    lineHeading[i] = Math.atan2(lineY[j] - lineY[p], lineX[j] - lineX[p]);
  }
  const lineLength = lineS[N];

  // Signed curvature from heading change over +-3 points, then smoothed
  const raw = new Float32Array(N);
  const K = 3;
  for (let i = 0; i < N; i++) {
    const a = (i + N - K) % N;
    const b = (i + K) % N;
    const h1 = Math.atan2(lineY[i] - lineY[a], lineX[i] - lineX[a]);
    const h2 = Math.atan2(lineY[b] - lineY[i], lineX[b] - lineX[i]);
    let dh = h2 - h1;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    const ds = Math.hypot(lineX[i] - lineX[a], lineY[i] - lineY[a]) + Math.hypot(lineX[b] - lineX[i], lineY[b] - lineY[i]);
    raw[i] = dh / Math.max(1, ds / 2);
  }
  const W = 3;
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let k = -W; k <= W; k++) s += raw[(i + k + N) % N];
    lineCurv[i] = s / (2 * W + 1);
  }

  for (let i = 0; i < N; i++) lineCornerSpeed[i] = cornerSpeedForCurvature(lineCurv[i]);

  // Speed profile: backward braking pass then forward acceleration pass, two laps for wrap-around.
  const v = new Float32Array(N);
  for (let i = 0; i < N; i++) v[i] = Math.min(V_TOP, lineCornerSpeed[i] * 0.92);
  for (let pass = 0; pass < 2; pass++) {
    for (let k = 2 * N; k >= 0; k--) {
      const i = k % N;
      const j = (i + 1) % N;
      const lim = Math.sqrt(v[j] * v[j] + 2 * PROFILE_BRAKE_DECEL * lineSeg[i]);
      if (lim < v[i]) v[i] = lim;
    }
    for (let k = 0; k <= 2 * N; k++) {
      const i = k % N;
      const j = (i + 1) % N;
      const lim = Math.sqrt(v[i] * v[i] + 2 * Math.max(0, accelAt(v[i]) * 0.92) * lineSeg[i]);
      if (lim < v[j]) v[j] = lim;
    }
  }
  let t = 0;
  for (let i = 0; i < N; i++) {
    lineSpeed[i] = v[i];
    t += lineSeg[i] / Math.max(60, 0.5 * (v[i] + v[(i + 1) % N]));
  }
  return {
    offset: lineOffset,
    x: lineX,
    y: lineY,
    heading: lineHeading,
    curv: lineCurv,
    seg: lineSeg,
    s: lineS,
    cornerSpeed: lineCornerSpeed,
    speed: lineSpeed,
    length: lineLength,
    lapTimeEstimate: t,
  };
}

/** The racing line of the active track (built on first use, then cached per track id). */
export const getRacingLine = trackCache(buildRacingLine);

/** Index of the track centreline arc length (for converting distance ahead into spline steps). */
export function indexAhead(from: number, dist: number): number {
  const T = track.current;
  const cumulativeS = T.cumulativeS;
  const N = T.N;
  const s0 = cumulativeS[from];
  let target = s0 + dist;
  if (target >= T.length) target -= T.length;
  // cumulativeS is monotonic: binary search
  let lo = 0;
  let hi = N;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cumulativeS[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo % N;
}
