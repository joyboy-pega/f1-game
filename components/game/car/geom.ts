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
//   canvas 1024 x 512
//   rows   0..255  : "ring" region — cylindrical wrap of fuselage / engine cover
//   rows 256..351  : left (+x) side panels, nose points to the canvas left
//   rows 352..447  : right (-x) side panels, nose points to the canvas right
//   rows 448..511  : solid colour patches, 64 px wide each (body, accent, dark, white)
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

export type UvMode = { kind: 'ring' } | { kind: 'side' } | { kind: 'patch'; patch: Patch };

// ---------------------------------------------------------------------------
// Low-level utilities
// ---------------------------------------------------------------------------

/** Keep position/normal/uv only, non-indexed, so everything merges cleanly. */
export function normalize(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geo;
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv' && name !== 'color') g.deleteAttribute(name);
  }
  if (!g.getAttribute('uv')) {
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
  }
  if (g.index) g = g.toNonIndexed();
  g.clearGroups();
  return g;
}

/** Flip triangle winding (needed after a mirroring transform). */
export function flipWinding(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  if (geo.index) {
    const idx = geo.index.array as Uint16Array | Uint32Array;
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
    geo.index.needsUpdate = true;
    return geo;
  }
  for (const name of Object.keys(geo.attributes)) {
    const attr = geo.getAttribute(name) as THREE.BufferAttribute;
    const n = attr.itemSize;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < attr.count; i += 3) {
      for (let c = 0; c < n; c++) {
        const a = (i + 1) * n + c;
        const b = (i + 2) * n + c;
        const t = arr[a];
        arr[a] = arr[b];
        arr[b] = t;
      }
    }
    attr.needsUpdate = true;
  }
  return geo;
}

/** If a closed mesh has negative signed volume, flip it so normals point outward. */
export function ensureOutward(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = geo.getAttribute('position');
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let vol = 0;
  const tri = (i0: number, i1: number, i2: number) => {
    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i1);
    c.fromBufferAttribute(pos, i2);
    vol += a.dot(b.cross(c));
  };
  if (geo.index) {
    for (let i = 0; i < geo.index.count; i += 3) tri(geo.index.getX(i), geo.index.getX(i + 1), geo.index.getX(i + 2));
  } else {
    for (let i = 0; i < pos.count; i += 3) tri(i, i + 1, i + 2);
  }
  if (vol < 0) flipWinding(geo);
  return geo;
}

/** Smooth-shade where faces meet at less than `deg` degrees (keeps wing edges crisp). */
export function crease(geo: THREE.BufferGeometry, deg = 40): THREE.BufferGeometry {
  const ni = geo.index ? geo.toNonIndexed() : geo;
  return toCreasedNormals(ni, THREE.MathUtils.degToRad(deg));
}

export function xform(
  geo: THREE.BufferGeometry,
  opts: { pos?: [number, number, number]; rot?: [number, number, number]; scale?: [number, number, number] },
): THREE.BufferGeometry {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...(opts.rot ?? [0, 0, 0]), 'YXZ'));
  const p = new THREE.Vector3(...(opts.pos ?? [0, 0, 0]));
  const s = new THREE.Vector3(...(opts.scale ?? [1, 1, 1]));
  m.compose(p, q, s);
  geo.applyMatrix4(m);
  // Negative scale mirrors the mesh: restore outward winding.
  if (s.x * s.y * s.z < 0) flipWinding(geo);
  return geo;
}

// ---------------------------------------------------------------------------
// UV assignment — write final atlas coordinates into a geometry
// ---------------------------------------------------------------------------

function setUv(geo: THREE.BufferGeometry, fn: (x: number, y: number, z: number, i: number, u: number, v: number) => [number, number]) {
  const pos = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < pos.count; i++) {
    const [u, v] = fn(pos.getX(i), pos.getY(i), pos.getZ(i), i, uv.getX(i), uv.getY(i));
    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
}

/** px,py in canvas pixels (origin top-left) -> uv (flipY textures). */
const px2uv = (px: number, py: number): [number, number] => [px / ATLAS_W, 1 - py / ATLAS_H];

/**
 * Apply a UV mode. For 'ring' the geometry must carry the ring parameter t (0..1 around
 * the section, bottom -> +x side -> top -> -x side) in uv.y — `loft` writes it.
 */
export function applyUv(geo: THREE.BufferGeometry, mode: UvMode): THREE.BufferGeometry {
  if (mode.kind === 'ring') {
    setUv(geo, (_x, _y, z, _i, _u, t) => {
      const u = (z - LIVERY_Z0) / (LIVERY_Z1 - LIVERY_Z0);
      return px2uv(u * ATLAS_W, t * RING_ROWS);
    });
  } else if (mode.kind === 'side') {
    setUv(geo, (x, y, z) => {
      const f = (z - LIVERY_Z0) / (LIVERY_Z1 - LIVERY_Z0);
      const vy = THREE.MathUtils.clamp((SIDE_Y1 - y) / (SIDE_Y1 - SIDE_Y0), 0.02, 0.98);
      if (x > 0.0001) return px2uv((1 - f) * ATLAS_W, SIDE_L_TOP + vy * SIDE_ROW_H);
      return px2uv(f * ATLAS_W, SIDE_R_TOP + vy * SIDE_ROW_H);
    });
  } else {
    const idx = PATCH_INDEX[mode.patch];
    const [u, v] = px2uv(idx * PATCH_W + PATCH_W / 2, PATCH_TOP + 32);
    setUv(geo, () => [u, v]);
  }
  return geo;
}

// ---------------------------------------------------------------------------
// Superellipse-section loft (fuselage, engine cover, sidepods, car bodies)
// ---------------------------------------------------------------------------

export interface Station {
  z: number;
  /** section centre */
  cx?: number;
  cy: number;
  /** half width / half height */
  w: number;
  h: number;
  /** superellipse exponent: 2 = ellipse, higher = boxier. */
  n?: number;
  /** lower half width multiplier (< 1 = undercut / tumblehome) */
  bw?: number;
  /** upper half width multiplier (< 1 = narrow shoulders) */
  tw?: number;
}

export function loft(stationsIn: Station[], segs = 14): THREE.BufferGeometry {
  const stations = [...stationsIn].sort((a, b) => a.z - b.z);
  const ringN = segs + 1; // duplicated seam so the ring parameter t can reach 1
  const positions: number[] = [];
  const ts: number[] = [];
  const indices: number[] = [];

  for (const st of stations) {
    const n = st.n ?? 2.4;
    const e = 2 / n;
    for (let k = 0; k <= segs; k++) {
      const t = k / segs;
      const th = -Math.PI / 2 + t * Math.PI * 2;
      const c = Math.cos(th);
      const s = Math.sin(th);
      const wMul = s < 0 ? (st.bw ?? 1) : (st.tw ?? 1);
      positions.push(
        (st.cx ?? 0) + st.w * wMul * Math.sign(c) * Math.pow(Math.abs(c), e),
        st.cy + st.h * Math.sign(s) * Math.pow(Math.abs(s), e),
        st.z,
      );
      ts.push(t);
    }
  }

  for (let i = 0; i < stations.length - 1; i++) {
    for (let k = 0; k < segs; k++) {
      const a = i * ringN + k;
      const b = a + 1;
      const c = (i + 1) * ringN + k + 1;
      const d = (i + 1) * ringN + k;
      indices.push(a, b, c, a, c, d);
    }
  }

  // Caps with their own vertices (flat normals).
  const addCap = (stIdx: number, nz: number) => {
    const st = stations[stIdx];
    const base = positions.length / 3;
    positions.push(st.cx ?? 0, st.cy, st.z);
    ts.push(0.5);
    for (let k = 0; k < segs; k++) {
      const src = (stIdx * ringN + k) * 3;
      positions.push(positions[src], positions[src + 1], positions[src + 2]);
      ts.push(k / segs);
    }
    for (let k = 0; k < segs; k++) {
      const v0 = base;
      const v1 = base + 1 + k;
      const v2 = base + 1 + ((k + 1) % segs);
      if (nz > 0) indices.push(v0, v1, v2);
      else indices.push(v0, v2, v1);
    }
  };
  addCap(0, -1);
  addCap(stations.length - 1, 1);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const uv = new Float32Array((positions.length / 3) * 2);
  for (let i = 0; i < ts.length; i++) uv[i * 2 + 1] = ts[i];
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(indices);
  ensureOutward(geo);
  geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------------------
// Wing element: airfoil section lofted across the span
// ---------------------------------------------------------------------------

export interface WingStation {
  x: number;
  /** height of the leading edge */
  y: number;
  /** z of the leading edge (nose side) */
  z: number;
  chord: number;
  /** degrees; positive lifts the trailing edge (downforce attitude) */
  pitch: number;
}

const AIRFOIL_C = [0, 0.015, 0.06, 0.15, 0.3, 0.5, 0.7, 0.87, 1];

/** camber: how far the mid-chord bows downward (fraction of chord); thick: max thickness fraction. */
export function wingElement(stations: WingStation[], camber = 0.07, thick = 0.1): THREE.BufferGeometry {
  const prof: [number, number][] = []; // (c, y) normalised to chord
  const half = (c: number) => 5 * thick * (0.2969 * Math.sqrt(c) - 0.126 * c - 0.3516 * c * c + 0.2843 * c ** 3 - 0.1015 * c ** 4);
  const mid = (c: number) => -camber * 4 * c * (1 - c);
  for (const c of AIRFOIL_C) prof.push([c, mid(c) + half(c) + (c === 1 ? 0.004 : 0)]);
  for (let i = AIRFOIL_C.length - 2; i >= 1; i--) {
    const c = AIRFOIL_C[i];
    prof.push([c, mid(c) - half(c)]);
  }
  const ringN = prof.length;
  const positions: number[] = [];
  const indices: number[] = [];
  for (const st of stations) {
    const a = THREE.MathUtils.degToRad(st.pitch);
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    for (const [c, yy] of prof) {
      const dz = -c * st.chord;
      const dy = yy * st.chord;
      positions.push(st.x, st.y + dy * ca - dz * sa, st.z + dy * sa + dz * ca);
    }
  }
  for (let i = 0; i < stations.length - 1; i++) {
    for (let k = 0; k < ringN; k++) {
      const a = i * ringN + k;
      const b = i * ringN + ((k + 1) % ringN);
      const c = (i + 1) * ringN + ((k + 1) % ringN);
      const d = (i + 1) * ringN + k;
      indices.push(a, b, c, a, c, d);
    }
  }
  const addCap = (i: number) => {
    const base = positions.length / 3;
    let cy = 0;
    let cz = 0;
    for (let k = 0; k < ringN; k++) {
      positions.push(positions[(i * ringN + k) * 3], positions[(i * ringN + k) * 3 + 1], positions[(i * ringN + k) * 3 + 2]);
      cy += positions[(i * ringN + k) * 3 + 1];
      cz += positions[(i * ringN + k) * 3 + 2];
    }
    positions.push(stations[i].x, cy / ringN, cz / ringN);
    const centre = base + ringN;
    for (let k = 0; k < ringN; k++) indices.push(centre, base + k, base + ((k + 1) % ringN));
  };
  addCap(0);
  addCap(stations.length - 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  ensureOutward(geo);
  const g = geo.toNonIndexed();
  g.computeVertexNormals(); // non-indexed => flat; fine for thin wing planes
  return crease(g, 55);
}

// ---------------------------------------------------------------------------
// Extruded profiles
// ---------------------------------------------------------------------------

type Pt = [number, number];

export function shapeFrom(points: Pt[]): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) s.lineTo(points[i][0], points[i][1]);
  s.closePath();
  return s;
}

export function rrectShape(w: number, h: number, r: number): THREE.Shape {
  const x = -w / 2;
  const y = -h / 2;
  const s = new THREE.Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function extrude(shape: THREE.Shape, depth: number, bevel: number, curveSegs = 3): THREE.ExtrudeGeometry {
  return new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: curveSegs,
    steps: 1,
  });
}

/**
 * Side profile: shape points are (z, y); extruded across x, centred on `x`.
 * `thickness` is the total width in x.
 */
export function sideProfile(shapeOrPts: THREE.Shape | Pt[], thickness: number, x = 0, bevel = 0.004): THREE.BufferGeometry {
  const shape = Array.isArray(shapeOrPts) ? shapeFrom(shapeOrPts) : shapeOrPts;
  const depth = Math.max(0.001, thickness - bevel * 2);
  const g = extrude(shape, depth, bevel);
  // shape-x -> world z, shape-y -> world y, extrusion (shape-z) -> world -x (right-handed)
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0));
  g.applyMatrix4(m);
  g.translate(x + depth / 2, 0, 0);
  return crease(g, 50);
}

/**
 * Plan-view profile: shape points are (x, z); extruded downward from `yTop` by `thickness`.
 */
export function planProfile(shapeOrPts: THREE.Shape | Pt[], thickness: number, yTop: number, bevel = 0.004): THREE.BufferGeometry {
  const shape = Array.isArray(shapeOrPts) ? shapeFrom(shapeOrPts) : shapeOrPts;
  const depth = Math.max(0.001, thickness - bevel * 2);
  const g = extrude(shape, depth, bevel);
  // shape-x -> x, shape-y -> z, extrusion -> -y (right-handed basis, so winding is preserved)
  const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0));
  g.applyMatrix4(m);
  g.translate(0, yTop - bevel, 0);
  return crease(g, 50);
}

/** Cylinder from point A to point B (suspension arms, struts). */
export function strut(a: [number, number, number], b: [number, number, number], radius = 0.011, radial = 5): THREE.BufferGeometry {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const g = new THREE.CylinderGeometry(radius, radius, len, radial, 1, false);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  const m = new THREE.Matrix4().compose(va.clone().add(vb).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(m);
  return g;
}

export function ellipsoid(rx: number, ry: number, rz: number, pos: [number, number, number], wSeg = 10, hSeg = 7): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, wSeg, hSeg);
  g.scale(rx, ry, rz);
  g.translate(...pos);
  return g;
}

export function box(sx: number, sy: number, sz: number, pos: [number, number, number], rot: [number, number, number] = [0, 0, 0]): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  return xform(g, { pos, rot });
}

/** Normalise every part, assign UVs, merge into one draw-call geometry. */
export function mergeParts(parts: { geo: THREE.BufferGeometry; uv?: UvMode }[]): THREE.BufferGeometry {
  const list = parts.map((p) => {
    const g = normalize(p.geo);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (p.uv) applyUv(g, p.uv);
    else applyUv(g, { kind: 'patch', patch: 'dark' });
    return g;
  });
  const merged = mergeGeometries(list, false);
  if (!merged) throw new Error('mergeParts failed (attribute mismatch)');
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

export function triCount(g: THREE.BufferGeometry): number {
  return Math.round((g.index ? g.index.count : g.getAttribute('position').count) / 3);
}
