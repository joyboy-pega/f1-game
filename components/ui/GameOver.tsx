'use client';

import React, { useEffect, useMemo, useState } from 'react';
import confetti from 'canvas-confetti';
import { formatLapTime, type RaceResults } from '@/lib/game/gameState';
import { recordKey, useGameStore } from '@/lib/game/store';
import { MODE_NAMES, ordinal } from './format';
import { getTrackCatalogEntry } from '@/lib/game/track';
import { exportLapTelemetryCsv, type TelemetrySample } from '@/lib/game/sim/rules';
import { world } from '@/lib/game/sim/world';
import { recorder } from '@/lib/game/sim/recorder';

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
  const isQuali = results.mode === 'qualifying';
  const isMultiCar = isRace || isQuali;
  const pos = results.playerPosition;
  const times = results.playerLapTimes;
  const bestLap = times.length ? Math.min(...times) : null;
  const record = records.bestLaps[recordKey(trackId, results.mode, weather)];
  const trackName = getTrackCatalogEntry(trackId).name;
  const [exported, setExported] = useState(false);

  useEffect(() => {
    if (!isMultiCar || pos > 3) return;
    try {
      confetti({ particleCount: pos === 1 ? 160 : 90, spread: 80, origin: { y: 0.55 }, colors: ['#c8ff2e', '#ffffff', '#ff6b1a'] });
    } catch {}
  }, [isMultiCar, pos]);

  const headline = useMemo(() => {
    if (isQuali) {
      return pos === 1 ? 'Pole Position' : `Qualified P${pos}`;
    }
    if (!isRace) return 'Session complete';
    if (pos === 1) return 'Victory';
    if (pos <= 3) return 'Podium';
    if (pos <= 10) return 'Points finish';
    return 'Race complete';
  }, [isRace, isQuali, pos]);

  const handleExportTelemetry = () => {
    const samples: TelemetrySample[] = [];
    const carId = world.player.id;
    const dur = Math.min(recorder.duration, 180);
    const steps = 120;
    for (let i = 0; i < steps; i++) {
      const t = (i / (steps - 1)) * dur;
      const loc = recorder.locate(t);
      const s = { ...recorder.locate(t) } as any;
      samples.push({
        distanceM: i * 40,
        speedKmh: world.player.phys.kmh,
        throttle: world.player.ctrl.throttle,
        brake: world.player.ctrl.brake,
        gear: world.player.phys.gear,
        rpm: world.player.phys.rpm,
        drs: world.player.phys.drsOpen,
        lateralG: (world.player.phys.vl * 0.1) / 9.81,
        longitudinalG: (world.player.phys.vf * 0.1) / 9.81,
      });
    }
    const csv = exportLapTelemetryCsv(samples);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `telemetry-${trackId}-${results.mode}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExported(true);
    setTimeout(() => setExported(false), 2500);
  };

  if (replayActive) return null;

  return (
    <div className="m-scrim" role="dialog" aria-modal="true" aria-label="Results">
      <section className="m-card m-results">
        <header className="m-head">
          <div>
            <div className="m-kicker">{MODE_NAMES[results.mode]} · {trackName}</div>
            <h2 className="m-title">{headline}</h2>
          </div>
          {isMultiCar && (
            <div className={`m-pos pos-${Math.min(pos, 4)}`}>
              <span>{isQuali && pos === 1 ? 'POLE' : ordinal(pos)}</span>
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

        {isMultiCar ? (
          <div className="m-table-wrap">
            <table className="m-table">
              <thead>
                <tr>
                  <th>Pos</th>
                  <th>Driver</th>
                  <th>Team</th>
                  <th className="r">{isQuali ? 'Best Lap' : 'Time / gap'}</th>
                  <th className="r">{isQuali ? 'Gap' : 'Best lap'}</th>
                  <th className="r">{isQuali ? 'Status' : 'Stops'}</th>
                </tr>
              </thead>
              <tbody>
                {results.classification.map((r, idx) => (
                  <tr key={r.carId} className={r.isPlayer ? 'me' : ''}>
                    <td>{r.position}</td>
                    <td>
                      <i style={{ background: r.color }} />
                      <b>{r.code}</b> {r.name}
                    </td>
                    <td>{r.team}</td>
                    <td className="r">
                      {isQuali ? (
                        <b className={results.fastestLap && r.carId === results.fastestLap.carId ? 'purple' : ''}>{formatLapTime(r.bestLap)}</b>
                      ) : (
                        <>
                          {r.gapText}
                          {r.penaltySec > 0 && <em> +{r.penaltySec}s pen</em>}
                        </>
                      )}
                    </td>
                    <td className={`r ${!isQuali && results.fastestLap && r.carId === results.fastestLap.carId ? 'purple' : ''}`}>
                      {isQuali ? (idx === 0 ? 'POLE' : r.bestLap && results.fastestLap?.time ? `+${(r.bestLap - results.fastestLap.time).toFixed(3)}` : 'NO TIME') : formatLapTime(r.bestLap)}
                    </td>
                    <td className="r">{isQuali ? (r.bestLap ? 'QUALIFIED' : 'NO TIME') : r.pitStops}</td>
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
          {isQuali ? (
            <button
              type="button"
              className="m-btn m-btn-primary"
              onClick={() => {
                useGameStore.getState().setSettings({ mode: 'race' });
                onRestart();
              }}
              autoFocus
            >
              Start Grand Prix (P{pos})
            </button>
          ) : (
            <button type="button" className="m-btn m-btn-primary" onClick={onRestart} autoFocus>
              {isRace ? 'Race again' : 'Go again'}
            </button>
          )}
          {isQuali && (
            <button type="button" className="m-btn" onClick={onRestart}>
              Qualify again
            </button>
          )}
          <button type="button" className="m-btn" onClick={() => setReplayActive(true)}>
            Watch replay
          </button>
          <button type="button" className="m-btn" onClick={handleExportTelemetry}>
            {exported ? 'Telemetry Exported!' : 'Export CSV'}
          </button>
          <button type="button" className="m-btn" onClick={onExitToMenu}>
            Back to lobby
          </button>
        </footer>
      </section>
    </div>
  );
}
