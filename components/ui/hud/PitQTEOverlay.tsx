'use client';

import React, { useEffect, useCallback } from 'react';
import { useGameStore } from '@/lib/game/store';
import { world } from '@/lib/game/sim/world';

export function PitQTEOverlay() {
  const pitService = useGameStore((s) => s.hud.pitService);

  const handleTrigger = useCallback(() => {
    if (!pitService?.active || pitService.qteResult !== null) return;
    world.triggerPitReaction();
  }, [pitService]);

  useEffect(() => {
    if (!pitService?.active || pitService.qteResult !== null) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === ' ' || e.code === 'Enter') {
        e.preventDefault();
        handleTrigger();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pitService, handleTrigger]);

  if (!pitService?.active) return null;

  const totalTime = pitService.serviceTime || 2.5;
  const elapsed = Math.min(totalTime, pitService.stationary);
  const progressPct = Math.min(100, Math.max(0, (elapsed / totalTime) * 100));
  const targetPct = (pitService.qteTarget / totalTime) * 100;
  const windowWidthPct = (0.35 / totalTime) * 100;

  const result = pitService.qteResult;

  return (
    <div
      className="pit-qte-container"
      onClick={handleTrigger}
      role="button"
      tabIndex={0}
      aria-label="Pit Stop Reaction Release Trigger"
      style={{
        position: 'absolute',
        bottom: '22%',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 50,
        width: 'min(92vw, 420px)',
        background: 'rgba(11, 15, 22, 0.92)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        padding: '16px 20px',
        color: '#ffffff',
        cursor: result ? 'default' : 'pointer',
        clipPath: 'polygon(0 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              borderRadius: '50%',
              backgroundColor: result ? (result === 'perfect' ? '#00e5ff' : result === 'good' ? '#c8ff2e' : result === 'early' ? '#ff3b30' : '#ffcc00') : '#ff3b30',
              boxShadow: '0 0 8px currentColor',
            }}
          />
          <span style={{ fontFamily: 'var(--font-archivo, sans-serif)', fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            PIT SERVICE REACTION
          </span>
        </div>
        <span style={{ fontFamily: 'var(--font-jetbrains, monospace)', fontSize: 14, color: '#c8ff2e' }}>
          {(Math.max(0, totalTime - elapsed)).toFixed(1)}s
        </span>
      </div>

      {/* Timing Meter Track */}
      <div
        style={{
          position: 'relative',
          height: 24,
          backgroundColor: 'rgba(255, 255, 255, 0.08)',
          borderRadius: 4,
          overflow: 'hidden',
          marginBottom: 12,
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        {/* Target Green Release Window */}
        <div
          style={{
            position: 'absolute',
            left: `${Math.max(0, targetPct - windowWidthPct / 2)}%`,
            width: `${windowWidthPct}%`,
            height: '100%',
            backgroundColor: 'rgba(200, 255, 46, 0.35)',
            borderLeft: '2px solid #c8ff2e',
            borderRight: '2px solid #c8ff2e',
            boxShadow: '0 0 10px rgba(200, 255, 46, 0.4)',
          }}
        />

        {/* Current Progress Fill */}
        <div
          style={{
            height: '100%',
            width: `${progressPct}%`,
            backgroundColor: result === 'perfect' ? '#00e5ff' : result === 'good' ? '#c8ff2e' : result === 'early' ? '#ff3b30' : '#ffffff',
            opacity: 0.85,
            transition: 'width 0.05s linear',
          }}
        />

        {/* Perfect Sweet Spot Line */}
        <div
          style={{
            position: 'absolute',
            left: `${targetPct}%`,
            top: 0,
            bottom: 0,
            width: 2,
            backgroundColor: '#ffffff',
            boxShadow: '0 0 6px #ffffff',
          }}
        />
      </div>

      {/* Action / Result Feedback */}
      <div style={{ textAlign: 'center' }}>
        {!result ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontFamily: 'var(--font-anton, sans-serif)', fontSize: 18, letterSpacing: '0.05em', color: '#c8ff2e' }}>
              RELEASE JACKS [SPACE]
            </span>
            <span style={{ fontFamily: 'var(--font-archivo, sans-serif)', fontSize: 11, color: '#8e9aa8' }}>
              HIT THE GREEN ZONE FOR FASTEST STOP
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                fontFamily: 'var(--font-anton, sans-serif)',
                fontSize: 20,
                letterSpacing: '0.05em',
                color: result === 'perfect' ? '#00e5ff' : result === 'good' ? '#c8ff2e' : result === 'early' ? '#ff3b30' : '#ffcc00',
              }}
            >
              {result === 'perfect' ? 'PERFECT RELEASE! -0.6s' : result === 'good' ? 'CLEAN RELEASE! -0.25s' : result === 'early' ? 'FALSE START! +0.8s' : 'LATE RELEASE'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
