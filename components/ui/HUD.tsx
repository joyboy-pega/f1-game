'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { CarPhysicsState, fitFreshTires } from '@/lib/game/physics';
import { RaceState, ToastMessage, RaceOrderRow, formatLapTime, GameSettings } from '@/lib/game/gameState';
import { audio } from '@/lib/game/audio';

interface HUDProps {
  carState: CarPhysicsState;
  raceState: RaceState;
  settings: GameSettings;
  currentLap: number;
  totalLaps: number;
  lapTime: number;
  bestLapTime: number | null;
  lastLapTime: number | null;
  playerPosition: number;
  raceOrder: RaceOrderRow[];
  toasts: ToastMessage[];
  lightsActiveCount: number;
  lightsOut: boolean;
  telemetryOpen: boolean;
  onToggleTelemetry: () => void;
  onCycleCamera: () => void;
  onCycleWeather: () => void;
  onToggleCarModel: () => void;
  onPause: () => void;
  addToast: (toast: ToastMessage) => void;
}

export function HUD({
  carState,
  raceState,
  settings,
  currentLap,
  totalLaps,
  lapTime,
  bestLapTime,
  lastLapTime,
  playerPosition,
  raceOrder,
  toasts,
  lightsActiveCount,
  lightsOut,
  telemetryOpen,
  onToggleTelemetry,
  onCycleCamera,
  onCycleWeather,
  onToggleCarModel,
  onPause,
  addToast,
}: HUDProps) {
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(audio.isEnabled());

  const speedKmh = Math.round(carState.kmh);
  const gear = carState.gear;
  const inGear = typeof gear === 'number' ? (speedKmh - (gear - 1) * 42) / 42 : 0;
  const rpmPercent = Math.max(0, Math.min(1, inGear)) * 100;
  const ersPercent = Math.round(carState.ersCharge);

  const avgT = Math.round(carState.tires.avgTemp);
  const avgGripPct = Math.round(carState.tires.overallGrip * 100);
  const tireStatusClass =
    avgT < 78 ? 'cold' : avgT > 112 ? 'hot' : avgT > 105 ? 'warm' : 'optimal';

  const fPct = Math.round(carState.brakeBias * 100);
  const isDriftingNow = carState.driftIntensity > 0.15 && speedKmh > 50;

  const handleToggleAudio = () => {
    const en = audio.toggleAudio();
    setAudioEnabled(en);
  };

  const handleQuickPit = () => {
    fitFreshTires(carState);
    audio.playPitSound();
    addToast({
      id: 'pit',
      type: 'tire',
      title: 'PIT STOP COMPLETE',
      subtitle: 'FRESH SOFT TIRES FITTED (100% GRIP)',
      duration: 2.5,
    });
  };

  const handleQuickBias = (delta: number) => {
    carState.brakeBias = Math.max(0.45, Math.min(0.7, carState.brakeBias + delta));
    audio.playBiasTick();
    const curFPct = Math.round(carState.brakeBias * 100);
    const curRPct = 100 - curFPct;
    addToast({
      id: 'bias',
      type: 'bias',
      title: `BRAKE BIAS: ${curFPct}% F / ${curRPct}% R`,
      duration: 1.5,
    });
  };

  return (
    <>
      {/* 1. TOP TOOLS BAR */}
      <div id="top-tools">
        <button
          id="car-toggle-btn"
          type="button"
          onClick={onToggleCarModel}
          title="Switch Vehicle Model (Press V)"
        >
          <span style={{ marginRight: '4px' }}>CAR:</span>
          <span id="car-toggle-text">{settings.carModel === 'f1' ? 'FORMULA 1' : 'STREET RACER'}</span>
        </button>

        <button
          id="cam-toggle-btn"
          type="button"
          onClick={onCycleCamera}
          title="Switch Camera View (Press C: Chase, Cockpit, TV Pod, Hood)"
        >
          <span style={{ marginRight: '4px' }}>CAM:</span>
          <span id="cam-toggle-text">{settings.cameraView.toUpperCase()}</span>
        </button>

        <button
          id="telemetry-toggle-btn"
          type="button"
          aria-pressed={telemetryOpen ? 'true' : 'false'}
          onClick={onToggleTelemetry}
          title="Toggle Telemetry Panels (Press T)"
        >
          <span id="telemetry-toggle-text">TELEMETRY: {telemetryOpen ? 'ON' : 'OFF'}</span>
        </button>

        <button
          id="weather-toggle-btn"
          type="button"
          onClick={onCycleWeather}
          title="Switch Track Weather"
        >
          <span id="game-weather-icon" style={{ marginRight: '6px' }}>WXR:</span>
          <span id="game-weather-text">{settings.weather.toUpperCase()}</span>
        </button>

        <button
          id="sound-toggle"
          type="button"
          aria-pressed={audioEnabled ? 'true' : 'false'}
          onClick={handleToggleAudio}
          title="Toggle engine and road audio"
        >
          AUDIO {audioEnabled ? 'ON' : 'OFF'}
        </button>

        <button
          id="menu-toggle"
          type="button"
          onClick={onPause}
          title="Pause Race & Open Settings (ESC)"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '6px' }}>
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
          </svg>
          <span>SETTINGS &amp; PAUSE</span>
        </button>

        <Link
          href="/"
          className="tool-btn-link"
          id="top-exit-btn"
          title="Exit to Grand Prix Lobby"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            style={{ marginRight: '6px' }}
          >
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          <span>EXIT TO MAP</span>
        </Link>
      </div>

      {/* 2. TIMING CARD (TOP LEFT) */}
      <div className="hud" id="timing">
        <div className="big" id="cur">
          {formatLapTime(lapTime)}
        </div>
        <div>
          Lap <b id="lap">{Math.min(currentLap, totalLaps)}</b> / <b id="total-laps">{totalLaps}</b>
        </div>
        <div>
          Last <b id="last">{formatLapTime(lastLapTime)}</b>
        </div>
        <div>
          Best <b id="best">{formatLapTime(bestLapTime)}</b>
        </div>
      </div>

      {/* 3. F1 START LIGHTS BANNER */}
      {raceState === 'lights' && !lightsOut && (
        <div id="lights">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className={i < lightsActiveCount ? 'on' : ''} />
          ))}
        </div>
      )}

      {/* 4. BIG GO / MESSAGE BANNER */}
      <div id="msg">
        {raceState === 'lights' && lightsOut ? 'GO' : ''}
      </div>

      {/* 5. POSITION BADGE (Clickable for Leaderboard) */}
      <div
        id="pos-badge"
        style={{ display: 'block', cursor: 'pointer' }}
        onClick={() => setShowLeaderboard(!showLeaderboard)}
        title="Toggle Race Order Leaderboard"
      >
        POS {playerPosition}/8
      </div>

      {/* Leaderboard Drawer */}
      {showLeaderboard && (
        <div id="leaderboard" style={{ display: 'block' }}>
          <div id="leaderboard-title">RACE ORDER</div>
          <div id="lb-rows">
            {raceOrder.map((row) => (
              <div
                key={row.position}
                className={`lb-row ${row.isPlayer ? 'lb-you' : ''}`}
              >
                <span className="lb-pos">P{row.position}</span>
                <span className="lb-name">{row.name}</span>
                <span className="lb-gap">{row.gapText}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. ICONIC F1 STEERING WHEEL DASHBOARD (BOTTOM CENTER) */}
      <div className="hud" id="dash">
        <div id="gear">{gear}</div>
        <div id="speed">
          {speedKmh}
          <small>km/h</small>
        </div>

        <div className="bars">
          <div id="rev" className="bar" title="Engine RPM">
            <i style={{ width: `${rpmPercent}%` }} />
          </div>
          <div id="ersb" className="bar" title="ERS Electric Energy Reserve">
            <i style={{ width: `${ersPercent}%` }} />
          </div>
        </div>

        <div
          id="drs"
          className={carState.drsOpen ? 'on' : carState.vf > 175 ? 'avail' : ''}
          onClick={() => {
            carState.drsOpen = !carState.drsOpen;
            audio.playDrsTone(carState.drsOpen);
          }}
          style={{ cursor: 'pointer' }}
          title="DRS Rear Wing Flap [Key: F]"
        >
          {carState.drsOpen ? 'DRS OPEN' : 'DRS [F]'}
        </div>

        <div
          id="drift-tag"
          className={isDriftingNow ? 'on' : ''}
          title="Arcade Power Drift Meter [Key: Space]"
        >
          {isDriftingNow
            ? `DRIFT ${Math.round(Math.abs(carState.driftAngle) * (180 / Math.PI))}°`
            : 'DRIFT OFF'}
        </div>

        <div
          id="bb-tag"
          className={`${carState.brakeInput > 0.15 ? 'braking' : ''} ${carState.brakeBias < 0.53 ? 'rear-bias' : ''}`}
          onClick={() => handleQuickBias(0.01)}
          title="Brake Balance (Adjust with [ and ])"
        >
          BB {fPct}%
        </div>

        <div
          id="tire-dash-tag"
          className={tireStatusClass}
          onClick={handleQuickPit}
          title="Tire Condition (Click or press P for Fresh Tires)"
        >
          TIRES {avgT}°C · {avgGripPct}%
        </div>
      </div>

      {/* 7. NEO-BRUTALIST CONTROLS HELP (BOTTOM LEFT) */}
      <div id="help" className="hidden md:block">
        <b>Buddh International Circuit</b> · 5.13 km<br />
        ↑ W throttle · ↓ S brake · ← → A D steer · Space handbrake<br />
        Shift ERS boost · F DRS · [ ] brake bias · P pit stop · C camera · T telemetry
      </div>

      {/* 8. TOAST NOTIFICATIONS */}
      {toasts.map((toast) => (
        <div
          key={toast.id}
          id={
            toast.type === 'overtake'
              ? 'overtake-toast'
              : toast.type === 'lap'
              ? 'lap-complete-toast'
              : toast.type === 'bias'
              ? 'bias-toast'
              : 'tire-toast'
          }
          className="show"
        >
          {toast.type === 'lap' ? (
            <>
              <div className="lct-lap">{toast.title}</div>
              <div className="lct-time">{formatLapTime(lastLapTime)}</div>
              <div className="lct-sub">{toast.subtitle || 'KEEP PUSHING!'}</div>
            </>
          ) : (
            <div>{toast.title}</div>
          )}
        </div>
      ))}
    </>
  );
}
