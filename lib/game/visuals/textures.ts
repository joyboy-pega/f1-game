// Procedural canvas textures for the world. Cached per page load (a few MB total);
// they are shared by every world component and intentionally never disposed.
import * as THREE from 'three';
import { rng } from './trackData';

const cache = new Map<string, object>();

function mk(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })!];
}

interface TexOpts {
  srgb?: boolean;
  wrapS?: THREE.Wrapping;
  wrapT?: THREE.Wrapping;
  aniso?: number;
}
function toTex(c: HTMLCanvasElement, o: TexOpts = {}): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = o.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = o.wrapS ?? THREE.RepeatWrapping;
  t.wrapT = o.wrapT ?? THREE.RepeatWrapping;
  t.anisotropy = o.aniso ?? 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

function cached<T extends object>(key: string, make: () => T): T {
  let t = cache.get(key) as T | undefined;
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

/** Soft blob drawn with wrap-around so the tile stays seamless. */
function blob(ctx: CanvasRenderingContext2D, w: number, h: number, x: number, y: number, rx: number, ry: number, color: string) {
  for (const ox of [-w, 0, w]) {
    for (const oy of [-h, 0, h]) {
      const cx = x + ox, cy = y + oy;
      if (cx + rx < 0 || cx - rx > w || cy + ry < 0 || cy - ry > h) continue;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, ry / rx);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      g.addColorStop(0, color);
      g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
      ctx.fillStyle = g;
      ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
      ctx.restore();
    }
  }
}

/** Add per-pixel grain to the canvas; returns luminance-derived roughness canvas. */
function grain(ctx: CanvasRenderingContext2D, w: number, h: number, amp: number, rand: () => number, roughBase: number, roughSpan: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const [rc, rctx] = mk(w, h);
  const rimg = rctx.createImageData(w, h);
  const rd = rimg.data;
  for (let i = 0; i < d.length; i += 4) {
    let n = (rand() - 0.5) * amp;
    const r = rand();
    if (r > 0.992) n += amp * 1.1; // bright aggregate
    else if (r < 0.006) n -= amp * 0.9; // pore
    const lum = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n * 1.05));
    const rv = Math.max(0, Math.min(255, roughBase + (lum - 45) * roughSpan + n * 0.4));
    rd[i] = rd[i + 1] = rd[i + 2] = rv;
    rd[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  rctx.putImageData(rimg, 0, 0);
  return rc;
}

// --- asphalt ----------------------------------------------------------------
/** Racing tarmac, 130 x 512 units per tile: edge lines, tyre-rubber lanes, dust shoulders, snow dusting. */
export function getRoadTextures(snow = false) {
  return cached(`road_${snow}`, () => {
    const W = 512, H = 2048;
    const rand = rng(11);
    const [c, ctx] = mk(W, H);
    ctx.fillStyle = snow ? '#42474f' : '#34373c';
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 380; i++) {
      const dark = rand() < 0.55;
      blob(ctx, W, H, rand() * W, rand() * H, 20 + rand() * 110, 20 + rand() * 160, dark ? `rgba(0,0,0,${0.04 + rand() * 0.06})` : `rgba(210,210,215,${0.02 + rand() * 0.035})`);
    }

    if (snow) {
      // Heavy snow accumulation on the shoulders and outside margins
      for (const [x0, x1] of [[0, 115], [397, 512]]) {
        const g = ctx.createLinearGradient(x0, 0, x1, 0);
        const a = x0 === 0;
        g.addColorStop(0, a ? 'rgba(235,242,250,0.92)' : 'rgba(235,242,250,0)');
        g.addColorStop(0.7, a ? 'rgba(225,235,245,0.75)' : 'rgba(225,235,245,0.1)');
        g.addColorStop(1, a ? 'rgba(235,242,250,0)' : 'rgba(235,242,250,0.92)');
        ctx.fillStyle = g;
        ctx.fillRect(x0, 0, x1 - x0, H);
      }
      // Snow drifts and frost patches scattered outside the main racing groove
      for (let i = 0; i < 420; i++) {
        const x = rand() * W;
        // Less snow in the primary racing groove
        const inGroove = Math.abs(x - W * 0.5) < W * 0.18;
        if (inGroove && rand() > 0.15) continue;
        blob(ctx, W, H, x, rand() * H, 15 + rand() * 65, 20 + rand() * 95, `rgba(240,246,255,${0.25 + rand() * 0.45})`);
      }
    } else {
      // dusty shoulders where cars rarely run
      for (const [x0, x1] of [[0, 70], [442, 512]]) {
        const g = ctx.createLinearGradient(x0, 0, x1, 0);
        const a = x0 === 0;
        g.addColorStop(0, a ? 'rgba(150,150,150,0.14)' : 'rgba(150,150,150,0)');
        g.addColorStop(1, a ? 'rgba(150,150,150,0)' : 'rgba(150,150,150,0.14)');
        ctx.fillStyle = g;
        ctx.fillRect(x0, 0, x1 - x0, H);
      }
    }

    // rubbered-in lanes (cars clear snow or lay down rubber)
    for (const cx of [0.3, 0.7, 0.5]) {
      const w = cx === 0.5 ? 0.07 : 0.1;
      const g = ctx.createLinearGradient((cx - w) * W, 0, (cx + w) * W, 0);
      g.addColorStop(0, 'rgba(8,8,10,0)');
      g.addColorStop(0.5, `rgba(8,8,10,${cx === 0.5 ? (snow ? 0.35 : 0.12) : (snow ? 0.5 : 0.3)})`);
      g.addColorStop(1, 'rgba(8,8,10,0)');
      ctx.fillStyle = g;
      ctx.fillRect((cx - w) * W, 0, w * 2 * W, H);
    }
    // continuous white edge lines (3.5 units wide, 2.5 units in from the edge)
    ctx.fillStyle = 'rgba(236,236,230,1)';
    ctx.fillRect(10, 0, 14, H);
    ctx.fillRect(W - 24, 0, 14, H);
    const rc = grain(ctx, W, H, snow ? 18 : 26, rand, snow ? 150 : 188, 0.5);
    return { map: toTex(c), rough: toTex(rc, { srgb: false }) };
  });
}

export function getWetRough() {
  return cached('roadWet', () => {
    const W = 512, H = 2048;
    const rand = rng(21);
    const [c, ctx] = mk(W, H);
    // Base damp tarmac roughness
    ctx.fillStyle = '#656565';
    ctx.fillRect(0, 0, W, H);
    // Standing water puddles (very dark = mirror-smooth specular reflections)
    for (let i = 0; i < 160; i++) {
      const rx = 30 + rand() * 85;
      const ry = 60 + rand() * 240;
      blob(ctx, W, H, rand() * W, rand() * H, rx, ry, `rgba(8,8,8,${0.65 + rand() * 0.35})`);
    }
    return toTex(c, { srgb: false });
  });
}

/** 128 x 128 unit tile of plain tarmac (run-off, pit lane). */
export function getTarmac() {
  return cached('tarmac', () => {
    const S = 512;
    const rand = rng(31);
    const [c, ctx] = mk(S, S);
    ctx.fillStyle = '#4a4d52';
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 120; i++) blob(ctx, S, S, rand() * S, rand() * S, 20 + rand() * 90, 20 + rand() * 90, rand() < 0.5 ? `rgba(0,0,0,${0.05 + rand() * 0.06})` : `rgba(220,220,225,${0.03 + rand() * 0.04})`);
    const rc = grain(ctx, S, S, 28, rand, 205, 0.45);
    return { map: toTex(c), rough: toTex(rc, { srgb: false }) };
  });
}

// --- terrain ----------------------------------------------------------------
function grassBase(snow: boolean, stripes: boolean, seed: number) {
  const S = 512;
  const rand = rng(seed);
  const [c, ctx] = mk(S, S);
  const light = snow ? '#e6eef6' : '#4e8a34';
  const dark = snow ? '#d6e1ee' : '#3f7a2c';
  if (stripes) {
    for (let k = 0; k < 4; k++) {
      ctx.fillStyle = k % 2 ? dark : light;
      ctx.fillRect(k * (S / 4), 0, S / 4, S);
    }
  } else {
    ctx.fillStyle = snow ? '#dde7f1' : '#477f30';
    ctx.fillRect(0, 0, S, S);
  }
  for (let i = 0; i < 160; i++) blob(ctx, S, S, rand() * S, rand() * S, 25 + rand() * 80, 25 + rand() * 80, rand() < 0.5 ? (snow ? `rgba(160,180,205,${0.07})` : `rgba(20,50,10,${0.08})`) : (snow ? `rgba(255,255,255,0.09)` : `rgba(140,190,80,${0.07})`));
  // blades
  const greens = snow ? ['#f4f8fc', '#c7d5e6', '#e0e9f3'] : ['#5c9c3e', '#2f6a22', '#6aa84a', '#38752a', '#7ab257'];
  for (let i = 0; i < 52000; i++) {
    ctx.strokeStyle = greens[(rand() * greens.length) | 0];
    ctx.globalAlpha = 0.28 + rand() * 0.3;
    const x = rand() * S, y = rand() * S;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 2, y - 2 - rand() * 4);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  return c;
}
/** Mown grass with 4 stripes per 128-unit tile. */
export function getGrassStripes(snow: boolean) {
  return cached(`grassS${snow}`, () => toTex(grassBase(snow, true, 41)));
}
/** Plain grass for the big ground plane (tile repeated; macro variation hides it). */
export function getGrassPlain(snow: boolean) {
  return cached(`grassP${snow}`, () => toTex(grassBase(snow, false, 43)));
}

export function getGravel(snow: boolean) {
  return cached(`gravel${snow}`, () => {
    const S = 512;
    const rand = rng(51);
    const [c, ctx] = mk(S, S);
    ctx.fillStyle = snow ? '#c9d0d8' : '#b3a07c';
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 14000; i++) {
      const v = rand();
      ctx.fillStyle = snow
        ? `rgba(${150 + v * 100},${155 + v * 100},${165 + v * 90},0.7)`
        : `rgba(${110 + v * 120},${90 + v * 100},${60 + v * 80},0.75)`;
      const r = 0.8 + rand() * 1.8;
      ctx.fillRect(rand() * S, rand() * S, r, r);
    }
    for (let i = 0; i < 80; i++) blob(ctx, S, S, rand() * S, rand() * S, 30 + rand() * 60, 30 + rand() * 60, `rgba(60,45,25,${0.06})`);
    return toTex(c);
  });
}

/** Low-frequency luminance noise sampled in world space on the ground plane. */
export function getMacroNoise() {
  return cached('macro', () => {
    const S = 256;
    const rand = rng(61);
    const [c, ctx] = mk(S, S);
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 260; i++) {
      const v = (rand() * 255) | 0;
      blob(ctx, S, S, rand() * S, rand() * S, 10 + rand() * 60, 10 + rand() * 60, `rgba(${v},${v},${v},0.35)`);
    }
    return toTex(c, { srgb: false });
  });
}

// --- kerbs, walls, fences -----------------------------------------------------
/** Red/white kerb: u across (14 units), v along (40 units per red+white pair). */
export function getKerb(snow = false) {
  return cached(`kerb_${snow}`, () => {
    const W = 64, H = 128;
    const rand = rng(71);
    const [c, ctx] = mk(W, H);
    ctx.fillStyle = '#d3161c';
    ctx.fillRect(0, 0, W, H / 2);
    ctx.fillStyle = '#f3f3f0';
    ctx.fillRect(0, H / 2, W, H / 2);
    // darker raised edge at the outer side + soft highlight on crown
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.0)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 700; i++) {
      ctx.fillStyle = `rgba(0,0,0,${rand() * 0.12})`;
      ctx.fillRect(rand() * W, rand() * H, 2, 2);
    }
    if (snow) {
      // White snow crust along the outer kerb edge and ridges
      const sg = ctx.createLinearGradient(0, 0, W, 0);
      sg.addColorStop(0, 'rgba(240,245,255,0)');
      sg.addColorStop(0.6, 'rgba(240,245,255,0.4)');
      sg.addColorStop(1, 'rgba(245,250,255,0.9)');
      ctx.fillStyle = sg;
      ctx.fillRect(0, 0, W, H);
    }
    return toTex(c);
  });
}

export const SPONSORS = [
  { name: 'NOVAFUEL', bg: '#0a3d91', fg: '#ffd400' },
  { name: 'VOLTRIX', bg: '#e10600', fg: '#ffffff' },
  { name: 'ZEPHYR AIR', bg: '#f2f2f2', fg: '#0b2a5b' },
  { name: 'KALIX', bg: '#101418', fg: '#2de2c5' },
  { name: 'MERIDIAN', bg: '#f5a300', fg: '#14213d' },
  { name: 'ORBITA', bg: '#5b1fa8', fg: '#ffffff' },
  { name: 'TURBO-Q', bg: '#0e7a3a', fg: '#ffffff' },
  { name: 'HIMALAYA', bg: '#d9e6f2', fg: '#a3001d' },
];

/** 8 boards in a strip: each board is 512 x 128 px, 80 x 20 units. Strip = 640 units. */
export function getSponsorAtlas() {
  return cached('sponsors', () => {
    const BW = 512, BH = 128, n = SPONSORS.length;
    const [c, ctx] = mk(BW * n, BH);
    SPONSORS.forEach((s, i) => {
      const x = i * BW;
      ctx.fillStyle = s.bg;
      ctx.fillRect(x, 0, BW, BH);
      ctx.fillStyle = s.fg;
      ctx.globalAlpha = 0.18;
      for (let k = 0; k < 6; k++) {
        ctx.beginPath();
        ctx.moveTo(x + 340 + k * 40, 0);
        ctx.lineTo(x + 380 + k * 40, 0);
        ctx.lineTo(x + 330 + k * 40, BH);
        ctx.lineTo(x + 290 + k * 40, BH);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = s.fg;
      ctx.font = 'italic 900 70px "Arial Black", Impact, Arial, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(s.name, x + BW / 2, BH / 2 + 4, BW - 40);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x, BH - 8, BW, 8);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(x + BW - 3, 0, 3, BH);
    });
    return toTex(c, { aniso: 8 });
  });
}

/** Stacked-tyre barrier tile (u: 2 tyres across, v: tile 64 units). */
export function getTyreWall() {
  return cached('tyres', () => {
    const W = 256, H = 128;
    const rand = rng(81);
    const [c, ctx] = mk(W, H);
    ctx.fillStyle = '#0c0c0d';
    ctx.fillRect(0, 0, W, H);
    const rows = 2, cols = 4;
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        const cx = (k + 0.5 + (r % 2) * 0.0) * (W / cols);
        const cy = (r + 0.5) * (H / rows);
        const rad = H / rows / 2 - 2;
        const g = ctx.createRadialGradient(cx, cy, rad * 0.25, cx, cy, rad);
        g.addColorStop(0, '#000');
        g.addColorStop(0.35, '#050505');
        g.addColorStop(0.5, '#1d1d20');
        g.addColorStop(0.92, '#2c2c30');
        g.addColorStop(1, '#050505');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // coloured wrap band (white/blue/red) typical of TecPro
    const bands = ['#e8e8e8', '#1b4fa0', '#d3161c'];
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = bands[k];
      ctx.globalAlpha = 0.85;
      ctx.fillRect(0, H / 2 - 3 + (k - 1) * 0 , W, 0);
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 300; i++) {
      ctx.fillStyle = `rgba(255,255,255,${rand() * 0.05})`;
      ctx.fillRect(rand() * W, rand() * H, 2, 1);
    }
    return toTex(c);
  });
}

/** Diamond-mesh catch fence; alpha-only lattice, tile 40 x 40 units. */
export function getFence() {
  return cached('fence', () => {
    const S = 128;
    const [c, ctx] = mk(S, S);
    ctx.clearRect(0, 0, S, S);
    ctx.strokeStyle = 'rgba(60,66,76,1)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(S, S);
    ctx.moveTo(S, 0); ctx.lineTo(0, S);
    ctx.moveTo(-S / 2, S / 2); ctx.lineTo(S / 2, S * 1.5);
    ctx.moveTo(S / 2, -S / 2); ctx.lineTo(S * 1.5, S / 2);
    ctx.moveTo(S / 2, S * 1.5 - S); ctx.lineTo(S * 1.5, S / 2 + 0);
    ctx.moveTo(-S / 2, S / 2); ctx.lineTo(S / 2, -S / 2);
    ctx.moveTo(S / 2, S * 1.5); ctx.lineTo(S * 1.5, S / 2);
    ctx.stroke();
    return toTex(c);
  });
}

// --- crowd ------------------------------------------------------------------
/** Person sprite: R = body mask (tinted by instance colour), G = head mask, A = silhouette. */
export function getCrowdSprite() {
  return cached('crowd', () => {
    const W = 32, H = 64;
    const [c, ctx] = mk(W, H);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,0,0,1)';
    ctx.beginPath();
    ctx.roundRect(4, 24, 24, 40, 8);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,255,0,1)';
    ctx.beginPath();
    ctx.arc(16, 14, 9, 0, Math.PI * 2);
    ctx.fill();
    const t = toTex(c, { srgb: false, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
    t.premultiplyAlpha = false;
    return t;
  });
}

/** Radial glow for light pools / lamp halos. */
export function getGlow() {
  return cached('glow', () => {
    const S = 128;
    const [c, ctx] = mk(S, S);
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.45)');
    g.addColorStop(0.65, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
    return toTex(c, { wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
  });
}

/** Brake distance boards: 3 cells (300 / 200 / 100), each 128 x 192. */
export function getBrakeBoards() {
  return cached('brake', () => {
    const CW = 128, CH = 192;
    const [c, ctx] = mk(CW * 3, CH);
    ['300', '200', '100'].forEach((label, i) => {
      const x = i * CW;
      ctx.fillStyle = '#f6f6f2';
      ctx.fillRect(x, 0, CW, CH);
      ctx.fillStyle = '#d3161c';
      for (let k = 0; k < 3 - i; k++) {
        ctx.beginPath();
        ctx.moveTo(x + 10 + k * 30, 0);
        ctx.lineTo(x + 32 + k * 30, 0);
        ctx.lineTo(x + 8 + k * 30, 40);
        ctx.lineTo(x - 14 + k * 30, 40);
        ctx.fill();
      }
      ctx.fillStyle = '#111';
      ctx.font = '900 62px "Arial Black", Impact, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + CW / 2, CH * 0.66, CW - 12);
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 6;
      ctx.strokeRect(x + 3, 3, CW - 6, CH - 6);
    });
    return toTex(c, { wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
  });
}

/** Generic banner / screen with a title (gantry sign, big screens). */
export function getBanner(key: string, text: string, sub: string, w = 1024, h = 256, bg = '#0b0f16', fg = '#ffffff', accent = '#e10600') {
  return cached(`banner:${key}`, () => {
    const [c, ctx] = mk(w, h);
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, bg);
    g.addColorStop(1, '#17202e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = accent;
    ctx.fillRect(0, h - h * 0.1, w, h * 0.1);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `italic 900 ${h * 0.46}px "Arial Black", Impact, Arial, sans-serif`;
    ctx.fillText(text, w / 2, h * 0.4, w - 60);
    ctx.font = `700 ${h * 0.16}px Arial, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(sub, w / 2, h * 0.74, w - 60);
    return toTex(c, { wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
  });
}

/** Pit box outline (white rectangle on transparent). */
export function getPitBox() {
  return cached('pitbox', () => {
    const [c, ctx] = mk(64, 128);
    ctx.clearRect(0, 0, 64, 128);
    ctx.strokeStyle = '#f2f2f0';
    ctx.lineWidth = 6;
    ctx.strokeRect(5, 5, 54, 118);
    return toTex(c, { wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
  });
}

/** Tree cross-billboard texture (organic foliage canopy + trunk). */
export function getTreeTexture(snow = false) {
  return cached(`tree_${snow}`, () => {
    const W = 128, H = 256;
    const rand = rng(43);
    const [c, ctx] = mk(W, H);
    ctx.clearRect(0, 0, W, H);

    // Trunk
    ctx.fillStyle = '#302418';
    ctx.beginPath();
    ctx.moveTo(W * 0.44, H);
    ctx.lineTo(W * 0.56, H);
    ctx.lineTo(W * 0.53, H * 0.35);
    ctx.lineTo(W * 0.47, H * 0.35);
    ctx.closePath();
    ctx.fill();

    // Foliage canopy layers
    const layers = 5;
    for (let l = 0; l < layers; l++) {
      const y = H * (0.8 - l * 0.15);
      const radiusX = W * (0.42 - l * 0.05);
      const radiusY = H * (0.16 - l * 0.015);
      const baseCol = snow
        ? ['#688270', '#84a08c', '#a8c2b0', '#cce0d2', '#eaf2ec'][l]
        : ['#1c3818', '#244720', '#2f592a', '#3b6e34', '#498242'][l];

      ctx.fillStyle = baseCol;
      ctx.beginPath();
      ctx.ellipse(W * 0.5, y, radiusX, radiusY, 0, 0, Math.PI * 2);
      ctx.fill();

      // Organic cluster details
      for (let k = 0; k < 12; k++) {
        const ox = (rand() - 0.5) * radiusX * 1.5;
        const oy = (rand() - 0.5) * radiusY * 1.2;
        const rad = 10 + rand() * 14;
        ctx.fillStyle = baseCol;
        ctx.beginPath();
        ctx.arc(W * 0.5 + ox, y + oy, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    return toTex(c, { wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping });
  });
}

