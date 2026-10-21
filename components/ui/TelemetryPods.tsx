'use client';

import React from 'react';
import { controls } from '@/lib/game/controls';
import { useGameStore } from '@/lib/game/store';
import { useRefreshRate } from '@/lib/game/useTicker';
import { world } from '@/lib/game/sim/world';

export function TelemetryPods() {
  useRefreshRate(15);
  const carState = world.player.phys;
  const onToggle = useGameStore.getState().toggleTelemetry;

  const { fl, fr, rl, rr, avgTemp, overallGrip } = carState.tires;
  const avgT = Math.round(avgTemp);

  const getTireClass = (temp: number) => {
    if (temp < 78) return 'cold';
    if (temp > 112) return 'hot';
    if (temp > 105) return 'warm';
    return 'optimal';
  };

  const handlePitStop = () => controls.fireTrigger('pitStopRequested');
  const adjustBias = (delta: number) => controls.fireTrigger(delta > 0 ? 'brakeBiasUp' : 'brakeBiasDown');

  const fPct = Math.round(carState.brakeBias * 100);
  const rPct = 100 - fPct;
  const ersCellsActive = Math.round((carState.ersCharge / 100) * 10);
  const speedKmh = Math.round(carState.kmh);

  const driftAngleDeg = Math.round(Math.abs(carState.driftAngle) * (180 / Math.PI));
  const driftIntensityPct = Math.round(carState.driftIntensity * 100);

  return (
    <>
      {/* LEFT TELEMETRY POD: Aero, DRS, Drift & Brake Balance */}
      <div id="side-telemetry-left" className={`side-telemetry-panel ${carState.drsOpen ? 'drs-glowing' : ''} ${carState.isDrifting ? 'drift-glowing' : ''} ${carState.brakeInput > 0.2 ? 'brake-glowing' : ''}`}>
        <div className="side-pod-header">
          <div className="side-pod-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
            <span>AERO · CHASSIS</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="side-pod-badge" id="side-lap-sector">SEC 1</span>
            <button
              className="side-pod-close-btn"
              type="button"
              onClick={onToggle}
              title="Hide telemetry panels"
            >
              ✕
            </button>
          </div>
        </div>

        {/* DRS SECTION */}
        <div className="side-section" id="side-drs-section">
          <div className="side-sec-title">
            <span>AERO · DRS</span>
            <span className="key-hint">KEY [F]</span>
          </div>
          <div className={`side-status-box ${carState.drsOpen ? 'active' : ''}`} id="side-drs-status">
            {carState.drsOpen ? 'DRS OPEN' : 'DRS CLOSED'}
          </div>

          {/* SVG Flap Visualizer */}
          <div className="side-wing-viz">
            <svg viewBox="0 0 100 36">
              <rect x="8" y="4" width="5" height="26" rx="1" fill="#444" />
              <rect x="87" y="4" width="5" height="26" rx="1" fill="#444" />
              <rect x="48" y="16" width="4" height="14" fill="#333" />
              <path d="M13 20 Q50 23 87 20 L87 24 Q50 27 13 24 Z" fill="#666" />
              <g
                id="side-svg-flap"
                style={{
                  transformOrigin: '50px 10px',
                  transform: carState.drsOpen ? 'rotate(-6deg)' : 'rotate(0deg)',
                  transition: 'transform 0.12s ease-out',
                }}
              >
                <rect x="14" y="8" width="72" height="5" rx="1.5" fill={carState.drsOpen ? 'var(--neon-lime)' : 'var(--hot-orange)'} />
                <path d="M16 10 Q50 12 84 10" stroke="var(--neon-lime)" strokeWidth="1.2" fill="none" opacity="0.8" />
              </g>
            </svg>
            <div className="side-wing-flap-tag" id="side-flap-label">
              {carState.drsOpen ? 'OPEN · -3° LOW DRAG' : 'CLOSED · 25° DOWNFORCE'}
            </div>
          </div>

          <div className="side-metrics">
            <div className="side-metric-cell">
              <span className="label">DRAG SLICE</span>
              <span className="value" id="side-drag-val">
                {carState.drsOpen ? '68%' : '0%'}
              </span>
            </div>
            <div className="side-metric-cell">
              <span className="label">TOP CEILING</span>
              <span className="value" id="side-top-val">
                {Math.round(carState.currentMaxV * 0.37)} <small>km/h</small>
              </span>
            </div>
          </div>
        </div>

        <div className="side-divider" />

        {/* DRIFT SECTION */}
        <div className="side-section" id="side-drift-section">
          <div className="side-sec-title">
            <span>DYNAMICS · DRIFT</span>
            <span className="key-hint">SPACEBAR</span>
          </div>
          <div className="side-status-box" id="side-drift-status">
            {carState.isDrifting ? `DRIFTING ${driftAngleDeg}°` : 'GRIP STABLE'}
          </div>

          <div className="side-drift-track" style={{ height: '6px', background: '#1c1c1c', position: 'relative', margin: '8px 0', border: '1px solid #333' }}>
            <div
              className="drift-track-fill"
              id="side-drift-fill"
              style={{ width: `${driftIntensityPct}%`, height: '100%', background: 'var(--hot-orange)', transition: 'width 0.08s ease' }}
            />
          </div>

          <div className="side-drift-score-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="score-num" id="side-drift-pts" style={{ fontFamily: 'var(--font-display)', fontSize: '13px', color: 'var(--neon-lime)' }}>
              {Math.round(carState.driftScore || 0)} PTS
            </div>
            <div className="drift-rating-badge" id="side-drift-rating" style={{ fontSize: '10px', fontWeight: 800, padding: '2px 6px', background: carState.isDrifting ? 'var(--hot-orange)' : '#222', color: carState.isDrifting ? '#000' : '#888' }}>
              {carState.isDrifting ? 'SLIDING' : 'GRIP OPTIMAL'}
            </div>
          </div>
        </div>

        <div className="side-divider" />

        {/* BRAKE BALANCE SECTION */}
        <div className="side-section" id="side-brake-section">
          <div className="side-sec-title">
            <span>BRAKE · BALANCE</span>
            <span className="key-hint">KEYS [ &amp; ]</span>
          </div>
          <div className="side-status-box" id="side-brake-status">
            BALANCED {fPct}:{rPct}
          </div>

          <div className="bias-bar-wrap" style={{ margin: '8px 0' }}>
            <div className="bias-bar" style={{ display: 'flex', height: '8px', background: '#222', border: '1px solid #333' }}>
              <div className="bias-bar-fill-f" id="side-bias-fill-f" style={{ width: `${fPct}%`, background: 'var(--neon-lime)' }} />
              <div className="bias-bar-fill-r" id="side-bias-fill-r" style={{ width: `${rPct}%`, background: 'var(--hot-orange)' }} />
            </div>
            <div className="bias-labels" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#888', marginTop: '3px' }}>
              <span>FRONT {fPct}%</span>
              <span>REAR {rPct}%</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => adjustBias(-0.01)}
              style={{ flex: 1, padding: '4px', background: '#1c1c1c', border: '1.5px solid #333', color: '#fff', cursor: 'pointer', fontFamily: 'var(--font-display)' }}
            >
              - REAR [
            </button>
            <button
              onClick={() => adjustBias(0.01)}
              style={{ flex: 1, padding: '4px', background: '#1c1c1c', border: '1.5px solid #333', color: '#fff', cursor: 'pointer', fontFamily: 'var(--font-display)' }}
            >
              + FRONT ]
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT TELEMETRY POD: Tires & ERS Hybrid Powertrain */}
      <div id="side-telemetry-right" className={`side-telemetry-panel ${avgT > 112 ? 'tire-overheating' : ''} ${carState.isBoosting ? 'ers-glowing' : ''}`}>
        <div className="side-pod-header">
          <div className="side-pod-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 3" />
            </svg>
            <span>TIRES · POWERTRAIN</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span className="side-pod-badge" id="side-power-badge" style={{ background: 'var(--neon-lime)', color: '#000' }}>
              LIVE
            </span>
            <button
              className="side-pod-close-btn"
              type="button"
              onClick={onToggle}
              title="Hide telemetry panels"
            >
              ✕
            </button>
          </div>
        </div>

        {/* TIRE COMPOUND SECTION */}
        <div className="side-section" id="side-tire-section">
          <div className="side-sec-title">
            <span>TIRES · COMPOUND</span>
            <button
              onClick={handlePitStop}
              style={{ background: 'none', border: 'none', color: 'var(--neon-lime)', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '10px', fontWeight: 800 }}
            >
              [P] PIT STOP
            </button>
          </div>
          <div className="side-status-box" id="side-tire-status">
            OPTIMAL {avgT}°C · {Math.round(overallGrip * 100)}% GRIP
          </div>

          <div className="tire-grid-wrap">
            <div className="tire-chassis-outline">
              {[
                { id: 'tire-fl', pos: 'FL', t: fl },
                { id: 'tire-fr', pos: 'FR', t: fr },
                { id: 'tire-rl', pos: 'RL', t: rl },
                { id: 'tire-rr', pos: 'RR', t: rr },
              ].map(({ id, pos, t }) => {
                const c = getTireClass(t.temp);
                const life = Math.round((1 - t.wear) * 100);
                return (
                  <div key={id} className={`tire-card ${c}`} id={id}>
                    <div className="tire-card-header">
                      <span className="tire-pos">{pos}</span>
                      <span className="tire-temp">{Math.round(t.temp)}°C</span>
                    </div>
                    <div className="tire-life-bar">
                      <div className="tire-life-fill" style={{ width: `${life}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="side-divider" />

        {/* ERS SECTION */}
        <div className="side-section" id="side-ers-section">
          <div className="side-sec-title">
            <span>ENERGY · HYBRID MGU-K</span>
            <span className="key-hint">KEY [SHIFT]</span>
          </div>
          <div className="side-status-box" id="side-ers-status">
            {carState.isBoosting ? 'OVERTAKE BOOST ACTIVE' : 'ERS READY'}
          </div>

          <div className="ers-bar-wrap" style={{ margin: '8px 0' }}>
            <div className="ers-grid-cells" style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '3px' }}>
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className={`ers-cell ${i < ersCellsActive ? 'active' : ''}`}
                  id={`ers-cell-${i + 1}`}
                  style={{
                    height: '14px',
                    background: i < ersCellsActive ? (carState.isBoosting ? '#ff3b30' : 'var(--neon-lime)') : '#222',
                    border: '1px solid #111',
                    boxShadow: i < ersCellsActive ? (carState.isBoosting ? '0 0 6px #ff3b30' : '0 0 6px rgba(200,255,46,0.6)') : 'none',
                    transition: 'all 0.1s ease',
                  }}
                />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#888', marginTop: '4px' }}>
              <span>BATTERY CAPACITY</span>
              <span style={{ color: 'var(--neon-lime)', fontWeight: 800 }}>{Math.round(carState.ersCharge)}%</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
