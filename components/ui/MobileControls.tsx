'use client';

import React, { useState, useCallback } from 'react';
import { controls, ControlHold, ControlTrigger } from '@/lib/game/controls';

/**
 * Mobile touch driving controls using the unified `.mc-*` HUD CSS system.
 * Matches Buddh GP & Simulart Tracks design tokens, with zero conflicting Tailwind styling.
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
        set(true);
      },
      onPointerUp: (e: React.PointerEvent) => {
        e.preventDefault();
        set(false);
      },
      onPointerLeave: (e: React.PointerEvent) => {
        e.preventDefault();
        set(false);
      },
      onPointerCancel: (e: React.PointerEvent) => {
        e.preventDefault();
        set(false);
      },
    };
  }, []);

  return (
    <div className="mc" aria-label="Touch driving controls">
      {/* Left: Steering Pad */}
      <div className="mc-left">
        <button
          type="button"
          {...bindControl('steerLeft')}
          className={`mc-btn mc-steer ${activeControls['steerLeft'] ? 'on' : ''}`}
          aria-label="Steer Left"
        >
          ◀
        </button>
        <button
          type="button"
          {...bindControl('steerRight')}
          className={`mc-btn mc-steer ${activeControls['steerRight'] ? 'on' : ''}`}
          aria-label="Steer Right"
        >
          ▶
        </button>
      </div>

      {/* Right: Aux Row (DRS, ERS, Drift) + Pedals (Brake, Gas) */}
      <div className="mc-right">
        <div className="mc-aux">
          <button
            type="button"
            {...bindControl('drsToggleRequested')}
            className={`mc-btn mc-small ${activeControls['drsToggleRequested'] ? 'on' : ''}`}
            aria-label="Toggle DRS"
            style={{
              borderColor: 'var(--green, #00d26a)',
              color: activeControls['drsToggleRequested'] ? '#000' : 'var(--green, #00d26a)',
            }}
          >
            DRS
          </button>
          <button
            type="button"
            {...bindControl('ersBoost')}
            className={`mc-btn mc-small ${activeControls['ersBoost'] ? 'on' : ''}`}
            aria-label="Deploy ERS"
            style={{
              borderColor: 'var(--purple, #b36bff)',
              color: activeControls['ersBoost'] ? '#000' : 'var(--purple, #b36bff)',
            }}
          >
            ERS
          </button>
          <button
            type="button"
            {...bindControl('handbrake')}
            className={`mc-btn mc-small ${activeControls['handbrake'] ? 'on' : ''}`}
            aria-label="Handbrake Drift"
            style={{
              borderColor: 'var(--orange, #ff6b1a)',
              color: activeControls['handbrake'] ? '#000' : 'var(--orange, #ff6b1a)',
            }}
          >
            DRIFT
          </button>
        </div>

        <div className="mc-pedals">
          <button
            type="button"
            {...bindControl('brake')}
            className={`mc-btn mc-brake ${activeControls['brake'] ? 'on' : ''}`}
            aria-label="Brake"
          >
            <span>▼</span>
            <small>BRAKE</small>
          </button>
          <button
            type="button"
            {...bindControl('throttle')}
            className={`mc-btn mc-gas ${activeControls['throttle'] ? 'on' : ''}`}
            aria-label="Throttle"
          >
            <span>▲</span>
            <small>GAS</small>
          </button>
        </div>
      </div>
    </div>
  );
}
