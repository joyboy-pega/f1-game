'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { TimingRow } from '@/lib/game/gameState';
import { useGameStore } from '@/lib/game/store';
import { COMPOUNDS, MODE_NAMES, isEditableTarget } from '../format';

type Entry = { row: TimingRow; gap: boolean; far: boolean };

/** Top three plus the player and the cars directly around them. */
function visibleRows(order: TimingRow[]): Entry[] {
  if (order.length === 0) return [];
  const pIdx = Math.max(0, order.findIndex((r) => r.isPlayer));
  const show = new Set<number>();
  if (order.length <= 6) order.forEach((_, i) => show.add(i));
  else {
    [0, 1, 2, pIdx - 1, pIdx, pIdx + 1].forEach((i) => i >= 0 && i < order.length && show.add(i));
  }
  const idxs = [...show].sort((a, b) => a - b);
  return idxs.map((i, k) => ({
    row: order[i],
    gap: k > 0 && i - idxs[k - 1] > 1,
    // Compact (phone) layout keeps only the top three and the player.
    far: i > 2 && i !== pIdx,
  }));
}

function gapLabel(r: TimingRow, mode: 'interval' | 'gap'): string {
  if (r.finished) return 'FIN';
  if (r.position === 1) return 'LEADER';
  return mode === 'interval' ? r.interval : r.gapToLeader;
}

export function TimingTower() {
  const mode = useGameStore((s) => s.settings.mode);
  const order = useGameStore((s) => s.hud.order);
  const lap = useGameStore((s) => s.hud.lap);
  const totalLaps = useGameStore((s) => s.hud.totalLaps);
  const [gapMode, setGapMode] = useState<'interval' | 'gap'>('interval');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyG' && !e.repeat && !isEditableTarget(e.target)) setGapMode((m) => (m === 'interval' ? 'gap' : 'interval'));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const rows = useMemo(() => visibleRows(order), [order]);

  if (mode !== 'race') {
    return (
      <div className="h-tower h-tower-solo" aria-label="Session">
        <div className="h-tw-head">
          <span className="h-tw-title">{MODE_NAMES[mode]}</span>
          <span className="h-tw-lap">LAP {lap}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-tower" aria-label="Timing tower">
      <div className="h-tw-head">
        <span className="h-tw-title">
          LAP {lap}
          <i>/{totalLaps}</i>
        </span>
        <button
          type="button"
          className="h-tw-toggle"
          onClick={() => setGapMode((m) => (m === 'interval' ? 'gap' : 'interval'))}
          title="Toggle interval / gap to leader (G)"
        >
          {gapMode === 'interval' ? 'INT' : 'GAP'}
        </button>
      </div>
      <ol className="h-tw-rows">
        {rows.map(({ row, gap, far }) => {
          const comp = COMPOUNDS[row.compound];
          return (
            <li
              key={row.carId}
              className={`h-tw-row${row.isPlayer ? ' me' : ''}${gap ? ' gap' : ''}${far ? ' far' : ''}`}
              style={{ ['--team' as string]: row.color }}
            >
              <span className="h-tw-pos">{row.position}</span>
              <span className="h-tw-bar" />
              <span className="h-tw-code">{row.code}</span>
              <span className="h-tw-gap">{gapLabel(row, gapMode)}</span>
              <span className="h-tw-tags">
                {row.inPit && <b className="h-tag pit">PIT</b>}
                {row.penaltySec > 0 && <b className="h-tag pen">+{Math.round(row.penaltySec)}</b>}
              </span>
              <span className="k-comp" style={{ ['--c' as string]: comp.color }} title={comp.name}>
                {comp.letter}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
