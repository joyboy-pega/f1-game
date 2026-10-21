'use client';

import React from 'react';
import { formatDelta, formatLapTime } from '@/lib/game/gameState';
import { useGameStore } from '@/lib/game/store';
import { world } from '@/lib/game/sim/world';
import { useTicker } from '@/lib/game/useTicker';
import { useWriter } from '../domWrite';
import { formatClock } from '../format';

/** Top-right lap chip: live lap clock, delta to best, sector bars, last/best, race position. */
export function LapChip() {
  const w = useWriter();
  const isRace = useGameStore((s) => s.settings.mode === 'race');
  const position = useGameStore((s) => s.hud.position);
  const carCount = useGameStore((s) => s.hud.carCount);
  const sectors = useGameStore((s) => s.hud.sectors);
  const currentSector = useGameStore((s) => s.hud.currentSector);
  const delta = useGameStore((s) => s.hud.deltaToBest);
  const last = useGameStore((s) => s.hud.lastLap);
  const best = useGameStore((s) => s.hud.bestLap);
  const phase = useGameStore((s) => s.phase);

  // The clock reads the sim directly so milliseconds don't stutter at the 10 Hz snapshot rate.
  useTicker(() => {
    const t = world.player.timing;
    const running = (world.phase === 'racing' || world.phase === 'finished') && t.lapStartTime !== null;
    w.text('clock', formatClock(running ? world.raceTime - (t.lapStartTime as number) : 0));
  });

  const dClass = delta === null ? '' : delta < 0 ? ' neg' : ' pos';
  const showDelta = delta !== null && phase !== 'grid' && phase !== 'lights';

  return (
    <div className="h-lap" aria-label="Lap timing">
      <div className="h-lap-top">
        {isRace && (
          <span className="h-lap-pos">
            P{position}
            <i>/{carCount}</i>
          </span>
        )}
        <span className="h-lap-clock" ref={w.ref('clock')}>
          0:00.000
        </span>
      </div>
      <div className={`h-lap-delta${dClass}`}>
        <span className="lbl">DELTA</span>
        <span className="val">{showDelta ? formatDelta(delta) : '--.---'}</span>
      </div>
      <div className="h-lap-sectors" aria-label="Sector times">
        {sectors.map((s, i) => (
          <span
            key={i}
            className={`h-sec ${s.status}${i === currentSector && s.status === 'none' ? ' live' : ''}`}
            title={`S${i + 1}${s.time ? ' ' + s.time.toFixed(3) : ''}`}
          />
        ))}
      </div>
      <div className="h-lap-times">
        <span>
          <em>LAST</em> {formatLapTime(last)}
        </span>
        <span>
          <em>BEST</em> {formatLapTime(best)}
        </span>
      </div>
    </div>
  );
}
