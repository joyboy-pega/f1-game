'use client';

import React from 'react';
import { useGameStore } from '@/lib/game/store';
import { ControlsHint } from './hud/ControlsHint';
import { DriverCluster } from './hud/DriverCluster';
import { LapChip } from './hud/LapChip';
import { StartLights } from './hud/StartLights';
import { TimingTower } from './hud/TimingTower';
import { Toasts } from './hud/Toasts';

/**
 * Low-chrome race HUD. Budget: timing tower (top-left), lap chip (top-right),
 * driver cluster (bottom-right) plus the minimap (bottom-left, mounted separately).
 * The centre and lower-middle stay clear; start lights, toasts and the controls
 * hint are transient.
 */
export function HUD() {
  const setPaused = useGameStore((s) => s.setPaused);
  const telemetryOpen = useGameStore((s) => s.telemetryOpen || s.settings.showTelemetry);
  const toggleTelemetry = useGameStore((s) => s.toggleTelemetry);

  return (
    <div className="h-root">
      <TimingTower />
      <div className="h-topright">
        <LapChip />
        <button
          type="button"
          className={`h-pause h-tele-btn${telemetryOpen ? ' active' : ''}`}
          onClick={toggleTelemetry}
          aria-label="Toggle Telemetry (T)"
          title="Toggle Telemetry (T)"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 13h4l3-8 4 14 3-6h4" />
          </svg>
        </button>
        <button type="button" className="h-pause" onClick={() => setPaused(true)} aria-label="Pause (Esc)" title="Pause (Esc)">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <rect x="6" y="5" width="4" height="14" fill="currentColor" />
            <rect x="14" y="5" width="4" height="14" fill="currentColor" />
          </svg>
        </button>
      </div>
      <StartLights />
      <Toasts />
      <DriverCluster />
      <ControlsHint />
    </div>
  );
}
