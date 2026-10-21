'use client';

import React, { useEffect, useRef } from 'react';
import { N, PIT_LANE, SECTOR_BOUNDS, trackSplinePoints } from '@/lib/game/constants';
import { useTicker } from '@/lib/game/useTicker';
import { world } from '@/lib/game/sim/world';

const W = 216;
const H = 150;
const PAD = 14;
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

  path(0, N);
  ctx.closePath();
  ctx.strokeStyle = '#05070b';
  ctx.lineWidth = 8;
  ctx.stroke();

  const [s1, s2] = SECTOR_BOUNDS;
  [[0, s1], [s1, s2], [s2, N]].forEach(([a, b], k) => {
    path(a, b);
    ctx.strokeStyle = SECTOR_COLORS[k];
    ctx.lineWidth = 3;
    ctx.stroke();
  });

  // pit lane
  ctx.beginPath();
  const pitCount = (PIT_LANE.exitIdx - PIT_LANE.entryIdx + N) % N;
  for (let k = 0; k <= pitCount; k += 3) {
    const p = trackSplinePoints[(PIT_LANE.entryIdx + k) % N];
    if (k === 0) ctx.moveTo(px(p[0]), py(p[1]));
    else ctx.lineTo(px(p[0]), py(p[1]));
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);
  ctx.stroke();
  ctx.setLineDash([]);

  // start / finish tick
  const p0 = trackSplinePoints[0];
  ctx.fillStyle = '#fff';
  ctx.fillRect(px(p0[0]) - 1, py(p0[1]) - 5, 2, 10);
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

    for (const car of world.cars) {
      if (car.isPlayer) continue;
      ctx.beginPath();
      ctx.arc(px(car.phys.x), py(car.phys.y), car.inPit ? 2.4 : 3.6, 0, Math.PI * 2);
      ctx.fillStyle = car.driver.livery.body;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#05070b';
      ctx.stroke();
    }
    const me = world.player.phys;
    ctx.beginPath();
    ctx.arc(px(me.x), py(me.y), 5.4, 0, Math.PI * 2);
    ctx.fillStyle = '#c8ff2e';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#000';
    ctx.stroke();
  });

  return (
    <div className="h-root">
      <div className="h-minimap" aria-hidden="true">
        <canvas ref={ref} width={W * DPR} height={H * DPR} style={{ width: W, height: H }} />
      </div>
    </div>
  );
}
