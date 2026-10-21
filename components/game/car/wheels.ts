import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { TyreCompound } from '@/lib/game/constants';

/**
 * Wheel geometry in a unit frame: axis = +x, outer radius 1, total width 1 (y/z are the
 * wheel plane). Meshes scale it by (width, radius, radius). Tyre colours are baked into
 * vertex colours so the compound stripe needs no extra draw call; a pit-stop compound
 * change just swaps the cached geometry.
 */

export const COMPOUND_COLOR: Record<TyreCompound, string> = {
  soft: '#e10600',
  medium: '#ffd400',
  hard: '#f2f2f2',
  inter: '#20c933',
  wet: '#1d6bff',
};

const TYRE_SEGS = 18;
const RUBBER = new THREE.Color('#0c0c0e');

// (radius, axial offset, isStripe)
const HALF_PROFILE: [number, number, boolean][] = [
  [0.66, 0.47, false],
  [0.72, 0.5, false],
  [0.8, 0.505, false],
  [0.805, 0.506, true],
  [0.9, 0.506, true],
  [0.905, 0.505, false],
  [0.95, 0.46, false],
  [0.988, 0.36, false],
  [1.0, 0.24, false],
  [1.0, 0.0, false],
];

const tyreCache = new Map<TyreCompound, THREE.BufferGeometry>();

export function getTyreGeometry(compound: TyreCompound): THREE.BufferGeometry {
  const hit = tyreCache.get(compound);
  if (hit) return hit;
  // Ascending axial order (bottom -> top) so Lathe normals point outward.
  const pts: [number, number, boolean][] = [
    ...HALF_PROFILE.map(([r, y, s]) => [r, -y, s] as [number, number, boolean]),
    ...[...HALF_PROFILE].reverse().slice(1).map(([r, y, s]) => [r, y, s] as [number, number, boolean]),
  ];
  const geo = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), TYRE_SEGS);
  const stripe = new THREE.Color(COMPOUND_COLOR[compound]);
  const col = new Float32Array(geo.getAttribute('position').count * 3);
  for (let i = 0; i <= TYRE_SEGS; i++) {
    for (let j = 0; j < pts.length; j++) {
      const c = pts[j][2] ? stripe : RUBBER;
      const o = (i * pts.length + j) * 3;
      col[o] = c.r;
      col[o + 1] = c.g;
      col[o + 2] = c.b;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.rotateZ(-Math.PI / 2); // lathe axis Y -> wheel axis X
  tyreCache.set(compound, geo);
  return geo;
}

const rimCache = new Map<string, THREE.BufferGeometry>();

/** Rim + spokes + hub + brake disc (disc UVs sample the white texel of the glow map). */
export function getRimGeometry(rimColor: string): THREE.BufferGeometry {
  const hit = rimCache.get(rimColor);
  if (hit) return hit;
  const rim = new THREE.Color(rimColor);
  const discCol = new THREE.Color('#5b5d63');
  const parts: THREE.BufferGeometry[] = [];

  const paint = (g: THREE.BufferGeometry, c: THREE.Color, glow: boolean) => {
    const src = g.index ? g.toNonIndexed() : g;
    const n = src.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
      uv[i * 2] = glow ? 0.25 : 0.75;
      uv[i * 2 + 1] = 0.5;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', src.getAttribute('position'));
    out.setAttribute('normal', src.getAttribute('normal'));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return out;
  };

  // Barrel (visible from both sides)
  const barrel = new THREE.LatheGeometry(
    [new THREE.Vector2(0.6, -0.47), new THREE.Vector2(0.665, -0.43), new THREE.Vector2(0.665, 0.43), new THREE.Vector2(0.6, 0.47)],
    TYRE_SEGS,
  );
  parts.push(paint(barrel, rim.clone().multiplyScalar(0.8), false));

  // Hub
  const hub = new THREE.CylinderGeometry(0.17, 0.17, 0.9, 8, 1, false);
  parts.push(paint(hub, rim.clone().multiplyScalar(0.7), false));

  // Spokes on both faces
  for (const side of [-1, 1]) {
    for (let k = 0; k < 6; k++) {
      const spoke = new THREE.BoxGeometry(0.13, 0.06, 0.5);
      spoke.translate(0, 0, 0.4);
      spoke.rotateY((k / 6) * Math.PI * 2);
      spoke.translate(0, side * 0.4, 0);
      parts.push(paint(spoke, rim, false));
    }
    const ring = new THREE.LatheGeometry(
      [new THREE.Vector2(0.56, side * 0.41), new THREE.Vector2(0.665, side * 0.4)],
      TYRE_SEGS,
    );
    parts.push(paint(ring, rim, false));
  }

  // Brake disc (flat annulus, material is double sided)
  const disc = new THREE.LatheGeometry([new THREE.Vector2(0.2, 0.02), new THREE.Vector2(0.56, 0.02)], 20);
  parts.push(paint(disc, discCol, true));

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('rim merge failed');
  merged.rotateZ(-Math.PI / 2);
  rimCache.set(rimColor, merged);
  return merged;
}

/** 2x1 texture: left texel white (glowing brake disc), right texel black. */
let glowMap: THREE.CanvasTexture | null = null;
export function getGlowMap(): THREE.CanvasTexture {
  if (glowMap) return glowMap;
  const c = document.createElement('canvas');
  c.width = 2;
  c.height = 1;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 1, 1);
  ctx.fillStyle = '#000';
  ctx.fillRect(1, 0, 1, 1);
  glowMap = new THREE.CanvasTexture(c);
  glowMap.magFilter = THREE.NearestFilter;
  glowMap.minFilter = THREE.NearestFilter;
  glowMap.generateMipmaps = false;
  return glowMap;
}
