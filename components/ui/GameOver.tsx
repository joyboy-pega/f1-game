'use client';

import React, { useEffect, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { formatLapTime, type RaceResults } from '@/lib/game/gameState';
import { recordKey, useGameStore } from '@/lib/game/store';
import { MODE_NAMES, ordinal } from './format';

interface GameOverProps {
  results: RaceResults;
  onRestart: () => void;
  onExitToMenu: () => void;
}

function LapChart({ times }: { times: number[] }) {
  if (times.length < 2) return null;
  const best = Math.min(...times);
  const worst = Math.max(...times);
  const span = Math.max(0.5, worst - best);
  const w = 100 / times.length;
  return (
    <svg className="m-lapchart" viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label="Lap times">
      {times.map((t, i) => {
        const h = 10 + ((worst - t) / span) * 28 + 2;
        return <rect key={i} x={i * w + w * 0.12} y={40 - h} width={w * 0.76} height={h} className={t === best ? 'best' : ''} />;
      })}
    </svg>
  );
}

/** End-of-session screen: classification (races) or lap list (time trial / practice). */
export function GameOver({ results, onRestart, onExitToMenu }: GameOverProps) {
  const replayActive = useGameStore((s) => s.replayActive);
  const setReplayActive = useGameStore((s) => s.setReplayActive);
  const weather = useGameStore((s) => s.settings.weather);
  const trackId = useGameStore((s) => s.settings.trackId);
  const records = useGameStore((s) => s.records);
  const isRace = results.mode === 'race';
  const pos = results.playerPosition;
  const times = results.playerLapTimes;
  const bestLap = times.length ? Math.min(...times) : null;
  const record = records.bestLaps[recordKey(trackId, results.mode, weather)];

  useEffect(() => {
    if (!isRace || pos > 3) return;
    try {
      confetti({ particleCount: pos === 1 ? 160 : 90, spread: 80, origin: { y: 0.55 }, colors: ['#c8ff2e', '#ffffff', '#ff6b1a'] });
    } catch {}
  }, [isRace, pos]);

  const headline = useMemo(() => {
    if (!isRace) return 'Session complete';
    if (pos === 1) return 'Victory';
    if (pos <= 3) return 'Podium';
    if (pos <= 10) return 'Points finish';
    return 'Race complete';
  }, [isRace, pos]);

  if (replayActive) return null;

  return (
    <div className="m-scrim" role="dialog" aria-modal="true" aria-label="Results">
      <section className="m-card m-results">
        <header className="m-head">
          <div>
            <div className="m-kicker">{MODE_NAMES[results.mode]} · Buddh International Circuit</div>
            <h2 className="m-title">{headline}</h2>
          </div>
          {isRace && (
            <div className={`m-pos pos-${Math.min(pos, 4)}`}>
              <span>{ordinal(pos)}</span>
            </div>
          )}
        </header>

        <div className="m-stats">
          <div>
            <small>Best lap</small>
            <b className={results.fastestLap && bestLap === results.fastestLap.time ? 'purple' : ''}>{formatLapTime(bestLap)}</b>
          </div>
          <div>
            <small>{isRace ? 'Race time' : 'Session'}</small>
            <b>{formatLapTime(results.totalTime)}</b>
          </div>
          <div>
            <small>Top speed</small>
            <b>{Math.round(results.topSpeed)} km/h</b>
          </div>
          <div>
            <small>Overtakes</small>
            <b>{results.overtakes}</b>
          </div>
          <div>
            <small>DRS / ERS</small>
            <b>
              {results.drsUses} / {results.ersUses}
            </b>
          </div>
          {!isRace && record !== undefined && (
            <div>
              <small>Your record</small>
              <b className="green">{formatLapTime(record)}</b>
            </div>
          )}
        </div>

        {isRace ? (
          <div className="m-table-wrap">
            <table className="m-table">
              <thead>
                <tr>
                  <th>Pos</th>
                  <th>Driver</th>
                  <th>Team</th>
                  <th className="r">Time / gap</th>
                  <th className="r">Best lap</th>
                  <th className="r">Stops</th>
                </tr>
              </thead>
              <tbody>
                {results.classification.map((r) => (
                  <tr key={r.carId} className={r.isPlayer ? 'me' : ''}>
                    <td>{r.position}</td>
                    <td>
                      <i style={{ background: r.color }} />
                      <b>{r.code}</b> {r.name}
                    </td>
                    <td>{r.team}</td>
                    <td className="r">
                      {r.gapText}
                      {r.penaltySec > 0 && <em> +{r.penaltySec}s pen</em>}
                    </td>
                    <td className={`r ${results.fastestLap && r.carId === results.fastestLap.carId ? 'purple' : ''}`}>{formatLapTime(r.bestLap)}</td>
                    <td className="r">{r.pitStops}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="m-laps">
            {times.length === 0 && <p className="m-empty">Complete a lap to set a time.</p>}
            {times.map((t, i) => (
              <div key={i} className={`m-lap ${t === bestLap ? 'best' : ''}`}>
                <span>Lap {i + 1}</span>
                <b>{formatLapTime(t)}</b>
              </div>
            ))}
          </div>
        )}

        <LapChart times={times} />

        <footer className="m-foot">
          <button type="button" className="m-btn m-btn-primary" onClick={onRestart} autoFocus>
            {isRace ? 'Race again' : 'Go again'}
          </button>
          <button type="button" className="m-btn" onClick={() => setReplayActive(true)}>
            Watch replay
          </button>
          <button type="button" className="m-btn" onClick={onExitToMenu}>
            Back to lobby
          </button>
        </footer>
      </section>
    </div>
  );
}
