'use client';

import React, { useEffect, useRef } from 'react';
import { N, PIT_LANE, SECTOR_BOUNDS, trackSplinePoints } from '@/lib/game/constants';
import { useTicker } from '@/lib/game/useTicker';
import { world } from '@/lib/game/sim/world';

const W = 320;
const H = 215;
const PAD = 16;
const DPR = 2;
const SECTOR_COLORS = ['#ffb800', '#b36bff', '#00e5ff'];

function bounds() {
  let a = 1e9, b = -1e9, c = 1e9, d = -1e9;
  for (const p of trackSplinePoints) {
    a = Math.min(a, p[0]); b = Math.max(b, p[0]);
    c = Math.min(c, p[1]); d = Math.max(d, p[1]);
  }
  const s = Math.min((W - PAD * 2) / (b - a), (H - PAD * 2) / (d - c));
  return { s, ox: W / 2 - ((a + b) / 2) * s, oy: H / 2 - ((c + d) / 2) * s };
}
const B = bounds();
const px = (x: number) => x * B.s + B.ox;
const py = (y: number) => y * B.s + B.oy;

/** Track casing + sector-coloured line, drawn once. */
function drawStatic(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = W * DPR;
  cv.height = H * DPR;
  const ctx = cv.getContext('2d')!;
  ctx.scale(DPR, DPR);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const path = (from: number, to: number) => {
    ctx.beginPath();
    for (let i = from; i <= to; i += 2) {
      const p = trackSplinePoints[i % N];
      if (i === from) ctx.moveTo(px(p[0]), py(p[1]));
      else ctx.lineTo(px(p[0]), py(p[1]));
    }
  };

  // Outer border / highlight for high visibility against dark backgrounds
  path(0, N);
  ctx.closePath();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.lineWidth = 11;
  ctx.stroke();

  // Dark asphalt track bed
  path(0, N);
  ctx.closePath();
  ctx.strokeStyle = '#12151c';
  ctx.lineWidth = 8.5;
  ctx.stroke();

  // Sectors in vibrant F1 broadcast neon colors
  const [s1, s2] = SECTOR_BOUNDS;
  [[0, s1], [s1, s2], [s2, N]].forEach(([a, b], k) => {
    path(a, b);
    ctx.strokeStyle = SECTOR_COLORS[k];
    ctx.lineWidth = 4.2;
    ctx.stroke();
  });

  // Pit lane
  ctx.beginPath();
  const pitCount = (PIT_LANE.exitIdx - PIT_LANE.entryIdx + N) % N;
  for (let k = 0; k <= pitCount; k += 3) {
    const p = trackSplinePoints[(PIT_LANE.entryIdx + k) % N];
    if (k === 0) ctx.moveTo(px(p[0]), py(p[1]));
    else ctx.lineTo(px(p[0]), py(p[1]));
  }
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.lineWidth = 2;
  ctx.setLineDash([3, 3]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Start / finish tick perpendicular to the track
  const p0 = trackSplinePoints[0];
  const p1 = trackSplinePoints[1];
  const dx = px(p1[0]) - px(p0[0]);
  const dy = py(p1[1]) - py(p0[1]);
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  ctx.beginPath();
  ctx.moveTo(px(p0[0]) - nx * 7, py(p0[1]) - ny * 7);
  ctx.lineTo(px(p0[0]) + nx * 7, py(p0[1]) + ny * 7);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.stroke();

  return cv;
}

/** Bottom-left radar: static track, live car dots. */
export function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null);
  const base = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    base.current = drawStatic();
  }, []);

  useTicker(() => {
    const cv = ref.current;
    const bg = base.current;
    if (!cv || !bg) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(bg, 0, 0, W, H);

    // AI & competitor cars
    for (const car of world.cars) {
      if (car.isPlayer) continue;
      const cx = px(car.phys.x);
      const cy = py(car.phys.y);
      ctx.beginPath();
      ctx.arc(cx, cy, car.inPit ? 3.2 : 4.6, 0, Math.PI * 2);
      ctx.fillStyle = car.driver.livery.body;
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = '#05070b';
      ctx.stroke();
    }

    // Player car with glowing halo for instant recognition
    const me = world.player.phys;
    const mx = px(me.x);
    const my = py(me.y);

    ctx.beginPath();
    ctx.arc(mx, my, 9.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(200, 255, 46, 0.35)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(mx, my, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#c8ff2e';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#000000';
    ctx.stroke();
  });

  return (
    <div className="h-root">
      <div className="h-minimap" aria-label="Track Minimap">
        <div className="h-minimap-head">
          <span className="h-minimap-name">BUDDH INTL CIRCUIT</span>
          <div className="h-minimap-sec">
            <span style={{ color: SECTOR_COLORS[0] }}>S1</span>
            <span style={{ color: SECTOR_COLORS[1] }}>S2</span>
            <span style={{ color: SECTOR_COLORS[2] }}>S3</span>
          </div>
        </div>
        <canvas ref={ref} width={W * DPR} height={H * DPR} style={{ width: W, height: H }} />
      </div>
    </div>
  );
}
