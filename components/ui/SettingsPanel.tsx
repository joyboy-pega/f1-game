'use client';

import React from 'react';
import type { CameraViewMode, QualityChoice, WeatherType } from '@/lib/game/gameState';
import { useGameStore } from '@/lib/game/store';
import { Field, Seg, Slider, Switch } from './kit';
import { useMounted } from './format';
import { DEFAULT_SETTINGS } from '@/lib/game/gameState';
import { DEFAULT_SETUP } from '@/lib/game/sim/rules';

const CAMERAS: { value: CameraViewMode; label: string }[] = [
  { value: 'chase', label: 'Chase' },
  { value: 'tcam', label: 'T-cam' },
  { value: 'cockpit', label: 'Cockpit' },
  { value: 'hood', label: 'Hood' },
];

const QUALITIES: { value: QualityChoice; label: string }[] = [
  { value: 'AUTO', label: 'Auto' },
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Med' },
  { value: 'HIGH', label: 'High' },
];

const WEATHERS: { value: WeatherType; label: string }[] = [
  { value: 'sunny', label: 'Sunny' },
  { value: 'cloudy', label: 'Cloudy' },
  { value: 'rain', label: 'Rain' },
  { value: 'snow', label: 'Snow' },
  { value: 'dynamic', label: 'Dynamic' },
];

/** Live-tunable settings. Used in the pause menu and the lobby; reads and writes the persisted store. */
export function SettingsPanel() {
  const mounted = useMounted();
  const stored = useGameStore((s) => s.settings);
  const set = useGameStore((s) => s.setSettings);
  const resolvedQuality = useGameStore((s) => s.quality);
  const s = mounted ? stored : DEFAULT_SETTINGS;
  const setAssist = (patch: Partial<typeof s.assists>) => set({ assists: { ...s.assists, ...patch } });

  return (
    <div className="k-settings">
      <h3 className="k-section-title">Track conditions</h3>
      <Field label="Weather" hint={s.weather === 'rain' ? 'Wet track with rooster tails and reduced grip' : s.weather === 'snow' ? 'Snowy circuit with reduced traction' : undefined}>
        <Seg label="Weather conditions" value={s.weather} options={WEATHERS} onChange={(v) => set({ weather: v })} />
      </Field>

      <h3 className="k-section-title">Audio</h3>
      <Field label="Sound">
        <Switch checked={s.audioEnabled} onChange={(v) => set({ audioEnabled: v })} label="Sound enabled" />
      </Field>
      <Field label="Volume" value={`${Math.round(s.volume * 100)}%`}>
        <Slider label="Volume" min={0} max={1} step={0.05} value={s.volume} onChange={(v) => set({ volume: v })} />
      </Field>

      <h3 className="k-section-title">Graphics &amp; view</h3>
      <Field label="Quality" hint={s.quality === 'AUTO' ? `Auto is running ${resolvedQuality}` : undefined}>
        <Seg label="Graphics quality" value={s.quality} options={QUALITIES} onChange={(v) => set({ quality: v })} />
      </Field>
      <Field label="Camera">
        <Seg label="Camera view" value={s.cameraView} options={CAMERAS} onChange={(v) => set({ cameraView: v })} />
      </Field>

      <h3 className="k-section-title">HUD</h3>
      <Field label="Minimap">
        <Switch checked={s.showMinimap} onChange={(v) => set({ showMinimap: v })} label="Show minimap" />
      </Field>
      <Field label="Telemetry">
        <Switch checked={s.showTelemetry} onChange={(v) => set({ showTelemetry: v })} label="Show telemetry drawer" />
      </Field>
      <Field label="Ghost car">
        <Switch checked={s.showGhost} onChange={(v) => set({ showGhost: v })} label="Show ghost car in time trial" />
      </Field>

      <h3 className="k-section-title">Assists</h3>
      <Field label="Racing line">
        <Seg
          label="Racing line"
          value={s.assists.racingLine}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'corners', label: 'Corners' },
            { value: 'full', label: 'Full' },
          ]}
          onChange={(v) => setAssist({ racingLine: v })}
        />
      </Field>
      <Field label="Braking assist">
        <Switch checked={s.assists.brakingAssist} onChange={(v) => setAssist({ brakingAssist: v })} label="Braking assist" />
      </Field>
      <Field label="Steering assist">
        <Switch checked={s.assists.steeringAssist} onChange={(v) => setAssist({ steeringAssist: v })} label="Steering assist" />
      </Field>
      <Field label="Traction control">
        <Switch checked={s.assists.tractionControl} onChange={(v) => setAssist({ tractionControl: v })} label="Traction control" />
      </Field>
      <Field label="Anti-lock brakes (ABS)">
        <Switch checked={s.assists.abs ?? true} onChange={(v) => setAssist({ abs: v })} label="ABS" />
      </Field>
      <Field label="Stability assist">
        <Switch checked={s.assists.stabilityControl ?? true} onChange={(v) => setAssist({ stabilityControl: v })} label="Stability control" />
      </Field>

      <h3 className="k-section-title">Technical Regulations</h3>
      <Field label="Formula Rules" hint={s.regulations === '2026' ? '2026: Active aero straight mode, overtake boost, 768kg min weight' : '2022-25: Ground-effect venturi floors and conventional DRS flaps'}>
        <Seg
          label="Technical Regulations"
          value={s.regulations ?? '2022'}
          options={[
            { value: '2022', label: '2022–25 (DRS)' },
            { value: '2026', label: '2026 (Active Aero)' },
          ]}
          onChange={(v) => set({ regulations: v })}
        />
      </Field>

      <h3 className="k-section-title">Car Setup &amp; Aerodynamics</h3>
      <Field label="Aero / Downforce">
        <Seg
          label="Aero preset"
          value={s.setup?.aeroPreset ?? 'medium'}
          options={[
            { value: 'low', label: 'Low (Speed)' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High (Cornering)' },
          ]}
          onChange={(v) => set({ setup: { ...(s.setup ?? DEFAULT_SETUP), aeroPreset: v } })}
        />
      </Field>
      <Field label="Brake Bias" value={`${Math.round(s.setup?.brakeBias ?? 56)}% Front`}>
        <Slider
          label="Brake Bias"
          min={50}
          max={65}
          step={1}
          value={s.setup?.brakeBias ?? 56}
          onChange={(v) => set({ setup: { ...(s.setup ?? DEFAULT_SETUP), brakeBias: v } })}
        />
      </Field>
      <Field label="Differential Lock" value={`${Math.round(s.setup?.diffOnThrottle ?? 70)}%`}>
        <Slider
          label="Differential Lock"
          min={30}
          max={90}
          step={5}
          value={s.setup?.diffOnThrottle ?? 70}
          onChange={(v) => set({ setup: { ...(s.setup ?? DEFAULT_SETUP), diffOnThrottle: v } })}
        />
      </Field>
      <Field label="Ride Height" value={`${Math.round((s.setup?.rideHeightM ?? 0.030) * 1000)} mm`}>
        <Slider
          label="Ride Height"
          min={0.025}
          max={0.045}
          step={0.001}
          value={s.setup?.rideHeightM ?? 0.030}
          onChange={(v) => set({ setup: { ...(s.setup ?? DEFAULT_SETUP), rideHeightM: v } })}
        />
      </Field>
      <Field label="Tyre Pressure" value={`${(s.setup?.tirePressureBar ?? 1.5).toFixed(2)} bar`}>
        <Slider
          label="Tyre Pressure"
          min={1.3}
          max={1.8}
          step={0.05}
          value={s.setup?.tirePressureBar ?? 1.5}
          onChange={(v) => set({ setup: { ...(s.setup ?? DEFAULT_SETUP), tirePressureBar: v } })}
        />
      </Field>

      <h3 className="k-section-title">Handling</h3>
      <Field
        label="Driving mechanics"
        hint={
          (s.drivingModel ?? 'casual') === 'hardcore'
            ? 'Hardcore: Realistic 2-DOF bicycle dynamics, Pacejka tyre curves & weight transfer'
            : 'Casual: Arcade handling, responsive drifting & easy steering (default)'
        }
      >
        <Seg<'casual' | 'hardcore'>
          label="Driving mechanics"
          value={s.drivingModel ?? 'casual'}
          options={[
            { value: 'casual', label: 'Casual' },
            { value: 'hardcore', label: 'Hardcore' },
          ]}
          onChange={(v) => set({ drivingModel: v })}
        />
      </Field>
      <Field label="Steering sens." value={`${s.steeringSensitivity.toFixed(2)}x`}>
        <Slider label="Steering sensitivity" min={0.6} max={1.6} step={0.05} value={s.steeringSensitivity} onChange={(v) => set({ steeringSensitivity: v })} />
      </Field>
      <Field label="Brake force" value={`${s.brakeForce.toFixed(2)}x`}>
        <Slider label="Brake force" min={0.6} max={1.6} step={0.05} value={s.brakeForce} onChange={(v) => set({ brakeForce: v })} />
      </Field>
    </div>
  );
}
