import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Procedural geometry helpers for the car models. Everything here runs once at module
 * scope (the results are cached by the callers) — never per frame, never per car.
 *
 * Conventions: car-local space, +z = nose, +x = car's left, +y = up.
 */

// ---------------------------------------------------------------------------
// Livery texture atlas layout (shared by every UV mode below).
// canvas 1024 x 512
// rows 0..255   : "ring" region — cylindrical wrap of fuselage / engine cover
// rows 256..351 : left (+x) side panels, nose points to the canvas left
// rows 352..447 : right (-x) side panels, nose points to the canvas right
// rows 448..511 : solid colour patches, 64 px wide each (body, accent, dark, white)
// ---------------------------------------------------------------------------
export const ATLAS_W = 1024;
export const ATLAS_H = 512;
export const RING_ROWS = 256;
export const SIDE_ROW_H = 96;
export const SIDE_L_TOP = 256;
export const SIDE_R_TOP = 352;
export const PATCH_TOP = 448;
export const PATCH_W = 64;

/** Longitudinal span of the livery atlas (car-local z). */
export const LIVERY_Z0 = -1.55;
export const LIVERY_Z1 = 1.95;

/** Vertical span mapped onto a side-panel row. */
export const SIDE_Y0 = 0.1;
export const SIDE_Y1 = 0.62;

export type Patch = 'body' | 'accent' | 'dark' | 'white';
const PATCH_INDEX: Record<Patch, number> = { body: 0, accent: 1, dark: 2, white: 3 };

export type UvMode =
  | { kind: 'ring' }
  | { kind: 'side' }
  | { kind: 'patch'; patch: Patch };

export interface Station {
  z: number;
  cx?: number;
  cy: number;
  w: number;
  h: number;
  /** Superellipse exponent (2 = ellipse, >2 = squared shoulders). */
  n?: number;
  /** Bottom width multiplier (<1 = undercut belly, >1 = flat-bottom diffuser). */
  bw?: number;
  /** Upper half width multiplier (<1 = narrow shoulders). */
  tw?: number;
}

export interface WingStation {
  x: number;
  y: number;
  z: number;
  chord: number;
  /** Pitch angle in degrees (positive = leading edge down / trailing edge up). */
  pitch: number;
}

// ---------------------------------------------------------------------------
// Low-level utilities
// ---------------------------------------------------------------------------

/** Keep position/normal/uv only, non-indexed, so everything merges cleanly. */
export function normalize(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  // Only fall back to a fresh computation when normals are missing: toNonIndexed() already
  // duplicates an existing normal attribute correctly per vertex, and a geometry that went through
  // crease()/toCreasedNormals() carries deliberately-blended normals that computeVertexNormals()
  // would overwrite with flat per-triangle normals (there is no shared-vertex connectivity left to
  // accumulate over once non-indexed), faceting every part that passes through here.
  if (!g.getAttribute('normal')) {
    g.computeVertexNormals();
  }

  const pos = g.getAttribute('position');
  if (!g.getAttribute('uv')) {
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
  }

  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') {
      g.deleteAttribute(name);
    }
  }
  return g;
}

/**
 * Flip an indexed closed mesh's triangle winding if it faces inward (negative signed volume).
 * loft()/wingElement() wind by station order, and callers list stations nose-first (z
 * decreasing) or right-to-left (x decreasing) as often as not: an inward-wound shell renders
 * as a see-through, hollow-looking part because the materials cull back faces.
 */
function orientOutward(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  const idx = geo.getIndex();
  if (!idx) return geo;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let vol = 0;
  for (let i = 0; i < idx.count; i += 3) {
    a.fromBufferAttribute(pos, idx.getX(i));
    b.fromBufferAttribute(pos, idx.getX(i + 1));
    c.fromBufferAttribute(pos, idx.getX(i + 2));
    vol += a.dot(b.cross(c));
  }
  if (vol < 0) {
    for (let i = 0; i < idx.count; i += 3) {
      const t = idx.getX(i + 1);
      idx.setX(i + 1, idx.getX(i + 2));
      idx.setX(i + 2, t);
    }
    idx.needsUpdate = true;
  }
  return geo;
}

/** Smooth normals up to `angleDeg`, crisp hard edges above it. */
export function crease(geo: THREE.BufferGeometry, angleDeg = 42): THREE.BufferGeometry {
  const creased = toCreasedNormals(geo, THREE.MathUtils.degToRad(angleDeg));
  return normalize(creased);
}

/** Apply an affine transform in-place and return the geometry. */
export function xform(
  geo: THREE.BufferGeometry,
  pos?: [number, number, number],
  rot?: [number, number, number],
  scale?: [number, number, number],
): THREE.BufferGeometry {
  if (scale) geo.scale(scale[0], scale[1], scale[2]);
  if (rot) {
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot[0], rot[1], rot[2]));
    geo.applyMatrix4(m);
  }
  if (pos) geo.translate(pos[0], pos[1], pos[2]);
  return geo;
}

/** Map vertex positions into the 1024x512 livery UV atlas. */
export function applyUv(geo: THREE.BufferGeometry, mode: UvMode): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  const norm = geo.getAttribute('normal');
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;

  const zSpan = LIVERY_Z1 - LIVERY_Z0;
  const ySpan = SIDE_Y1 - SIDE_Y0;

  if (mode.kind === 'patch') {
    const idx = PATCH_INDEX[mode.patch];
    const u = ((idx + 0.5) * PATCH_W) / ATLAS_W;
    const v = 1 - (PATCH_TOP + 32) / ATLAS_H;
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(i, u, v);
    }
    uv.needsUpdate = true;
    return geo;
  }

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = norm ? norm.getX(i) : x;
    const ny = norm ? norm.getY(i) : y;

    const zNorm = THREE.MathUtils.clamp((LIVERY_Z1 - z) / zSpan, 0.002, 0.998);

    if (mode.kind === 'ring') {
      const angle = Math.atan2(x, Math.max(y - 0.12, -0.25)); // -PI..PI wrapped over top
      const vRing = THREE.MathUtils.clamp(0.5 + angle / (Math.PI * 1.65), 0.01, 0.99);
      const v = 1 - (vRing * RING_ROWS) / ATLAS_H;
      uv.setXY(i, zNorm, v);
    } else {
      // 'side'
      const isLeft = x > 0 || (Math.abs(x) < 0.001 && nx >= 0);
      const yNorm = THREE.MathUtils.clamp(1 - (y - SIDE_Y0) / ySpan, 0.02, 0.98);
      const rowTop = isLeft ? SIDE_L_TOP : SIDE_R_TOP;
      const u = isLeft ? zNorm : 1 - zNorm;
      const v = 1 - (rowTop + yNorm * SIDE_ROW_H) / ATLAS_H;
      uv.setXY(i, u, v);
    }
  }

  uv.needsUpdate = true;
  return geo;
}

/** Normalize, UV-map, and merge an array of parts into a single draw call. */
export function mergeParts(
  parts: { geo: THREE.BufferGeometry; uv?: UvMode }[],
): THREE.BufferGeometry {
  const prepared = parts.map(({ geo, uv }) => {
    const g = normalize(geo);
    if (uv) {
      applyUv(g, uv);
    } else {
      applyUv(g, { kind: 'patch', patch: 'dark' });
    }
    return g;
  });
  return mergeGeometries(prepared, false);
}

// ---------------------------------------------------------------------------
// High-level procedural primitives
// ---------------------------------------------------------------------------

/** Watertight superellipse loft across longitudinal stations. */
export function loft(stations: Station[], radialSegs = 16): THREE.BufferGeometry {
  const ringVerts = radialSegs + 1;
  const numStations = stations.length;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let s = 0; s < numStations; s++) {
    const st = stations[s];
    const cx = st.cx ?? 0;
    const cy = st.cy;
    const n = st.n ?? 2.4;
    const bw = st.bw ?? 1.0;
    const tw = st.tw ?? 1.0;
    const exp = 2 / n;

    for (let i = 0; i <= radialSegs; i++) {
      const theta = (i / radialSegs) * Math.PI * 2;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);

      const sx = Math.sign(cos) * Math.pow(Math.abs(cos), exp);
      const sy = Math.sign(sin) * Math.pow(Math.abs(sin), exp);

      // Blend bottom/top width multiplier smoothly
      const widthScale = sin < 0 ? 1 - (1 - bw) * (-sin) : 1 - (1 - tw) * sin;
      const x = cx + sx * st.w * widthScale;
      const y = cy + sy * st.h;
      positions.push(x, y, st.z);
    }
  }

  // Skin between stations
  for (let s = 0; s < numStations - 1; s++) {
    const r0 = s * ringVerts;
    const r1 = (s + 1) * ringVerts;
    for (let i = 0; i < radialSegs; i++) {
      const a = r0 + i;
      const b = r0 + i + 1;
      const c = r1 + i;
      const d = r1 + i + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  // Watertight front cap (first station) & rear cap (last station). Winding must face outward
  // (front cap toward -z, rear cap toward +z) or the nose/tail tip of every lofted part
  // back-face-culls into a visible hole.
  const firstCenterIdx = positions.length / 3;
  const st0 = stations[0];
  positions.push(st0.cx ?? 0, st0.cy, st0.z);
  for (let i = 0; i < radialSegs; i++) {
    indices.push(firstCenterIdx, i + 1, i);
  }

  const lastCenterIdx = positions.length / 3;
  const stN = stations[numStations - 1];
  const lastRingStart = (numStations - 1) * ringVerts;
  positions.push(stN.cx ?? 0, stN.cy, stN.z);
  for (let i = 0; i < radialSegs; i++) {
    indices.push(lastCenterIdx, lastRingStart + i, lastRingStart + i + 1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  return crease(orientOutward(geo), 48);
}

/** NACA-inspired cambered aerofoil lofted across spanwise WingStations. */
export function wingElement(
  stations: WingStation[],
  thicknessRatio = 0.06,
  camberRatio = 0.08,
  profileSegs = 14,
): THREE.BufferGeometry {
  const numStations = stations.length;
  const ringVerts = profileSegs * 2 + 1;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let s = 0; s < numStations; s++) {
    const st = stations[s];
    const pitchRad = THREE.MathUtils.degToRad(st.pitch);
    const cosP = Math.cos(pitchRad);
    const sinP = Math.sin(pitchRad);

    for (let i = 0; i < ringVerts; i++) {
      // Walk from trailing edge (u=1) over upper surface to leading edge (u=0) and back under lower surface (u=1)
      const norm = i / (ringVerts - 1); // 0..1
      const isUpper = norm <= 0.5;
      const t = isUpper ? 1 - norm * 2 : (norm - 0.5) * 2;
      // Cosine spacing concentrates vertices around the tight leading edge radius
      const u = 0.5 * (1 - Math.cos(t * Math.PI));

      const yt =
        5 *
        thicknessRatio *
        (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u * u * u - 0.1036 * u * u * u * u);
      const yc = camberRatio * 4 * u * (1 - u);

      const localY = (yc + (isUpper ? yt : -yt)) * st.chord;
      const localZ = -u * st.chord; // Trailing edge extends toward -z

      const rotY = localY * cosP - localZ * sinP;
      const rotZ = localY * sinP + localZ * cosP;

      positions.push(st.x, st.y + rotY, st.z + rotZ);
    }
  }

  for (let s = 0; s < numStations - 1; s++) {
    const r0 = s * ringVerts;
    const r1 = (s + 1) * ringVerts;
    for (let i = 0; i < ringVerts - 1; i++) {
      const a = r0 + i;
      const b = r0 + i + 1;
      const c = r1 + i;
      const d = r1 + i + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  // Cap left and right wingtips
  for (const [sIdx, flip] of [
    [0, false],
    [numStations - 1, true],
  ] as const) {
    const base = sIdx * ringVerts;
    const half = profileSegs;
    for (let i = 0; i < half - 1; i++) {
      const u0 = base + i;
      const u1 = base + i + 1;
      const l0 = base + (ringVerts - 1 - i);
      const l1 = base + (ringVerts - 2 - i);
      if (flip) {
        indices.push(u0, u1, l0, u1, l1, l0);
      } else {
        indices.push(u0, l0, u1, u1, l0, l1);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  return crease(orientOutward(geo), 38);
}

/** Rounded rectangle THREE.Shape centred at origin. */
export function rrectShape(w: number, h: number, r: number): THREE.Shape {
  const hw = w / 2;
  const hh = h / 2;
  const cr = Math.min(r, hw, hh);
  const s = new THREE.Shape();
  s.moveTo(-hw + cr, -hh);
  s.lineTo(hw - cr, -hh);
  s.quadraticCurveTo(hw, -hh, hw, -hh + cr);
  s.lineTo(hw, hh - cr);
  s.quadraticCurveTo(hw, hh, hw - cr, hh);
  s.lineTo(-hw + cr, hh);
  s.quadraticCurveTo(-hw, hh, -hw, hh - cr);
  s.lineTo(-hw, -hh + cr);
  s.quadraticCurveTo(-hw, -hh, -hw + cr, -hh);
  return s;
}

/** Extrude a 2D profile in the side (z, y) plane across width `thickness` centred at `xCenter`. */
export function sideProfile(
  pts: [number, number][],
  thickness: number,
  xCenter = 0,
  bevel = 0,
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 4,
  });
  geo.translate(0, 0, -thickness / 2);
  // rotateY(+90deg) maps shape-local x -> world -z, flipping every caller's authored z (front/rear)
  // sign; -90deg preserves it so callers can write real car-space z directly, matching loft()/S().
  geo.rotateY(-Math.PI / 2);
  geo.translate(xCenter, 0, 0);
  return crease(geo, 38);
}

/** Extrude a planform (x, z) polygon or THREE.Shape vertically across `height` at base `yBottom`. */
export function planProfile(
  ptsOrShape: [number, number][] | THREE.Shape,
  height: number,
  yBottom = 0,
  bevel = 0,
): THREE.BufferGeometry {
  let shape: THREE.Shape;
  if (ptsOrShape instanceof THREE.Shape) {
    shape = ptsOrShape;
  } else {
    shape = new THREE.Shape();
    shape.moveTo(ptsOrShape[0][0], ptsOrShape[0][1]);
    for (let i = 1; i < ptsOrShape.length; i++) shape.lineTo(ptsOrShape[i][0], ptsOrShape[i][1]);
    shape.closePath();
  }

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 5,
  });
  // rotateX(+90deg) maps shape-local y -> world +z so callers' authored (x, z) planforms keep
  // their front/rear sign (-90deg mirrored the floor nose-to-tail); the extrusion then runs
  // downward, so lift it by `height` to sit on `yBottom`.
  geo.rotateX(Math.PI / 2);
  geo.translate(0, yBottom + height, 0);
  return crease(geo, 40);
}

/** Cylinder / aero strut between two 3D points `a` and `b`. */
export function strut(
  a: [number, number, number],
  b: [number, number, number],
  radius: number,
  radialSegs = 6,
): THREE.BufferGeometry {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const diff = new THREE.Vector3().subVectors(vb, va);
  const len = diff.length();
  const mid = new THREE.Vector3().addVectors(va, vb).multiplyScalar(0.5);

  const geo = new THREE.CylinderGeometry(radius, radius, len, radialSegs, 1, false);
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    diff.normalize(),
  );
  geo.applyQuaternion(q);
  geo.translate(mid.x, mid.y, mid.z);
  return crease(geo, 50);
}

/** Ellipsoid primitive scaled by (rx, ry, rz) at `center`. */
export function ellipsoid(
  rx: number,
  ry: number,
  rz: number,
  center: [number, number, number],
  wSegs = 12,
  hSegs = 8,
): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, wSegs, hSegs);
  geo.scale(rx, ry, rz);
  geo.translate(center[0], center[1], center[2]);
  return crease(geo, 55);
}

/** Box primitive centred at `center`, optionally rotated. */
export function box(
  w: number,
  h: number,
  d: number,
  center: [number, number, number] = [0, 0, 0],
  rot: [number, number, number] = [0, 0, 0],
): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  return xform(geo, center, rot);
}