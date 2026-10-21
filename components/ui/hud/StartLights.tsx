'use client';

import React from 'react';
import { useGameStore } from '@/lib/game/store';

const COLS = [1, 2, 3, 4, 5];

/** F1 start gantry: five columns light up one per second, then all go out. */
export function StartLights() {
  const phase = useGameStore((s) => s.phase);
  const lit = useGameStore((s) => s.lightsLit);
  const lap = useGameStore((s) => s.hud.totalLaps);
  const mode = useGameStore((s) => s.settings.mode);

  if (phase !== 'lights' || mode !== 'race') return null;

  return (
    <div className="h-lights" role="img" aria-label={`Start lights: ${lit} of 5`}>
      <div className="h-lights-gantry">
        {COLS.map((c) => (
          <div key={c} className={`h-light-col${c <= lit ? ' lit' : ''}`}>
            <span className="lamp" />
            <span className="lamp" />
          </div>
        ))}
      </div>
      <div className="h-lights-cap">
        {lit >= 5 ? 'HOLD' : lit === 0 ? 'FORMATION COMPLETE' : 'LIGHTS'} · {lap} LAPS
      </div>
    </div>
  );
}
