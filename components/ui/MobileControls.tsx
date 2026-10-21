'use client';

import React, { useState, useCallback } from 'react';
import { controls, ControlHold, ControlTrigger } from '@/lib/game/controls';

/**
 * Mobile touch driving controls using the ergonomic `.mc-*` HUD system.
 * Full-height pedals, responsive steering, DRS/ERS/DRIFT quick-triggers,
 * and zero obstruction of the race track.
 */
export function MobileControls() {
  const [activeControls, setActiveControls] = useState<Record<string, boolean>>({});

  const bindControl = useCallback((action: ControlHold | ControlTrigger) => {
    const isHold = (
      ['throttle', 'brake', 'steerLeft', 'steerRight', 'handbrake', 'ersBoost', 'lookBack'] as string[]
    ).includes(action);

    const set = (active: boolean) => {
      setActiveControls((prev) => (prev[action] === active ? prev : { ...prev, [action]: active }));
      if (isHold) {
        controls.setVirtualHold(action as ControlHold, active);
      } else if (active) {
        controls.fireTrigger(action as ControlTrigger);
      }
    };

    return {
      onPointerDown: (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        set(true);
      },
      onPointerUp: (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        set(false);
      },
      onPointerLeave: (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        set(false);
      },
      onPointerCancel: (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        set(false);
      },
    };
  }, []);

  return (
    <div className="mc" aria-label="Touch driving controls">
      {/* Left: Utility row (Camera & Drift) + Steering Pad */}
      <div className="mc-left">
        <div className="mc-aux">
          <button
            type="button"
            {...bindControl('cameraCycleRequested')}
            className={`mc-btn mc-small ${activeControls['cameraCycleRequested'] ? 'on' : ''}`}
            aria-label="Cycle Camera View"
            title="Cycle Camera View (C)"
            style={{
              borderColor: 'rgba(255, 255, 255, 0.35)',
              color: '#ffffff',
            }}
          >
            📷 CAM
          </button>
          <button
            type="button"
            {...bindControl('handbrake')}
            className={`mc-btn mc-small ${activeControls['handbrake'] ? 'on' : ''}`}
            aria-label="Handbrake Drift"
            title="Handbrake Drift"
            style={{
              borderColor: 'var(--orange, #ff6b1a)',
              color: activeControls['handbrake'] ? '#000' : 'var(--orange, #ff6b1a)',
            }}
          >
            DRIFT
          </button>
        </div>

        <div className="mc-steer-row">
          <button
            type="button"
            {...bindControl('steerLeft')}
            className={`mc-btn mc-steer ${activeControls['steerLeft'] ? 'on' : ''}`}
            aria-label="Steer Left"
          >
            <span className="mc-arrow">◀</span>
            <small>LEFT</small>
          </button>
          <button
            type="button"
            {...bindControl('steerRight')}
            className={`mc-btn mc-steer ${activeControls['steerRight'] ? 'on' : ''}`}
            aria-label="Steer Right"
          >
            <span className="mc-arrow">▶</span>
            <small>RIGHT</small>
          </button>
        </div>
      </div>

      {/* Right: Hybrid Systems (DRS & ERS Boost) + Matched Full-Height Pedals */}
      <div className="mc-right">
        <div className="mc-aux">
          <button
            type="button"
            {...bindControl('ersBoost')}
            className={`mc-btn mc-small ${activeControls['ersBoost'] ? 'on' : ''}`}
            aria-label="Deploy ERS Electric Boost"
            title="Deploy ERS Electric Boost"
            style={{
              borderColor: 'var(--purple, #b36bff)',
              color: activeControls['ersBoost'] ? '#000' : 'var(--purple, #b36bff)',
            }}
          >
            ⚡ ERS
          </button>
          <button
            type="button"
            {...bindControl('drsToggleRequested')}
            className={`mc-btn mc-small ${activeControls['drsToggleRequested'] ? 'on' : ''}`}
            aria-label="Toggle DRS Flap"
            title="Toggle DRS Flap"
            style={{
              borderColor: 'var(--green, #00d26a)',
              color: activeControls['drsToggleRequested'] ? '#000' : 'var(--green, #00d26a)',
            }}
          >
            🟢 DRS
          </button>
        </div>

        <div className="mc-pedals">
          <button
            type="button"
            {...bindControl('brake')}
            className={`mc-btn mc-brake ${activeControls['brake'] ? 'on' : ''}`}
            aria-label="Brake or Reverse"
          >
            <span className="mc-arrow">▼</span>
            <small>BRAKE</small>
          </button>
          <button
            type="button"
            {...bindControl('throttle')}
            className={`mc-btn mc-gas ${activeControls['throttle'] ? 'on' : ''}`}
            aria-label="Throttle Accelerate"
          >
            <span className="mc-arrow">▲</span>
            <small>GAS</small>
          </button>
        </div>
      </div>
    </div>
  );
}
