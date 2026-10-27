'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { formatLapTime } from '@/lib/game/gameState';
import { useGameStore } from '@/lib/game/store';
import { ControlsPanel } from './ControlsPanel';
import { SettingsPanel } from './SettingsPanel';
import { MODE_NAMES } from './format';
import { getTrackCatalogEntry } from '@/lib/game/track';
import { exportLapTelemetryCsv, type TelemetrySample } from '@/lib/game/sim/rules';
import { world } from '@/lib/game/sim/world';
import { makeCarSample, recorder } from '@/lib/game/sim/recorder';
import { getRacingLine } from '@/lib/game/sim/racingLine';

interface PauseMenuProps {
  onResume: () => void;
  onRestart: () => void;
  onExitToMenu: () => void;
}

const TABS = ['Settings', 'Controls', 'Telemetry'] as const;

function TelemetryTab() {
  const p = world.player.phys;
  const timing = world.player.timing;
  const stats = world.player.stats;
  const [exported, setExported] = useState(false);

  const rl = getRacingLine();
  const dur = recorder.duration;
  const count = recorder.count;

  // Real reference speed curve from active track racing-line speed profile
  const refPath = useMemo(() => {
    const pts: string[] = [];
    const steps = 60;
    const len = rl.speed.length;
    for (let i = 0; i <= steps; i++) {
      const idx = Math.min(len - 1, Math.floor((i / steps) * (len - 1)));
      const x = (i / steps) * 500;
      const kmh = rl.speed[idx] * 0.36;
      const y = 110 - Math.min(100, Math.max(0, (kmh / 350) * 95));
      pts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
    }
    return pts.join(' ');
  }, [rl]);

  // Real player speed curve from session recorder
  const playerPath = useMemo(() => {
    const pts: string[] = [];
    const steps = 60;
    const sample = makeCarSample();
    const pid = world.player.id;

    if (count > 1 && dur > 0.5) {
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * dur;
        const loc = recorder.locate(t);
        recorder.readCar(loc, pid, sample);
        const x = (i / steps) * 500;
        const y = 110 - Math.min(100, Math.max(0, (sample.kmh / 350) * 95));
        pts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
      }
    } else {
      const y = 110 - Math.min(100, Math.max(0, (p.kmh / 350) * 95));
      pts.push(`M0,${y.toFixed(1)} L500,${y.toFixed(1)}`);
    }
    return pts.join(' ');
  }, [count, dur, p.kmh]);

  const handleExport = () => {
    const samples: TelemetrySample[] = [];
    const sample = makeCarSample();
    const pid = world.player.id;

    if (count > 1 && dur > 0.5) {
      const steps = Math.min(300, Math.max(60, Math.round(dur * 2)));
      let distM = 0;
      let prevTime = 0;
      let prevVf = 0;

      for (let i = 0; i < steps; i++) {
        const t = (i / (steps - 1)) * dur;
        const loc = recorder.locate(t);
        recorder.readCar(loc, pid, sample);
        const dt = i === 0 ? 0.5 : Math.max(0.001, t - prevTime);
        distM += (sample.kmh / 3.6) * dt;
        const lonG = i === 0 ? 0 : ((sample.vf - prevVf) * 0.1 / dt) / 9.81;
        prevTime = t;
        prevVf = sample.vf;

        samples.push({
          distanceM: distM,
          speedKmh: sample.kmh,
          throttle: sample.brake > 0.05 ? 0 : Math.min(1, Math.max(0, (sample.rpm - 4000) / 10000)),
          brake: sample.brake,
          gear: sample.gear,
          rpm: sample.rpm,
          drs: sample.drsOpen,
          lateralG: (sample.vl * 0.1) / 9.81,
          longitudinalG: lonG,
        });
      }
    } else {
      samples.push({
        distanceM: 0,
        speedKmh: p.kmh,
        throttle: world.player.ctrl.throttle,
        brake: world.player.ctrl.brake,
        gear: p.gear,
        rpm: p.rpm,
        drs: p.drsOpen,
        lateralG: (p.vl * 0.1) / 9.81,
        longitudinalG: (p.vf * 0.1) / 9.81,
      });
    }

    const csv = exportLapTelemetryCsv(samples);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `telemetry-lap-${timing.lapsCompleted + 1}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExported(true);
    setTimeout(() => setExported(false), 2500);
  };

  return (
    <div className="flex flex-col gap-6 p-4 text-white font-mono">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-black/30 border border-white/10 p-3 rounded">
          <div className="text-[10px] text-white/50 tracking-wider uppercase">Top Speed</div>
          <div className="text-xl font-bold text-[var(--lime)]">{Math.round(stats.topSpeedKmh)} km/h</div>
        </div>
        <div className="bg-black/30 border border-white/10 p-3 rounded">
          <div className="text-[10px] text-white/50 tracking-wider uppercase">Current Speed</div>
          <div className="text-xl font-bold">{Math.round(p.kmh)} km/h</div>
        </div>
        <div className="bg-black/30 border border-white/10 p-3 rounded">
          <div className="text-[10px] text-white/50 tracking-wider uppercase">Brake Bias</div>
          <div className="text-xl font-bold">{Math.round(p.brakeBias * 100)}% Front</div>
        </div>
        <div className="bg-black/30 border border-white/10 p-3 rounded">
          <div className="text-[10px] text-white/50 tracking-wider uppercase">DRS Activations</div>
          <div className="text-xl font-bold">{stats.drsUses}</div>
        </div>
      </div>

      <div className="bg-black/40 border border-white/10 p-4 rounded flex flex-col gap-3">
        <div className="flex justify-between items-center text-xs">
          <span className="font-bold uppercase tracking-wider text-white/80">Speed vs Track Distance (Telemetry Trace)</span>
          <span className="text-[var(--lime)]">Current Pace</span>
        </div>
        <svg viewBox="0 0 500 120" className="w-full h-28 overflow-visible" preserveAspectRatio="none">
          {/* Grid lines */}
          <line x1="0" y1="20" x2="500" y2="20" stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
          <line x1="0" y1="60" x2="500" y2="60" stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
          <line x1="0" y1="100" x2="500" y2="100" stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
          {/* Reference baseline curve from racing line speed profile */}
          <path
            d={refPath}
            fill="none"
            stroke="rgba(255,255,255,0.25)"
            strokeWidth="2"
          />
          {/* Real player speed line */}
          <path
            d={playerPath}
            fill="none"
            stroke="var(--lime)"
            strokeWidth="2.5"
          />
        </svg>
        <div className="flex justify-between text-[10px] text-white/40">
          <span>START / T1</span>
          <span>SECTOR 2 (BACK STRAIGHT)</span>
          <span>SECTOR 3 (STADIUM)</span>
          <span>FINISH LINE</span>
        </div>
      </div>

      <div className="flex justify-between items-center pt-2">
        <span className="text-xs text-white/60">Export high-resolution CSV telemetry data for MoTeC / Atlas analysis</span>
        <button
          type="button"
          className="m-btn m-btn-primary text-xs px-4 py-2"
          onClick={handleExport}
        >
          {exported ? 'Telemetry CSV Exported!' : 'Export Telemetry (CSV)'}
        </button>
      </div>
    </div>
  );
}

/** Pause modal. Opened by Esc/M or the pause button; the world is frozen while it is open. */
export function PauseMenu({ onResume, onRestart, onExitToMenu }: PauseMenuProps) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Settings');
  const resumeRef = useRef<HTMLButtonElement>(null);
  const mode = useGameStore((s) => s.settings.mode);
  const weather = useGameStore((s) => s.settings.weather);
  const trackId = useGameStore((s) => s.settings.trackId);
  const trackName = getTrackCatalogEntry(trackId).name;
  const hud = useGameStore((s) => s.hud);
  const isRace = mode === 'race';

  useEffect(() => {
    resumeRef.current?.focus();
  }, []);

  return (
    <div className="m-scrim" role="dialog" aria-modal="true" aria-label="Paused">
      <section className="m-card">
        <header className="m-head">
          <div>
            <div className="m-kicker">{MODE_NAMES[mode]} · {trackName}</div>
            <h2 className="m-title">Paused</h2>
          </div>
          <button ref={resumeRef} type="button" className="m-btn m-btn-primary" onClick={onResume}>
            Resume <kbd>Esc</kbd>
          </button>
        </header>

        <div className="m-session-bar" aria-label="Current race session status">
          <div className="m-session-stat">
            <span className="m-session-lbl">Track Position</span>
            <b className="m-session-val" style={{ color: 'var(--lime)' }}>P{hud?.position ?? 1}</b>
          </div>
          <div className="m-session-stat">
            <span className="m-session-lbl">Session Progress</span>
            <b className="m-session-val">
              {isRace ? `Lap ${hud?.lap ?? 1} / ${hud?.totalLaps ?? 5}` : `Lap ${hud?.lap ?? 1}`}
            </b>
          </div>
          <div className="m-session-stat">
            <span className="m-session-lbl">Best Lap</span>
            <b className="m-session-val tnum" style={{ color: hud?.bestLap ? 'var(--green)' : 'inherit' }}>
              {hud?.bestLap ? formatLapTime(hud.bestLap) : '--:--.---'}
            </b>
          </div>
          <div className="m-session-stat">
            <span className="m-session-lbl">Conditions</span>
            <span className="m-session-pill">{weather.toUpperCase()}</span>
          </div>
        </div>

        <div className="m-tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} className={`m-tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>

        <div className="m-body">
          {tab === 'Settings' ? <SettingsPanel /> : tab === 'Controls' ? <ControlsPanel /> : <TelemetryTab />}
        </div>

        <footer className="m-foot">
          <button type="button" className="m-btn" onClick={onRestart}>
            Restart session
          </button>
          <button type="button" className="m-btn m-btn-danger" onClick={onExitToMenu}>
            Quit to lobby
          </button>
        </footer>
      </section>
    </div>
  );
}
