import { N, HW, trackSplinePoints, normals, cumulativeS, TRACK_LENGTH } from '../constants';

/**
 * Optimal racing line (minimum curvature within the track) and the speed profile that goes with it.
 * Computed once at module load (~10 ms). Typed arrays are shared by the AI, assists and the renderer.
 *
 *  - lineOffset[i]  signed lateral offset from the centreline at spline index i (+ = along normals)
 *  - lineX/lineY    world position of the line
 *  - lineHeading[i] direction of travel along the line
 *  - lineCurv[i]    signed curvature (1/unit), + = turning toward +normal
 *  - lineSeg[i]     distance along the line from i to i+1
 *  - lineCornerSpeed[i]  cornering limit only (no braking / acceleration passes)
 *  - lineSpeed[i]   achievable speed with the physics' accel and brake limits
 */

export const LINE_MARGIN = 14; // keep the line this far from the track edge
const MAX_OFFSET = HW - LINE_MARGIN;

export const V_TOP = 860; // units/s cap for the profile (just above the unboosted terminal speed)
export const PROFILE_BRAKE_DECEL = 1750; // usable deceleration (brake lag + safety margin included)

/** Max cornering speed for curvature `k` (1/unit), from the physics yaw model at full lock. */
export function cornerSpeedForCurvature(k: number, steerMax = 1): number {
  const a = Math.abs(k);
  if (a < 1e-6) return V_TOP;
  const K = 2.6 * steerMax;
  // yaw rate = K * min(v/220,1) / (1 + v/620), required = v * a  ->  solve for v >= 220
  const v = 310 * (-1 + Math.sqrt(1 + (4 * K) / (620 * a)));
  if (v >= 220) return Math.min(V_TOP, v);
  // below 220 the available yaw rate scales with v, so speed barely matters: tight corner
  return Math.max(120, v);
}

/** Forward acceleration available at speed v (no ERS / DRS). */
export function accelAt(v: number): number {
  return 760 * Math.max(0, 1 - v / 900) - 0.13 * v;
}

export const lineOffset = new Float32Array(N);
export const lineX = new Float32Array(N);
export const lineY = new Float32Array(N);
export const lineHeading = new Float32Array(N);
export const lineCurv = new Float32Array(N);
export const lineSeg = new Float32Array(N);
export const lineS = new Float32Array(N + 1);
export const lineCornerSpeed = new Float32Array(N);
export const lineSpeed = new Float32Array(N);
export let lineLength = 0;
export let lineLapTimeEstimate = 0;

function optimiseOffsets() {
  const px = new Float64Array(N);
  const py = new Float64Array(N);
  const nx = new Float64Array(N);
  const ny = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    px[i] = trackSplinePoints[i][0];
    py[i] = trackSplinePoints[i][1];
    nx[i] = normals[i][0];
    ny[i] = normals[i][1];
  }

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

function buildLine() {
  optimiseOffsets();
  for (let i = 0; i < N; i++) {
    lineX[i] = trackSplinePoints[i][0] + normals[i][0] * lineOffset[i];
    lineY[i] = trackSplinePoints[i][1] + normals[i][1] * lineOffset[i];
  }
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    lineSeg[i] = Math.hypot(lineX[j] - lineX[i], lineY[j] - lineY[i]);
    lineS[i + 1] = lineS[i] + lineSeg[i];
    const p = (i + N - 1) % N;
    lineHeading[i] = Math.atan2(lineY[j] - lineY[p], lineX[j] - lineX[p]);
  }
  lineLength = lineS[N];

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
  lineLapTimeEstimate = t;
}

buildLine();

/** Index of the track centreline arc length (for converting distance ahead into spline steps). */
export function indexAhead(from: number, dist: number): number {
  const s0 = cumulativeS[from];
  let target = s0 + dist;
  if (target >= TRACK_LENGTH) target -= TRACK_LENGTH;
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
