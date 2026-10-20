'use client';

import React from 'react';
import { controls, ControlState } from '@/lib/game/controls';

export function MobileControls() {
  const bindControl = (action: keyof ControlState) => {
    return {
      onPointerDown: (e: React.PointerEvent) => {
        e.preventDefault();
        controls.setVirtualControl(action, true);
      },
      onPointerUp: (e: React.PointerEvent) => {
        e.preventDefault();
        controls.setVirtualControl(action, false);
      },
      onPointerLeave: (e: React.PointerEvent) => {
        e.preventDefault();
        controls.setVirtualControl(action, false);
      },
      onPointerCancel: (e: React.PointerEvent) => {
        e.preventDefault();
        controls.setVirtualControl(action, false);
      },
    };
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 pointer-events-none select-none p-3 sm:p-5 flex justify-between items-end">
      {/* Left Steering Pad: Steer Left & Steer Right */}
      <div className="pointer-events-auto flex items-center gap-3">
        <button
          {...bindControl('steerLeft')}
          className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-slate-900/80 active:bg-cyan-500/30 border border-slate-700/80 text-white font-black text-2xl flex items-center justify-center shadow-2xl backdrop-blur-md transition-transform active:scale-95 touch-none"
          aria-label="Steer Left"
        >
          ◀
        </button>
        <button
          {...bindControl('steerRight')}
          className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-slate-900/80 active:bg-cyan-500/30 border border-slate-700/80 text-white font-black text-2xl flex items-center justify-center shadow-2xl backdrop-blur-md transition-transform active:scale-95 touch-none"
          aria-label="Steer Right"
        >
          ▶
        </button>
      </div>

      {/* Center Aux: Handbrake, DRS, ERS Boost */}
      <div className="pointer-events-auto flex items-center gap-2 mb-1">
        <button
          {...bindControl('drsToggleRequested')}
          className="w-12 h-12 rounded-xl bg-emerald-600/80 active:bg-emerald-500 border border-emerald-400 text-white font-mono font-bold text-xs flex items-center justify-center shadow-xl backdrop-blur-md active:scale-95 touch-none"
          aria-label="DRS Flap Toggle"
        >
          DRS
        </button>
        <button
          {...bindControl('ersBoost')}
          className="w-12 h-12 rounded-xl bg-purple-600/80 active:bg-purple-500 border border-purple-400 text-white font-mono font-bold text-xs flex items-center justify-center shadow-xl backdrop-blur-md active:scale-95 touch-none"
          aria-label="ERS Hybrid Boost"
        >
          ERS
        </button>
        <button
          {...bindControl('handbrake')}
          className="w-12 h-12 rounded-xl bg-amber-600/80 active:bg-amber-500 border border-amber-400 text-white font-mono font-bold text-xs flex items-center justify-center shadow-xl backdrop-blur-md active:scale-95 touch-none"
          aria-label="Handbrake Drift"
        >
          DRIFT
        </button>
      </div>

      {/* Right Pedals: Throttle & Brake/Reverse */}
      <div className="pointer-events-auto flex items-center gap-3">
        <button
          {...bindControl('brake')}
          className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-red-600/80 active:bg-red-500 border border-red-400 text-white font-black text-xl flex flex-col items-center justify-center shadow-2xl backdrop-blur-md transition-transform active:scale-95 touch-none"
          aria-label="Brake or Reverse"
        >
          <span>▼</span>
          <span className="text-[9px] font-mono font-bold -mt-1">BRAKE</span>
        </button>
        <button
          {...bindControl('throttle')}
          className="w-16 h-20 sm:w-20 sm:h-24 rounded-2xl bg-emerald-600/85 active:bg-emerald-500 border border-emerald-400 text-white font-black text-2xl flex flex-col items-center justify-center shadow-2xl backdrop-blur-md transition-transform active:scale-95 touch-none"
          aria-label="Throttle Accelerate"
        >
          <span>▲</span>
          <span className="text-[10px] font-mono font-bold -mt-1">GAS</span>
        </button>
      </div>
    </div>
  );
}
