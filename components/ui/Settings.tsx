'use client';

import React from 'react';
import { GameSettings, WeatherType, CameraViewMode, VehicleModelType } from '@/lib/game/gameState';
import { audio } from '@/lib/game/audio';
import { performanceGovernor, QualityLevel } from '@/lib/game/performance';

interface SettingsProps {
  settings: GameSettings;
  onUpdateSettings: (newSettings: Partial<GameSettings>) => void;
  isOpen: boolean;
  onClose: () => void;
}

export function Settings({ settings, onUpdateSettings, isOpen, onClose }: SettingsProps) {
  if (!isOpen) return null;

  const currentQuality = performanceGovernor.isManual()
    ? performanceGovernor.getSettings().level
    : 'AUTO';

  const handleQualityChange = (q: QualityLevel | 'AUTO') => {
    performanceGovernor.setQuality(q);
    onUpdateSettings({}); // trigger re-render
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md select-none font-mono">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg p-5 shadow-2xl flex flex-col gap-4 text-xs max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
          <div className="text-base font-black text-white tracking-wider flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
            GAME & VEHICLE SETTINGS
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold"
          >
            ✕
          </button>
        </div>

        {/* Graphics Quality */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-slate-300 flex justify-between">
            <span>GRAPHICS QUALITY</span>
            <span className="text-cyan-400 font-extrabold">{currentQuality}</span>
          </label>
          <div className="grid grid-cols-4 gap-2">
            {(['AUTO', 'LOW', 'MEDIUM', 'HIGH'] as const).map((q) => (
              <button
                key={q}
                onClick={() => handleQualityChange(q)}
                className={`py-1.5 rounded-lg border font-bold transition text-center ${
                  currentQuality === q
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750'
                }`}
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Audio Volume */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-center text-[11px] font-bold text-slate-300">
            <span>AUDIO VOLUME</span>
            <button
              onClick={() => {
                const en = audio.toggleAudio();
                onUpdateSettings({ audioEnabled: en });
              }}
              className="text-[10px] text-cyan-400 hover:underline"
            >
              {settings.audioEnabled ? 'MUTE SOUND' : 'UNMUTE SOUND'}
            </button>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={settings.volume}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              audio.setVolume(v);
              onUpdateSettings({ volume: v });
            }}
            className="w-full accent-cyan-400 cursor-pointer"
          />
        </div>

        {/* Weather Conditions */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-slate-300">CIRCUIT WEATHER</label>
          <div className="grid grid-cols-4 gap-2">
            {(['sunny', 'cloudy', 'rain', 'snow'] as WeatherType[]).map((w) => (
              <button
                key={w}
                onClick={() => onUpdateSettings({ weather: w })}
                className={`py-1.5 rounded-lg border font-bold uppercase transition text-center ${
                  settings.weather === w
                    ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750'
                }`}
              >
                {w}
              </button>
            ))}
          </div>
        </div>

        {/* Camera Mode */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-bold text-slate-300">DEFAULT CAMERA VIEW</label>
          <div className="grid grid-cols-4 gap-2">
            {(['chase', 'cockpit', 'tcam', 'hood'] as CameraViewMode[]).map((cam) => (
              <button
                key={cam}
                onClick={() => onUpdateSettings({ cameraView: cam })}
                className={`py-1.5 rounded-lg border font-bold uppercase transition text-center ${
                  settings.cameraView === cam
                    ? 'bg-purple-500/20 border-purple-400 text-purple-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750'
                }`}
              >
                {cam}
              </button>
            ))}
          </div>
        </div>

        {/* Vehicle Physics Sliders */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800">
          <div>
            <label className="text-[10px] font-bold text-slate-400 flex justify-between">
              <span>STEERING SENSITIVITY</span>
              <span className="text-white">{settings.steeringSensitivity.toFixed(1)}x</span>
            </label>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              value={settings.steeringSensitivity}
              onChange={(e) => onUpdateSettings({ steeringSensitivity: parseFloat(e.target.value) })}
              className="w-full accent-cyan-400 cursor-pointer mt-1"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-slate-400 flex justify-between">
              <span>BRAKE FORCE DEPRESSION</span>
              <span className="text-white">{settings.brakeForce.toFixed(1)}x</span>
            </label>
            <input
              type="range"
              min="0.7"
              max="1.5"
              step="0.05"
              value={settings.brakeForce}
              onChange={(e) => onUpdateSettings({ brakeForce: parseFloat(e.target.value) })}
              className="w-full accent-cyan-400 cursor-pointer mt-1"
            />
          </div>
        </div>

        {/* Controls Reference */}
        <div className="bg-slate-950/70 rounded-xl p-3 border border-slate-800 text-[10px] text-slate-400 flex flex-col gap-1">
          <div className="font-bold text-slate-300 mb-1">RACING CONTROLS SHORTCUTS</div>
          <div className="flex justify-between"><span>↑ / W · Throttle</span><span>↓ / S · Brake / Reverse</span></div>
          <div className="flex justify-between"><span>← / A · Steer Left</span><span>→ / D · Steer Right</span></div>
          <div className="flex justify-between"><span>SPACE · Handbrake Drift</span><span>SHIFT · ERS Overtake Boost</span></div>
          <div className="flex justify-between"><span>F / E · DRS Flap Toggle</span><span>[ / ] · Adjust Brake Bias</span></div>
          <div className="flex justify-between"><span>P · Pit Stop Fresh Tires</span><span>C · Cycle Camera Mode</span></div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black tracking-wider uppercase transition shadow-lg mt-1"
        >
          SAVE & CLOSE
        </button>
      </div>
    </div>
  );
}
