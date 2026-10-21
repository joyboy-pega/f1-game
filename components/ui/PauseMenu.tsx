'use client';

import React from 'react';
import Link from 'next/link';
import { WeatherType } from '@/lib/game/gameState';
import { useGameStore } from '@/lib/game/store';

interface PauseMenuProps {
  onResume: () => void;
  onRestart: () => void;
  onExitToMenu: () => void;
}

export function PauseMenu({ onResume, onRestart, onExitToMenu }: PauseMenuProps) {
  const settings = useGameStore((s) => s.settings);
  const onUpdateSettings = useGameStore((s) => s.setSettings);

  return (
    <section id="race-menu" aria-label="Race menu">
      <div className="menu-heading">
        <div>
          <h2>
            SETTINGS &amp; PAUSE <span className="menu-status-badge" id="menu-status-badge">PAUSED</span>
          </h2>
          <p id="menu-status">
            Race paused · Buddh International Circuit · Made by Arigatoo Club for fun
          </p>
        </div>
        <button
          className="menu-close"
          id="menu-close-btn"
          type="button"
          onClick={onResume}
          aria-label="Close race menu"
        >
          ✕ CLOSE
        </button>
      </div>

      {/* CONTROLS LIST */}
      <div className="menu-section">
        <h3>Formula V Controls</h3>
        <div className="control-list">
          <div className="control-row">
            <span>Throttle / Accelerate</span>
            <div className="keycaps">
              <span className="keycap">↑</span>
              <span className="keycap">W</span>
            </div>
          </div>
          <div className="control-row">
            <span>Brake / Reverse</span>
            <div className="keycaps">
              <span className="keycap">↓</span>
              <span className="keycap">S</span>
            </div>
          </div>
          <div className="control-row">
            <span>Steering Left / Right</span>
            <div className="keycaps">
              <span className="keycap">←</span>
              <span className="keycap">→</span>
              <span className="keycap">A</span>
              <span className="keycap">D</span>
            </div>
          </div>
          <div className="control-row">
            <span>Handbrake Power Drift</span>
            <div className="keycaps">
              <span className="keycap">SPACE</span>
            </div>
          </div>
          <div className="control-row">
            <span>ERS Overtake Boost</span>
            <div className="keycaps">
              <span className="keycap">SHIFT</span>
            </div>
          </div>
          <div className="control-row">
            <span>DRS Rear Wing Flap</span>
            <div className="keycaps">
              <span className="keycap">F</span>
              <span className="keycap">E</span>
            </div>
          </div>
          <div className="control-row">
            <span>Brake Balance F/R</span>
            <div className="keycaps">
              <span className="keycap">[</span>
              <span className="keycap">]</span>
            </div>
          </div>
          <div className="control-row">
            <span>Pit Stop Fresh Tires</span>
            <div className="keycaps">
              <span className="keycap">P</span>
            </div>
          </div>
        </div>
      </div>

      {/* TUNING SLIDERS */}
      <div className="menu-section">
        <h3>Vehicle Tuning &amp; Physics</h3>
        <div className="setting-row">
          <label htmlFor="menu-steer-sens">Steering Sensitivity</label>
          <output>{settings.steeringSensitivity.toFixed(1)}x</output>
          <input
            id="menu-steer-sens"
            type="range"
            min="0.6"
            max="1.6"
            step="0.05"
            value={settings.steeringSensitivity}
            onChange={(e) => onUpdateSettings({ steeringSensitivity: parseFloat(e.target.value) })}
          />
        </div>

        <div className="setting-row">
          <label htmlFor="menu-brake-force">Brake Depression Force</label>
          <output>{settings.brakeForce.toFixed(1)}x</output>
          <input
            id="menu-brake-force"
            type="range"
            min="0.7"
            max="1.5"
            step="0.05"
            value={settings.brakeForce}
            onChange={(e) => onUpdateSettings({ brakeForce: parseFloat(e.target.value) })}
          />
        </div>
      </div>

      {/* WEATHER SELECTOR */}
      <div className="menu-section">
        <h3>Dynamic Weather</h3>
        <div className="menu-weather-grid">
          {[
            { id: 'sunny', label: '☀️ Sunny Daylight', desc: 'Optimal dry tarmac grip' },
            { id: 'cloudy', label: '☁️ Overcast Cloudy', desc: 'Cooler track surface' },
            { id: 'rain', label: '🌧️ Wet Monsoon Rain', desc: 'Slick shiny reflective tarmac' },
            { id: 'snow', label: '❄️ Winter Snowstorm', desc: 'Freezing low grip ice' },
          ].map((w) => (
            <button
              key={w.id}
              type="button"
              className={`btn-weather-select ${settings.weather === w.id ? 'active' : ''}`}
              onClick={() => onUpdateSettings({ weather: w.id as WeatherType })}
            >
              <span style={{ fontWeight: 800 }}>{w.label}</span>
              <span style={{ fontSize: '10px', color: '#888' }}>{w.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ACTION BUTTONS */}
      <div className="menu-actions">
        <button
          className="btn-menu btn-menu-primary"
          id="btn-resume"
          type="button"
          onClick={onResume}
        >
          RESUME RACE [ESC]
        </button>
        <button
          className="btn-menu btn-menu-secondary"
          id="btn-restart"
          type="button"
          onClick={onRestart}
        >
          RESTART CURRENT RACE
        </button>
        <button
          className="btn-menu btn-menu-exit"
          id="btn-exit-map"
          type="button"
          onClick={onExitToMenu}
        >
          EXIT TO HOME CIRCUIT MAP
        </button>
      </div>
    </section>
  );
}
