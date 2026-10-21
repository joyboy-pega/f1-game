import * as THREE from 'three';
import type { Livery } from '@/lib/game/constants';
import {
  ATLAS_H,
  ATLAS_W,
  LIVERY_Z0,
  LIVERY_Z1,
  PATCH_TOP,
  PATCH_W,
  RING_ROWS,
  SIDE_L_TOP,
  SIDE_ROW_H,
  SIDE_R_TOP,
} from './geom';

/**
 * Livery painting + cached per-livery body material. One CanvasTexture per unique
 * (body, accent, rim, number) — shared by every car wearing it. See `geom.ts` for the
 * atlas layout the UV modes expect.
 */

const SPONSORS = ['AXON', 'NOVA OIL', 'VOLTEX', 'ZENITH', 'PULSE', 'KAIRO', 'HELIX', 'ORBIT'];

function luminance(hex: string): number {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

function contrastInk(bg: string): string {
  return luminance(bg) > 0.35 ? '#0d0f14' : '#ffffff';
}

const zToPx = (z: number) => ((z - LIVERY_Z0) / (LIVERY_Z1 - LIVERY_Z0)) * ATLAS_W;

function drawRing(ctx: CanvasRenderingContext2D, l: Livery) {
  const ink = contrastInk(l.body);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, ATLAS_W, RING_ROWS);
  ctx.clip();
  ctx.fillStyle = l.body;
  ctx.fillRect(0, 0, ATLAS_W, RING_ROWS);

  // Underside darkening (t near 0 and 1).
  const g = ctx.createLinearGradient(0, 0, 0, RING_ROWS);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.12, 'rgba(0,0,0,0)');
  g.addColorStop(0.88, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, ATLAS_W, RING_ROWS);

  // Twin accent stripes down the spine (t = 0.5 is the top centreline).
  const spine = RING_ROWS / 2;
  ctx.fillStyle = l.accent;
  ctx.fillRect(zToPx(-1.55), spine - 34, ATLAS_W, 12);
  ctx.fillRect(zToPx(-1.55), spine + 22, ATLAS_W, 12);

  // Swoosh sweeping from the airbox down the flank (t ~ 0.25 / 0.75) toward the nose.
  for (const centre of [RING_ROWS * 0.27, RING_ROWS * 0.73]) {
    ctx.beginPath();
    ctx.moveTo(zToPx(-0.2), centre + 40);
    ctx.bezierCurveTo(zToPx(0.4), centre + 34, zToPx(0.9), centre - 6, zToPx(1.5), centre - 22);
    ctx.lineTo(zToPx(1.5), centre - 4);
    ctx.bezierCurveTo(zToPx(0.9), centre + 18, zToPx(0.4), centre + 52, zToPx(-0.2), centre + 58);
    ctx.closePath();
    ctx.fillStyle = l.accent;
    ctx.fill();
  }

  // Accent nose tip.
  ctx.fillStyle = l.accent;
  ctx.fillRect(zToPx(1.72), 0, ATLAS_W, RING_ROWS);

  // Car number — nose roundel and large on the engine cover (rotated: tops point at the nose).
  const num = String(l.number);
  const drawNumber = (zc: number, size: number, roundel: boolean) => {
    ctx.save();
    ctx.translate(zToPx(zc), spine);
    ctx.rotate(Math.PI / 2);
    if (roundel) {
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.78, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
    ctx.fillStyle = roundel ? '#0d0f14' : ink;
    ctx.font = `900 ${size}px "Arial Black", Impact, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(num, 0, size * 0.04);
    ctx.restore();
  };
  drawNumber(1.18, 70, true);
  drawNumber(-0.62, 92, false);

  // Team logo flash on the airbox.
  ctx.save();
  ctx.translate(zToPx(-0.2), spine);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = l.accent;
  ctx.font = '900 30px "Arial Black", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('BUDDH GP', 0, 0);
  ctx.restore();
  ctx.restore();
}

function drawSide(ctx: CanvasRenderingContext2D, l: Livery, top: number, mirrored: boolean) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, top, ATLAS_W, SIDE_ROW_H);
  ctx.clip();
  ctx.fillStyle = l.body;
  ctx.fillRect(0, top, ATLAS_W, SIDE_ROW_H);
  // Lower edge shading.
  const g = ctx.createLinearGradient(0, top, 0, top + SIDE_ROW_H);
  g.addColorStop(0, 'rgba(255,255,255,0.10)');
  g.addColorStop(0.7, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = g;
  ctx.fillRect(0, top, ATLAS_W, SIDE_ROW_H);

  const X = (z: number) => (mirrored ? ATLAS_W - zToPx(z) : zToPx(z));
  const accent = l.accent;

  // Accent line along the sidepod ridge (the top surface samples rows ~12-28).
  ctx.fillStyle = accent;
  ctx.fillRect(0, top + 16, ATLAS_W, 7);

  // Accent wave on the flank.
  ctx.beginPath();
  ctx.moveTo(X(-1.4), top + 86);
  ctx.bezierCurveTo(X(-0.9), top + 80, X(-0.5), top + 68, X(0.1), top + 62);
  ctx.lineTo(X(0.45), top + 60);
  ctx.lineTo(X(0.45), top + 70);
  ctx.bezierCurveTo(X(-0.1), top + 74, X(-0.6), top + 90, X(-1.4), top + 96);
  ctx.closePath();
  ctx.fill();

  // Sponsor blocks on the sidepod flank (rows 42-62).
  const blocks = [
    { z: -0.95, w: 120, label: SPONSORS[(l.number + 1) % SPONSORS.length], dark: true },
    { z: -0.45, w: 126, label: SPONSORS[(l.number + 3) % SPONSORS.length], dark: false },
    { z: 0.08, w: 110, label: SPONSORS[(l.number + 5) % SPONSORS.length], dark: true },
  ];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const b of blocks) {
    const cx = X(b.z);
    ctx.fillStyle = b.dark ? 'rgba(10,12,18,0.88)' : 'rgba(255,255,255,0.92)';
    ctx.fillRect(cx - b.w / 2, top + 42, b.w, 20);
    ctx.fillStyle = b.dark ? '#ffffff' : '#0d0f14';
    ctx.font = '800 14px Arial, sans-serif';
    ctx.fillText(b.label, cx, top + 52.5);
  }
  // Number on the sidepod leading edge.
  ctx.fillStyle = contrastInk(l.body);
  ctx.font = '900 30px "Arial Black", Impact, sans-serif';
  ctx.fillText(String(l.number), X(0.3), top + 52);
  ctx.restore();
}

function drawPatches(ctx: CanvasRenderingContext2D, l: Livery) {
  const cols = [l.body, l.accent, '#0f1115', '#f2f4f7'];
  cols.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(i * PATCH_W, PATCH_TOP, PATCH_W, ATLAS_H - PATCH_TOP);
  });
}

export function paintLivery(l: Livery): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_W;
  canvas.height = ATLAS_H;
  const ctx = canvas.getContext('2d')!;
  drawRing(ctx, l);
  drawSide(ctx, l, SIDE_L_TOP, true);
  drawSide(ctx, l, SIDE_R_TOP, false);
  drawPatches(ctx, l);
  return canvas;
}

const materialCache = new Map<string, THREE.MeshPhysicalMaterial>();

export function liveryKey(l: Livery): string {
  return `${l.body}|${l.accent}|${l.rim}|${l.number}`;
}

/** Shared glossy body paint for a livery. Cached; never mutate per car. */
export function getLiveryMaterial(l: Livery): THREE.MeshPhysicalMaterial {
  const key = liveryKey(l);
  const hit = materialCache.get(key);
  if (hit) return hit;
  const tex = new THREE.CanvasTexture(paintLivery(l));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  const mat = new THREE.MeshPhysicalMaterial({
    map: tex,
    roughness: 0.42,
    metalness: 0,
    clearcoat: 0.7,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1,
  });
  materialCache.set(key, mat);
  return mat;
}
