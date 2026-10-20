'use client';

import React from 'react';

export function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950 p-6 select-none font-mono text-center">
      <div className="w-full max-w-md flex flex-col items-center gap-6">
        {/* Title */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-cyan-400 uppercase tracking-widest">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            FORMULA V RACING SIMULATION
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-wider">
            BUDDH GP
          </h1>
          <div className="text-xs text-slate-400">
            Jaypee Sports City · 5.125 km · 16 Turns
          </div>
        </div>

        {/* Animated Loading Bar */}
        <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800 p-0.5">
          <div className="h-full bg-gradient-to-r from-cyan-500 via-amber-400 to-red-500 rounded-full w-2/3 animate-pulse" />
        </div>

        {/* Telemetry Tip */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 text-xs text-slate-300 flex flex-col gap-1 w-full text-left">
          <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">
            PRO RACER TELEMETRY TIP
          </span>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Keep your tires in the optimal 85°C–105°C thermal window. Excessive drifting heats the rear tires and accelerates degradation. Use [SHIFT] on straights for ERS electric boost!
          </p>
        </div>

        <div className="text-[10px] text-slate-500 uppercase tracking-widest">
          INITIALIZING NEXT.JS 3D CANVAS & RAPIER PHYSICS...
        </div>
      </div>
    </div>
  );
}
