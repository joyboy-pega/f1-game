import * as THREE from 'three';
import type { Livery } from '@/lib/game/constants';

// ---------------------------------------------------------------------------
// COLOR & CONTRAST HELPERS
// ---------------------------------------------------------------------------

function luminance(hex: string): number {
  try {
    const c = new THREE.Color(hex);
    return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  } catch (err) {
    console.debug('Invalid color string in luminance calculation', hex, err);
    return 0.5;
  }
}

function contrastInk(bg: string): string {
  return luminance(bg) > 0.4 ? '#090a0f' : '#f8fafc';
}

function secondaryInk(bg: string): string {
  return luminance(bg) > 0.4 ? '#1f2937' : '#e2e8f0';
}

// ---------------------------------------------------------------------------
// PROCEDURAL TEXTURE GENERATORS (CACHED PER LIVERY CONFIGURATION)
// ---------------------------------------------------------------------------

function drawPegasusSilhouette(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = color;

  // Muscular Horse Body & Rear
  ctx.beginPath();
  ctx.moveTo(-28, 8);
  ctx.quadraticCurveTo(-8, 2, 14, -4);
  ctx.quadraticCurveTo(28, -14, 34, -26); // Neck up
  ctx.lineTo(46, -22); // Snout
  ctx.lineTo(42, -16); // Jaw
  ctx.lineTo(33, -16);
  ctx.quadraticCurveTo(28, -2, 22, 10); // Chest
  // Front legs lunging forward
  ctx.lineTo(38, 24);
  ctx.lineTo(45, 22);
  ctx.lineTo(35, 28);
  ctx.lineTo(18, 15);
  ctx.lineTo(22, 32);
  ctx.lineTo(17, 34);
  ctx.lineTo(12, 14);
  // Belly
  ctx.quadraticCurveTo(-4, 16, -18, 14);
  // Hind legs kicking back
  ctx.lineTo(-34, 34);
  ctx.lineTo(-39, 32);
  ctx.lineTo(-27, 14);
  ctx.lineTo(-42, 24);
  ctx.lineTo(-46, 20);
  ctx.lineTo(-28, 8);
  ctx.closePath();
  ctx.fill();

  // Flowing Tail
  ctx.beginPath();
  ctx.moveTo(-27, 9);
  ctx.quadraticCurveTo(-48, 2, -62, 16);
  ctx.quadraticCurveTo(-46, 15, -28, 13);
  ctx.fill();

  // Majestic Feathered Wings Sweeping Up & Back
  ctx.beginPath();
  ctx.moveTo(8, -2);
  ctx.quadraticCurveTo(-5, -36, -38, -55);
  ctx.lineTo(-22, -40);
  ctx.lineTo(-44, -42);
  ctx.lineTo(-20, -30);
  ctx.lineTo(-42, -29);
  ctx.lineTo(-16, -20);
  ctx.lineTo(-34, -18);
  ctx.quadraticCurveTo(-12, -8, 12, 2);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

const noseTexCache = new Map<string, THREE.Texture>();
const sidepodTexCache = new Map<string, THREE.Texture>();
const helmetTexCache = new Map<string, THREE.Texture>();
let cachedCarbonTex: THREE.Texture | null = null;

export function getPegasusNoseConeTexture(livery: Livery, driverCode = 'PEG'): THREE.Texture {
  const body = livery.body || '#f8fafc';
  const accent = livery.accent || '#dc2626';
  const num = String(livery.number || 53);
  const key = `${body}_${accent}_${num}_${driverCode}`;

  const hit = noseTexCache.get(key);
  if (hit) return hit;
  if (typeof document === 'undefined') return new THREE.Texture();

  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 2048;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  const ink = contrastInk(body);
  const secInk = secondaryInk(body);

  // Base coat
  ctx.fillStyle = body;
  ctx.fillRect(0, 0, 2048, 2048);

  function drawSideGraphics(isRightSide: boolean) {
    if (!ctx) return;
    ctx.save();
    if (!isRightSide) {
      ctx.translate(0, 2048);
      ctx.scale(1, -1);
    }

    // Upper accent stripe curving around the nose tip
    ctx.beginPath();
    ctx.moveTo(180, 560);
    ctx.bezierCurveTo(850, 590, 1550, 540, 1930, 240);
    ctx.lineTo(1860, 140);
    ctx.bezierCurveTo(1500, 440, 820, 510, 180, 510);
    ctx.closePath();
    ctx.fillStyle = accent;
    ctx.fill();

    // Bold ink curve framing the side panel
    ctx.beginPath();
    ctx.moveTo(180, 195);
    ctx.bezierCurveTo(950, 150, 1520, 140, 1850, 195);
    ctx.bezierCurveTo(1640, 390, 1300, 460, 180, 495);
    ctx.lineTo(180, 435);
    ctx.bezierCurveTo(1180, 410, 1480, 355, 1690, 235);
    ctx.bezierCurveTo(1380, 215, 850, 225, 180, 255);
    ctx.closePath();
    ctx.fillStyle = ink;
    ctx.fill();

    // Lower accent along the chin
    ctx.beginPath();
    ctx.moveTo(180, 155);
    ctx.quadraticCurveTo(950, 115, 1820, 165);
    ctx.lineTo(1850, 195);
    ctx.quadraticCurveTo(950, 150, 180, 195);
    ctx.closePath();
    ctx.fillStyle = accent;
    ctx.fill();

    ctx.restore();
  }

  drawSideGraphics(true);
  drawSideGraphics(false);

  // Right Side Logos & Text
  ctx.save();
  ctx.translate(650, 350);
  ctx.scale(1, -1);

  ctx.fillStyle = secInk;
  ctx.font = 'bold 28px "Chakra Petch", "Archivo", sans-serif';
  ctx.fillText('FORMULA TEAM', -220, -78);

  ctx.font = 'italic bold 64px "Chakra Petch", "Archivo", sans-serif';
  ctx.fillStyle = ink;
  ctx.fillText('P', -220, -20);
  ctx.fillStyle = accent;
  ctx.fillText('E', -175, -20);
  ctx.fillStyle = ink;
  ctx.fillText('GASUS', -130, -20);

  // Wing flame icon above Pegasus
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(45, -75);
  ctx.quadraticCurveTo(65, -95, 55, -55);
  ctx.quadraticCurveTo(40, -65, 45, -75);
  ctx.fill();

  // SAE INDIA Badge
  ctx.fillStyle = accent;
  ctx.fillRect(-130, 25, 95, 42);
  ctx.fillStyle = '#1e3a8a';
  ctx.fillRect(-35, 25, 105, 42);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px "Chakra Petch", sans-serif';
  ctx.fillText('SAE', -118, 56);
  ctx.fillText('INDIA', -25, 56);

  ctx.fillStyle = secInk;
  ctx.font = 'bold 24px "Chakra Petch", sans-serif';
  ctx.fillText('FORMULA STUDENT', -150, 105);

  drawPegasusSilhouette(ctx, 430, 35, 2.55, ink);

  ctx.fillStyle = secInk;
  ctx.font = 'bold 22px "Chakra Petch", sans-serif';
  ctx.fillText(`⚙ ${driverCode}   BOSCH   MOTUL`, -430, -45);

  ctx.restore();

  // Left Side Logos (mirrored)
  ctx.save();
  ctx.translate(650, 2048 - 350);
  ctx.fillStyle = secInk;
  ctx.font = 'bold 28px "Chakra Petch", "Archivo", sans-serif';
  ctx.fillText('FORMULA TEAM', -220, -78);
  ctx.font = 'italic bold 64px "Chakra Petch", "Archivo", sans-serif';
  ctx.fillStyle = ink;
  ctx.fillText('P', -220, -20);
  ctx.fillStyle = accent;
  ctx.fillText('E', -175, -20);
  ctx.fillStyle = ink;
  ctx.fillText('GASUS', -130, -20);
  ctx.fillStyle = accent;
  ctx.fillRect(-130, 25, 95, 42);
  ctx.fillStyle = '#1e3a8a';
  ctx.fillRect(-35, 25, 105, 42);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px "Chakra Petch", sans-serif';
  ctx.fillText('SAE INDIA', -118, 56);
  ctx.fillStyle = secInk;
  ctx.font = 'bold 24px "Chakra Petch", sans-serif';
  ctx.fillText('FORMULA STUDENT', -150, 105);
  drawPegasusSilhouette(ctx, 430, 35, 2.55, ink);
  ctx.restore();

  // Top Hood Circle with customizable number
  ctx.save();
  ctx.translate(1080, 1024);
  ctx.rotate(-Math.PI / 2);
  ctx.beginPath();
  ctx.arc(0, 0, 155, 0, Math.PI * 2);
  const roundelBg = luminance(body) > 0.4 ? '#ffffff' : '#18181b';
  ctx.fillStyle = roundelBg;
  ctx.fill();
  ctx.lineWidth = 14;
  ctx.strokeStyle = accent;
  ctx.stroke();

  ctx.fillStyle = contrastInk(roundelBg);
  const numFontSize = num.length > 2 ? 140 : 170;
  ctx.font = `bold ${numFontSize}px "Chakra Petch", "Archivo", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(num, 0, 8);
  ctx.restore();

  // Front nose tip decal
  ctx.save();
  ctx.translate(1680, 1024);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = accent;
  ctx.fillRect(-90, -35, 180, 70);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 36px "Chakra Petch", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SAE INDIA', 0, 12);
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  noseTexCache.set(key, tex);
  return tex;
}

export function getPegasusSidepodTexture(livery: Livery): THREE.Texture {
  const body = livery.body || '#f8fafc';
  const accent = livery.accent || '#dc2626';
  const num = String(livery.number || 53);
  const key = `${body}_${accent}_${num}`;

  const hit = sidepodTexCache.get(key);
  if (hit) return hit;
  if (typeof document === 'undefined') return new THREE.Texture();

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  const ink = contrastInk(body);

  // Base coat
  ctx.fillStyle = body;
  ctx.fillRect(0, 0, 1024, 512);

  // Accent diagonal slash
  ctx.beginPath();
  ctx.moveTo(490, 512);
  ctx.lineTo(860, 45);
  ctx.lineTo(750, 45);
  ctx.lineTo(395, 512);
  ctx.closePath();
  ctx.fillStyle = accent;
  ctx.fill();

  // Ink diagonal slash
  ctx.beginPath();
  ctx.moveTo(590, 512);
  ctx.lineTo(910, 80);
  ctx.lineTo(830, 80);
  ctx.lineTo(500, 512);
  ctx.closePath();
  ctx.fillStyle = ink;
  ctx.fill();

  // Roundel Circle
  ctx.beginPath();
  ctx.arc(360, 275, 175, 0, Math.PI * 2);
  ctx.fillStyle = ink;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = accent;
  ctx.stroke();

  // Bold number inside circle
  ctx.fillStyle = contrastInk(ink);
  const numSize = num.length > 2 ? 170 : 215;
  ctx.font = `bold ${numSize}px "Chakra Petch", "Archivo", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(num, 358, 288);

  // Tech stickers
  ctx.fillStyle = accent;
  ctx.fillRect(65, 220, 75, 36);
  ctx.fillStyle = ink;
  ctx.fillRect(55, 340, 115, 38);
  ctx.fillStyle = contrastInk(ink);
  ctx.font = 'bold 20px "Chakra Petch", sans-serif';
  ctx.fillText('TECH OK', 112, 365);

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 8;
  sidepodTexCache.set(key, tex);
  return tex;
}

export function getPegasusHelmetTexture(livery: Livery): THREE.Texture {
  const body = livery.body || '#f8fafc';
  const accent = livery.accent || '#dc2626';
  const key = `${body}_${accent}`;

  const hit = helmetTexCache.get(key);
  if (hit) return hit;
  if (typeof document === 'undefined') return new THREE.Texture();

  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  const ink = contrastInk(body);

  ctx.fillStyle = body;
  ctx.fillRect(0, 0, 1024, 512);

  // Accent & Ink racing swooshes
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(0, 360);
  ctx.quadraticCurveTo(350, 240, 1024, 390);
  ctx.lineTo(1024, 460);
  ctx.quadraticCurveTo(350, 320, 0, 440);
  ctx.fill();

  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.moveTo(0, 140);
  ctx.quadraticCurveTo(480, 290, 1024, 130);
  ctx.lineTo(1024, 220);
  ctx.quadraticCurveTo(480, 370, 0, 220);
  ctx.fill();

  // Crown stripes
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(120, 80);
  ctx.quadraticCurveTo(512, 210, 900, 80);
  ctx.lineTo(850, 40);
  ctx.quadraticCurveTo(512, 160, 170, 40);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  helmetTexCache.set(key, tex);
  return tex;
}

export function getCarbonTexture(): THREE.Texture {
  if (cachedCarbonTex) return cachedCarbonTex;
  if (typeof document === 'undefined') return new THREE.Texture();

  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  ctx.fillStyle = '#18181b';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#27272a';
  for (let y = 0; y < 64; y += 8) {
    for (let x = 0; x < 64; x += 8) {
      if ((x + y) % 16 === 0) {
        ctx.fillRect(x, y, 4, 8);
      } else {
        ctx.fillRect(x + 4, y, 4, 8);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 8);
  cachedCarbonTex = tex;
  return tex;
}

// ---------------------------------------------------------------------------
// GEOMETRY GENERATORS (MATCHING GAME COORDINATE SYSTEM: +Z nose, +X left, +Y up)
// ---------------------------------------------------------------------------

export const toGamePt = ([xu, yu, zu]: [number, number, number]): [number, number, number] => [-zu, yu, xu];

export function buildSculptedNoseCone(): THREE.BufferGeometry {
  const lengthSegs = 64;
  const radialSegs = 48;
  const geom = new THREE.BufferGeometry();
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const zStart = 0.26; // Cockpit bulkhead
  const zEnd = 1.88;   // Front tip

  for (let i = 0; i <= lengthSegs; i++) {
    const u = i / lengthSegs;
    const z = zStart + u * (zEnd - zStart);

    const yTop = 0.62 * Math.pow(1 - u, 0.62) + 0.23 * u + 0.04 * Math.sin(u * Math.PI);
    const yBot = 0.08 + 0.13 * Math.pow(u, 1.55);
    const halfWidth = 0.33 * Math.pow(1 - u * 0.96, 0.52) + 0.015;

    const yCenter = (yTop + yBot) * 0.5;
    const yHalf = (yTop - yBot) * 0.5;

    for (let j = 0; j <= radialSegs; j++) {
      const v = j / radialSegs;
      const angle = (v - 0.5) * Math.PI * 2;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      const signLat = Math.sign(sinA);
      const signY = Math.sign(cosA);
      const x = -signLat * Math.pow(Math.abs(sinA), 0.78) * halfWidth;
      let y = yCenter + signY * Math.pow(Math.abs(cosA), 0.82) * yHalf;

      if (cosA < -0.5) {
        y = Math.max(yBot, y);
      }

      positions.push(x, y, z);
      uvs.push(u, v);
    }
  }

  for (let i = 0; i < lengthSegs; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * (radialSegs + 1) + j;
      const b = (i + 1) * (radialSegs + 1) + j;
      const c = (i + 1) * (radialSegs + 1) + (j + 1);
      const d = i * (radialSegs + 1) + (j + 1);
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

export function createTubeGeometry(p1: [number, number, number], p2: [number, number, number], radius: number): { geometry: THREE.BufferGeometry; position: [number, number, number]; quaternion: THREE.Quaternion } {
  const v1 = new THREE.Vector3(...p1);
  const v2 = new THREE.Vector3(...p2);
  const dir = new THREE.Vector3().subVectors(v2, v1);
  const len = dir.length();
  const geometry = new THREE.CylinderGeometry(radius, radius, len, 10);
  const position: [number, number, number] = [
    (v1.x + v2.x) * 0.5,
    (v1.y + v2.y) * 0.5,
    (v1.z + v2.z) * 0.5,
  ];
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  return { geometry, position, quaternion };
}

export function createHelicalSpringGeometry(radius: number, height: number, turns: number, wireRadius: number): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [];
  const steps = turns * 20;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = t * turns * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, (t - 0.5) * height, Math.sin(angle) * radius));
  }
  const curve = new THREE.CatmullRomCurve3(points);
  return new THREE.TubeGeometry(curve, steps, wireRadius, 6, false);
}

// Custom 6-Spoke Rim in unit frame with customizable rim & accent colors
const rimGeoCache = new Map<string, THREE.BufferGeometry>();

export function getPegasusRimGeometry(rimColorHex = '#9a6b26', accentColorHex = '#d91b24'): THREE.BufferGeometry {
  const key = `${rimColorHex}_${accentColorHex}`;
  const hit = rimGeoCache.get(key);
  if (hit) return hit;

  const geometries: THREE.BufferGeometry[] = [];
  const rim = new THREE.Color(rimColorHex);
  const accent = new THREE.Color(accentColorHex);
  const silver = new THREE.Color('#e4e4e7');
  const discCol = new THREE.Color('#5b5d63');

  function tag(geo: THREE.BufferGeometry, col: THREE.Color, glow = false) {
    const nonIndexed = geo.index ? geo.toNonIndexed() : geo;
    const count = nonIndexed.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    const uvs = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
      uvs[i * 2] = glow ? 0.9 : 0.1;
      uvs[i * 2 + 1] = glow ? 0.9 : 0.1;
    }
    nonIndexed.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    nonIndexed.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometries.push(nonIndexed);
  }

  // 1. Deep-dish rim barrel & outer lip
  const barrel = new THREE.CylinderGeometry(0.68, 0.65, 0.76, 24, 1, true);
  barrel.rotateZ(-Math.PI / 2);
  tag(barrel, rim);

  const lip = new THREE.TorusGeometry(0.67, 0.04, 10, 24);
  lip.rotateY(Math.PI / 2);
  lip.translate(0.38, 0, 0);
  tag(lip, rim);

  // 2. 6 Spokes
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const spoke = new THREE.BoxGeometry(0.06, 0.62, 0.07);
    spoke.translate(0.24, 0.31, 0);
    spoke.rotateX(angle);
    tag(spoke, rim);
  }

  // 3. Center-lock hub plate (accent color)
  const hub = new THREE.CylinderGeometry(0.26, 0.28, 0.12, 18);
  hub.rotateZ(-Math.PI / 2);
  hub.translate(0.28, 0, 0);
  tag(hub, accent);

  const nut = new THREE.CylinderGeometry(0.12, 0.14, 0.14, 12);
  nut.rotateZ(-Math.PI / 2);
  nut.translate(0.35, 0, 0);
  tag(nut, accent);

  // 4. Lug bolts
  for (let b = 0; b < 6; b++) {
    const bAngle = (b / 6) * Math.PI * 2 + 0.25;
    const bolt = new THREE.CylinderGeometry(0.025, 0.025, 0.08, 8);
    bolt.rotateZ(-Math.PI / 2);
    bolt.translate(0.33, Math.sin(bAngle) * 0.19, Math.cos(bAngle) * 0.19);
    tag(bolt, silver);
  }

  // 5. Brake rotor disc (glow enabled)
  const disc = new THREE.CylinderGeometry(0.55, 0.55, 0.04, 24);
  disc.rotateZ(-Math.PI / 2);
  disc.translate(-0.05, 0, 0);
  tag(disc, discCol, true);

  // Merge into single buffer geometry
  const totalCount = geometries.reduce((acc, g) => acc + g.getAttribute('position').count, 0);
  const posArr = new Float32Array(totalCount * 3);
  const colArr = new Float32Array(totalCount * 3);
  const uvArr = new Float32Array(totalCount * 2);

  let offset = 0;
  for (const g of geometries) {
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    const c = g.getAttribute('color') as THREE.BufferAttribute;
    const u = g.getAttribute('uv') as THREE.BufferAttribute;
    posArr.set(p.array, offset * 3);
    colArr.set(c.array, offset * 3);
    uvArr.set(u.array, offset * 2);
    offset += p.count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  merged.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
  merged.computeVertexNormals();

  rimGeoCache.set(key, merged);
  return merged;
}
