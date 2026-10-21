'use client';

import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { formatLapTime, RaceResults } from '@/lib/game/gameState';

interface GameOverProps {
  results: RaceResults;
  onRestart: () => void;
  onExitToMenu: () => void;
}

export function GameOver({ results, onRestart, onExitToMenu }: GameOverProps) {
  const lapTimes = results.playerLapTimes;
  const stats = {
    position: results.playerPosition,
    totalTime: results.totalTime,
    bestLap: lapTimes.length ? Math.min(...lapTimes) : null,
    lastLap: lapTimes.length ? lapTimes[lapTimes.length - 1] : null,
    topSpeed: results.topSpeed,
    overtakeCount: results.overtakes,
    drsUseCount: results.drsUses,
    ersUseCount: results.ersUses,
    lapTimes,
  };
  useEffect(() => {
    if (stats.position <= 3) {
      try {
        confetti({
          particleCount: 120,
          spread: 80,
          origin: { y: 0.6 },
        });
      } catch {}
    }
  }, [stats.position]);

  return (
    <div id="race-complete" className="show">
      <div className="rc-header">
        <div className="rc-flag">CHECKERED FLAG // FINISH</div>
        <div className="rc-title">RACE COMPLETE</div>
        <div className="rc-subtitle" id="rc-subtitle">
          BUDDH INTERNATIONAL CIRCUIT · MADE BY ARIGATOO CLUB FOR FUN
        </div>
      </div>

      <div className="rc-stats-grid">
        <div className="rc-stat">
          <div className="rc-stat-label">POSITION</div>
          <div className="rc-stat-val" id="rc-pos">
            P{stats.position}
          </div>
        </div>
        <div className="rc-stat">
          <div className="rc-stat-label">TOTAL TIME</div>
          <div className="rc-stat-val" id="rc-total">
            {formatLapTime(stats.totalTime)}
          </div>
        </div>
        <div className="rc-stat">
          <div className="rc-stat-label">BEST LAP</div>
          <div className="rc-stat-val best" id="rc-best">
            {formatLapTime(stats.bestLap)}
          </div>
        </div>
        <div className="rc-stat">
          <div className="rc-stat-label">LAST LAP</div>
          <div className="rc-stat-val" id="rc-last">
            {formatLapTime(stats.lastLap)}
          </div>
        </div>
        <div className="rc-stat">
          <div className="rc-stat-label">TOP SPEED</div>
          <div className="rc-stat-val" id="rc-top">
            {Math.round(stats.topSpeed)} km/h
          </div>
        </div>
        <div className="rc-stat">
          <div className="rc-stat-label">OVERTAKES</div>
          <div className="rc-stat-val" id="rc-overtakes">
            {stats.overtakeCount}
          </div>
        </div>
        <div className="rc-stat">
          <div className="rc-stat-label">DRS USES</div>
          <div className="rc-stat-val" id="rc-drs-uses">
            {stats.drsUseCount}
          </div>
        </div>
        <div className="rc-stat">
          <div className="rc-stat-label">ERS USES</div>
          <div className="rc-stat-val" id="rc-ers-uses">
            {stats.ersUseCount}
          </div>
        </div>
      </div>

      {/* LAP TIMES BREAKDOWN */}
      {stats.lapTimes.length > 0 && (
        <div id="rc-lap-list">
          {stats.lapTimes.map((t, idx) => {
            const isBest = t === stats.bestLap;
            return (
              <div key={idx} className="rc-lap-item">
                <span>LAP {idx + 1}</span>
                <span className={isBest ? 'best' : ''}>
                  {formatLapTime(t)} {isBest ? '★ BEST' : ''}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ACTIONS */}
      <div className="rc-actions">
        <button
          className="rc-btn rc-btn-primary"
          id="rc-again-btn"
          type="button"
          onClick={onRestart}
        >
          RACE AGAIN
        </button>
        <button
          className="rc-btn rc-btn-secondary"
          id="rc-home-btn"
          type="button"
          onClick={onExitToMenu}
        >
          BACK TO HOME
        </button>
      </div>
    </div>
  );
}
