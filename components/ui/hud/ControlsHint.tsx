'use client';

import React, { useEffect, useState } from 'react';
import { useGameStore } from '@/lib/game/store';
import { Key } from '../kit';

const DRIVE_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD']);
const HINT_MS = 6000;

/** One-off controls reminder at race start. Fades after ~6 s of racing or the first driving input. */
export function ControlsHint() {
  const phase = useGameStore((s) => s.phase);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const dismiss = () => setGone(true);
    const onKey = (e: KeyboardEvent) => {
      if (DRIVE_KEYS.has(e.code) && phase === 'racing') dismiss();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', dismiss, { once: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', dismiss);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== 'racing') return;
    const id = window.setTimeout(() => setGone(true), HINT_MS);
    return () => window.clearTimeout(id);
  }, [phase]);

  if (phase === 'finished') return null;

  return (
    <div className={`h-hint${gone ? ' gone' : ''}`} aria-hidden={gone}>
      <span className="desk">
        <Key>W</Key>
        <em>GAS</em>
        <Key>S</Key>
        <em>BRAKE</em>
        <Key>A</Key>
        <Key>D</Key>
        <em>STEER</em>
        <Key>SHIFT</Key>
        <em>ERS</em>
        <Key>F</Key>
        <em>DRS</em>
        <Key>ESC</Key>
        <em>PAUSE</em>
      </span>
      <span className="touch">LEFT SIDE STEERS · RIGHT SIDE BRAKE &amp; GAS</span>
    </div>
  );
}
