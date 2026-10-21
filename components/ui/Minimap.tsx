'use client';

import React, { useRef, useEffect } from 'react';
import { N, trackSplinePoints, minimapBounds, DRS_CONFIG } from '@/lib/game/constants';
import { isCarInDrsZone } from '@/lib/game/physics';
import { useRefreshRate } from '@/lib/game/useTicker';
import { world } from '@/lib/game/sim/world';

export function Minimap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useRefreshRate(4);
  const carState = world.player.phys;

  useEffect(() => {
    let animId: number;

    const render = () => {
      const cv = canvasRef.current;
      if (!cv) return;
      const ctx = cv.getContext('2d');
      if (!ctx) return;

      const { s, ox, oy, w, h } = minimapBounds;

      ctx.save();
      ctx.setTransform(2, 0, 0, 2, 0, 0);
      ctx.clearRect(0, 0, w, h);

      ctx.fillStyle = 'rgba(12, 16, 23, 0.65)';
      ctx.fillRect(0, 0, w, h);

      // Track Casing
      ctx.beginPath();
      for (let i = 0; i < N; i += 3) {
        const X = trackSplinePoints[i][0] * s + ox;
        const Y = trackSplinePoints[i][1] * s + oy;
        if (i === 0) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
      }
      ctx.closePath();
      ctx.strokeStyle = '#080c14';
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Sector 1: Gold (#ffb800)
      ctx.beginPath();
      for (let i = 0; i <= 280; i += 2) {
        const X = trackSplinePoints[i][0] * s + ox;
        const Y = trackSplinePoints[i][1] * s + oy;
        if (i === 0) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
      }
      ctx.strokeStyle = '#ffb800';
      ctx.lineWidth = 3.5;
      ctx.stroke();

      // Sector 2: Purple (#b56cff)
      ctx.beginPath();
      for (let i = 280; i <= 1130; i += 2) {
        const X = trackSplinePoints[i][0] * s + ox;
        const Y = trackSplinePoints[i][1] * s + oy;
        if (i === 280) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
      }
      ctx.strokeStyle = '#b56cff';
      ctx.lineWidth = 3.5;
      ctx.stroke();

      // Sector 3: Cyan (#00e5ff)
      ctx.beginPath();
      for (let i = 1130; i < N; i += 2) {
        const X = trackSplinePoints[i][0] * s + ox;
        const Y = trackSplinePoints[i][1] * s + oy;
        if (i === 1130) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
      }
      ctx.lineTo(trackSplinePoints[0][0] * s + ox, trackSplinePoints[0][1] * s + oy);
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 3.5;
      ctx.stroke();

      // AI Rival Dots
      const player = world.player.phys;
      world.cars.forEach((c) => {
        if (c.isPlayer) return;
        const ax = c.phys.x * s + ox;
        const ay = c.phys.y * s + oy;
        ctx.beginPath();
        ctx.arc(ax, ay, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = c.driver.livery.body;
        ctx.fill();
        ctx.strokeStyle = '#080c14';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      });

      // Player Car Dot (Neon Lime with border)
      const px = player.x * s + ox;
      const py = player.y * s + oy;
      ctx.beginPath();
      ctx.arc(px, py, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = '#C8FF2E';
      ctx.fill();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2.2;
      ctx.stroke();

      ctx.restore();
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, []);

  const inDrs = isCarInDrsZone(carState.idx);
  const curIdx = carState.idx;
  const isS1 = curIdx <= 280;
  const isS2 = curIdx > 280 && curIdx <= 1130;
  const isS3 = curIdx > 1130;

  const turnMap = [
    { name: 'TURN 1', idx: 122 },
    { name: 'TURN 3', idx: 263 },
    { name: '1.1KM BACK STRAIGHT', idx: 500 },
    { name: 'TURN 4', idx: 755 },
    { name: 'TURN 6', idx: 957 },
    { name: 'TURN 10-11', idx: 1280 },
    { name: 'PARABOLICA', idx: 1650 },
    { name: 'MAIN STRAIGHT', idx: 1880 },
  ];
  let currentTurn = 'MAIN STRAIGHT';
  for (const t of turnMap) {
    if (Math.abs(curIdx - t.idx) < 140) {
      currentTurn = t.name;
      break;
    }
  }

  return (
    <div className="hud hidden sm:flex" id="mini" title="Formula V GPS Minimap Radar">
      <div id="mini-header">
        <div className="mini-title-wrap">
          <span className="f1-pill">F1</span>
          <span className="mini-name">BUDDH GP</span>
        </div>
        <div className="mini-sectors">
          <span className={`sec-badge ${isS1 ? 'active-s1' : ''}`} id="sec-1">
            S1
          </span>
          <span className={`sec-badge ${isS2 ? 'active-s2' : ''}`} id="sec-2">
            S2
          </span>
          <span className={`sec-badge ${isS3 ? 'active-s3' : ''}`} id="sec-3">
            S3
          </span>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        id="m"
        width={660}
        height={430}
        style={{ width: '330px', height: '215px' }}
      />

      <div id="mini-footer">
        <span id="mini-turn">{currentTurn}</span>
        <span className={`mini-drs-tag ${inDrs ? 'active' : ''}`} id="mini-drs">
          {inDrs ? 'DRS ZONE' : 'NO DRS'}
        </span>
      </div>
    </div>
  );
}
