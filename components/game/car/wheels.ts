import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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

const TYRE_SEGS = 24;
const RUBBER = new THREE.Color('#0c0c0e');
const SIDEWALL_SHEEN = new THREE.Color('#141418');

// 2026 18-inch low-profile tyre half-section: [radius, axialOffset, isStripe]
const HALF_PROFILE: [number, number, boolean][] = [
  [0.57, 0.44, false], // Inner bead seat against 18" rim flange
  [0.64, 0.475, false],
  [0.73, 0.498, false],
  [0.755, 0.503, true], // Pirelli compound arc start
  [0.835, 0.503, true], // Pirelli compound arc end
  [0.86, 0.498, false],
  [0.935, 0.468, false], // Rounded shoulder transition
  [0.985, 0.39, false],
  [0.998, 0.25, false],
  [1.0, 0.0, false], // Crown centreline
];

const tyreCache = new Map<TyreCompound, THREE.BufferGeometry>();
let rimCache: THREE.BufferGeometry | null = null;
let glowMapCache: THREE.Texture | null = null;

export function getTyreGeometry(compound: TyreCompound): THREE.BufferGeometry {
  const hit = tyreCache.get(compound);
  if (hit) return hit;

  const upperReversed = [...HALF_PROFILE].slice(0, -1).reverse();
  const pts: [number, number, boolean][] = [
    ...HALF_PROFILE.map(([r, y, s]) => [r, -y, s] as [number, number, boolean]),
    ...upperReversed.map(([r, y, s]) => [r, y, s] as [number, number, boolean]),
  ];

  const lathePts = pts.map(([r, y]) => new THREE.Vector2(r, y));
  const raw = new THREE.LatheGeometry(lathePts, TYRE_SEGS);
  raw.rotateZ(-Math.PI / 2);

  const geo = toCreasedNormals(raw, THREE.MathUtils.degToRad(48));
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const stripeColor = new THREE.Color(COMPOUND_COLOR[compound]);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(y, z);
    const absX = Math.abs(x);

    const theta = Math.atan2(z, y);
    const inGap = Math.abs(Math.sin(theta * 1.5)) < 0.16;
    const isStripeBand = r >= 0.748 && r <= 0.842 && absX > 0.485 && !inGap;

    const c = isStripeBand ? stripeColor : absX > 0.47 ? SIDEWALL_SHEEN : RUBBER;
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  tyreCache.set(compound, geo);
  return geo;
}

/**
 * 2026 18-inch F1 Wheel Rim + Concave Aero Cover + Internal Glowing Brake Disc. The outer aero cover
 * hides the barrel on every real 2026 car, so colours are fixed (cover/flange/nut/rotor) rather than
 * tinted per livery.
 * Includes `color` and `uv` attributes required by `createCarMaterials().rimFront / rimRear`.
 */
export function getRimGeometry(): THREE.BufferGeometry {
  if (rimCache) return rimCache;

  const parts: THREE.BufferGeometry[] = [];

  // 1. Deep barrel, internal brake rotor face & outer 2026 aero wheel cover
  const rimProfile: [number, number][] = [
    [0.0, -0.15], // Inner hub center (brake disc plane)
    [0.44, -0.15], // Carbon brake rotor outer edge
    [0.44, -0.18],
    [0.54, -0.45], // Inner barrel lip
    [0.51, -0.42],
    [0.51, 0.32], // Barrel bed
    [0.585, 0.455], // Outer 18" rim flange lip
    [0.555, 0.468], // Aero cover outer step
    [0.44, 0.43], // Concave dish slope
    [0.21, 0.415], // Center hub recess
    [0.18, 0.455], // Center-lock cone base
    [0.09, 0.475], // Center-lock nut tip
    [0.0, 0.465], // Cap center
  ];

  const lathe = new THREE.LatheGeometry(
    rimProfile.map(([r, y]) => new THREE.Vector2(r, y)),
    TYRE_SEGS,
  );
  lathe.rotateZ(-Math.PI / 2);
  parts.push(toCreasedNormals(lathe, THREE.MathUtils.degToRad(38)));

  // 2. 2026 Aero Cover Rotational Vortex Strakes (6 radial ribs on outer dish)
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const rib = new THREE.BoxGeometry(0.022, 0.24, 0.028);
    rib.translate(0.435, 0.31, 0);
    rib.rotateX(angle);
    parts.push(toCreasedNormals(rib, 35));
  }

  const merged = mergeGeometries(parts, false);
  merged.computeVertexNormals();

  // Populate vertex colors and radial UVs (so the brake disc glows via getGlowMap() while outer cover stays dark)
  const pos = merged.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const uvs = new Float32Array(pos.count * 2);

  const cCover = new THREE.Color('#181a20'); // Matte carbon aero cover
  const cFlange = new THREE.Color('#b8bec8'); // Machined alloy outer lip
  const cNut = new THREE.Color('#e10600'); // Anodized center-lock wheel nut
  const cRotor = new THREE.Color('#2a2624'); // Carbon-ceramic brake rotor

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(y, z);

    let col = cCover;
    if (x < -0.1 && r < 0.46) {
      col = cRotor;
    } else if (r > 0.545 && x > 0.35) {
      col = cFlange;
    } else if (r < 0.19 && x > 0.42) {
      col = cNut;
    }

    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;

    // Map brake rotor region to center of glow texture (0.5, 0.5), and outer cover to (0, 0) where glow alpha = 0
    if (x < 0.05 && r < 0.48) {
      uvs[i * 2] = 0.5 + (y / 0.96) * 0.5;
      uvs[i * 2 + 1] = 0.5 + (z / 0.96) * 0.5;
    } else {
      uvs[i * 2] = 0.0;
      uvs[i * 2 + 1] = 0.0;
    }
  }

  merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

  rimCache = merged;
  return rimCache;
}

/**
 * Radial soft orange-hot brake disc glow map used by `createCarMaterials()`.
 */
export function getGlowMap(): THREE.Texture {
  if (glowMapCache) return glowMapCache;

  const size = 128;
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const half = size / 2;
      const grad = ctx.createRadialGradient(half, half * 0.25, half, half, half * 0.9, half);
      grad.addColorStop(0.0, 'rgba(0, 0, 0, 1.0)');
      grad.addColorStop(0.35, 'rgba(255, 255, 255, 1.0)');
      grad.addColorStop(0.75, 'rgba(255, 180, 60, 0.85)');
      grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    glowMapCache = tex;
    return tex;
  }

  const data = new Uint8Array(size * size * 4);
  const tex = new THREE.DataTexture(data, size, size);
  tex.needsUpdate = true;
  glowMapCache = tex;
  return tex;
}