import { track, type TrackRuntime } from './index';

/**
 * 3D road surface height, grade, and camber queries (PLAN-v3 §4.2 T3).
 *
 * Coordinate system:
 * - Three.js X = track X
 * - Three.js Z = track Y (ground plane XZ)
 * - Three.js Y = vertical elevation (up)
 *
 * Formulas:
 * - surfaceHeight(f, lateral) = pz(f) + camber(f) * lateral
 * - Grade (pitch) = dpz / ds
 * - Camber (roll) = camber angle (rad)
 */

export function wrapIndex(f: number, N: number): [number, number, number] {
  const i0 = ((Math.floor(f) % N) + N) % N;
  const i1 = (i0 + 1) % N;
  const t = f - Math.floor(f);
  return [i0, i1, t];
}

/**
 * Surface height (world units, Y-up) at fractional spline index `f` and lateral offset `lateral`.
 * At lateral = 0, returns the centerline elevation.
 */
export function surfaceHeight(f: number, lateral = 0, rt: TrackRuntime = track.current): number {
  const N = rt.N;
  const [i0, i1, t] = wrapIndex(f, N);
  const z0 = rt.pz[i0];
  const z1 = rt.pz[i1];
  const c0 = rt.camber[i0];
  const c1 = rt.camber[i1];
  const pz = z0 + (z1 - z0) * t;
  const camber = c0 + (c1 - c0) * t;
  return pz + camber * lateral;
}

/**
 * Longitudinal road grade (tangent pitch angle in radians, positive = uphill) at fractional index `f`.
 */
export function surfaceGradeAngle(f: number, rt: TrackRuntime = track.current): number {
  const N = rt.N;
  const [i0, i1, t] = wrapIndex(f, N);
  const ds0 = rt.segLen[i0] || 1;
  const ds1 = rt.segLen[i1] || 1;
  const slope0 = (rt.pz[i1] - rt.pz[i0]) / ds0;
  const i2 = (i1 + 1) % N;
  const slope1 = (rt.pz[i2] - rt.pz[i1]) / ds1;
  const slope = slope0 + (slope1 - slope0) * t;
  return Math.atan(slope);
}

/**
 * Lateral road camber (bank roll angle in radians, positive = banked towards inside) at fractional index `f`.
 */
export function surfaceCamberAngle(f: number, rt: TrackRuntime = track.current): number {
  const N = rt.N;
  const [i0, i1, t] = wrapIndex(f, N);
  return rt.camber[i0] + (rt.camber[i1] - rt.camber[i0]) * t;
}
