'use client';

import React, { useEffect, useState } from 'react';

import { getTrackCatalogEntry } from '@/lib/game/track';
import { useGameStore } from '@/lib/game/store';

const LOADING_STEPS = [
  'CALIBRATING 120 HZ SUBSTEP DYNAMICS',
  'COMPUTING CIRCUIT SPLINE & CORNER ARCS',
  'PRE-WARMING PROCEDURAL LIVERY SHADERS',
  'CONFIGURING TELEMETRY & AI GRID',
  'SYSTEMS CHECK COMPLETE · GRID READY',
];

const TELEMETRY_TIPS = [
  'Optimal tire operating window is 85°C–105°C. Overheating rears reduces traction out of slow corners.',
  'Deploy ERS on the 1.06 km back straight using [SHIFT] for an immediate 160 HP hybrid boost.',
  'Trail-brake deep into Turn 4 to rotate the car onto the late-apex kerb for maximum exit speed.',
  'DRS flap activation reduces aerodynamic drag by ~28% once you enter detection zones.',
];

export function LoadingScreen() {
  const [stepIdx, setStepIdx] = useState(0);
  const [tipIdx, setTipIdx] = useState(0);

  useEffect(() => {
    const stepInterval = setInterval(() => {
      setStepIdx((prev) => (prev < LOADING_STEPS.length - 1 ? prev + 1 : prev));
    }, 450);

    const tipInterval = setInterval(() => {
      setTipIdx((prev) => (prev + 1) % TELEMETRY_TIPS.length);
    }, 3200);

    return () => {
      clearInterval(stepInterval);
      clearInterval(tipInterval);
    };
  }, []);

  const progressPct = Math.min(100, Math.round(((stepIdx + 1) / LOADING_STEPS.length) * 100));

  const trackId = useGameStore((s) => s.settings.trackId);
  const trackInfo = getTrackCatalogEntry(trackId);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 select-none text-center"
      style={{
        backgroundColor: 'var(--ink, #0a0a0a)',
        color: 'var(--ink-text, #f4f4ee)',
        fontFamily: 'var(--font-ui, sans-serif)',
      }}
    >
      {/* Background Subtle Radial Glow */}
      <div
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
          background:
            'radial-gradient(circle at 50% 40%, rgba(200, 255, 46, 0.08) 0%, rgba(255, 107, 26, 0.04) 50%, transparent 75%)',
        }}
      />

      {/* Main Card */}
      <div
        className="relative z-10 w-full max-w-lg p-8 flex flex-col items-center gap-6"
        style={{
          background: 'var(--panel, rgba(9, 10, 12, 0.88))',
          border: '1px solid var(--edge, rgba(255, 255, 255, 0.16))',
          borderTop: '4px solid var(--lime, #c8ff2e)',
          clipPath:
            'polygon(0 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.75)',
        }}
      >
        {/* Brand Header */}
        <div className="flex flex-col items-center gap-1.5">
          <div
            className="flex items-center gap-2 text-[11px] font-bold tracking-[0.2em] uppercase"
            style={{ color: 'var(--lime, #c8ff2e)', fontFamily: 'var(--font-mono, monospace)' }}
          >
            <span
              className="w-2 h-2 rounded-full inline-block animate-ping"
              style={{ backgroundColor: 'var(--lime, #c8ff2e)' }}
            />
            ARIGATOO CLUB · SIMULATION
          </div>
          <h1
            className="text-4xl sm:text-5xl font-normal tracking-wide uppercase m-0 leading-none"
            style={{ fontFamily: 'var(--font-display, Anton, sans-serif)' }}
          >
            SIMULART TRACKS
          </h1>
          <div
            className="text-xs uppercase tracking-[0.16em]"
            style={{ color: 'var(--ink-mute, #8d9199)', fontFamily: 'var(--font-mono, monospace)' }}
          >
            {trackInfo.name} · {(trackInfo.lengthM / 1000).toFixed(3)} KM · {trackInfo.turns} Turns
          </div>
        </div>

        {/* Progress Container */}
        <div className="w-full flex flex-col gap-2">
          <div className="flex justify-between items-center text-[11px] tracking-wider font-mono">
            <span style={{ color: 'var(--ink-mute, #8d9199)' }}>
              {LOADING_STEPS[stepIdx]}
            </span>
            <span style={{ color: 'var(--lime, #c8ff2e)', fontWeight: 800 }}>
              {progressPct}%
            </span>
          </div>

          <div
            className="w-full h-2 rounded-full overflow-hidden p-0.5"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
            }}
          >
            <div
              className="h-full rounded-full transition-all duration-300 ease-out"
              style={{
                width: `${progressPct}%`,
                background:
                  'linear-gradient(90deg, var(--orange, #ff6b1a) 0%, var(--lime, #c8ff2e) 100%)',
                boxShadow: '0 0 12px var(--lime, #c8ff2e)',
              }}
            />
          </div>
        </div>

        {/* Telemetry Tip Box */}
        <div
          className="w-full p-4 text-left flex flex-col gap-1.5"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            clipPath:
              'polygon(0 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%)',
          }}
        >
          <div
            className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.18em] uppercase"
            style={{ color: 'var(--orange, #ff6b1a)', fontFamily: 'var(--font-mono, monospace)' }}
          >
            <span>⚡ RACE ENGINEER BRIEFING</span>
          </div>
          <p
            className="text-xs leading-relaxed m-0"
            style={{ color: 'var(--ink-text, #f4f4ee)', opacity: 0.9 }}
          >
            {TELEMETRY_TIPS[tipIdx]}
          </p>
        </div>

        {/* Status Indicator */}
        <div
          className="text-[10px] tracking-[0.2em] uppercase font-mono"
          style={{ color: 'var(--ink-dim, #5a5e66)' }}
        >
          CUSTOM ARCADE SIMULATOR · CLIENT ACCELERATED
        </div>
      </div>
    </div>
  );
}
