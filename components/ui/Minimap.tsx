'use client';

import React, { useEffect, useRef } from 'react';
import { track } from '@/lib/game/track';
import { useTicker } from '@/lib/game/useTicker';
import { world } from '@/lib/game/sim/world';

const W = 216;
const H = 150;
const PAD = 14;
const DPR = 2;
const SECTOR_COLORS = ['#ffb800', '#b36bff', '#00e5ff'];

function bounds() {
  const { minX: a, maxX: b, minY: c, maxY: d } = track.current.bounds;
  const s = Math.min((W - PAD * 2) / (b - a), (H - PAD * 2) / (d - c));
  return { s, ox: W / 2 - ((a + b) / 2) * s, oy: H / 2 - ((c + d) / 2) * s };
}
// Projection of the active track; refreshed by drawStatic() whenever the track is (re)drawn.
let B = bounds();
const px = (x: number) => x * B.s + B.ox;
const py = (y: number) => y * B.s + B.oy;

/** Track casing + sector-coloured line, drawn once. */
function drawStatic(): HTMLCanvasElement {
  const T = track.current;
  const N = T.N;
  B = bounds();
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
      const k = i % N;
      if (i === from) ctx.moveTo(px(T.px[k]), py(T.py[k]));
      else ctx.lineTo(px(T.px[k]), py(T.py[k]));
    }
  };

  path(0, N);
  ctx.closePath();
  ctx.strokeStyle = '#05070b';
  ctx.lineWidth = 8;
  ctx.stroke();

  const [s1, s2] = T.sectorIdx;
  [[0, s1], [s1, s2], [s2, N]].forEach(([a, b], k) => {
    path(a, b);
    ctx.strokeStyle = SECTOR_COLORS[k];
    ctx.lineWidth = 3;
    ctx.stroke();
  });

  // pit lane
  ctx.beginPath();
  const pitCount = (T.pit.exitIdx - T.pit.entryIdx + N) % N;
  for (let k = 0; k <= pitCount; k += 3) {
    const j = (T.pit.entryIdx + k) % N;
    if (k === 0) ctx.moveTo(px(T.px[j]), py(T.py[j]));
    else ctx.lineTo(px(T.px[j]), py(T.py[j]));
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);
  ctx.stroke();
  ctx.setLineDash([]);

  // start / finish tick
  ctx.fillStyle = '#fff';
  ctx.fillRect(px(T.px[0]) - 1, py(T.py[0]) - 5, 2, 10);
  return cv;
}

/** Bottom-left radar: static track, live car dots. */
export function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null);
  const base = useRef<HTMLCanvasElement | null>(null);

  const trackId = track.current.meta.id;
  useEffect(() => {
    base.current = drawStatic();
  }, [trackId]);

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
