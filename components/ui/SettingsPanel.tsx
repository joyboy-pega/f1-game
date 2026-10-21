'use client';

import React from 'react';
import type { CameraViewMode, QualityChoice } from '@/lib/game/gameState';
import { useGameStore } from '@/lib/game/store';
import { Field, Seg, Slider, Switch } from './kit';
import { useMounted } from './format';
import { DEFAULT_SETTINGS } from '@/lib/game/gameState';

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

      <h3 className="k-section-title">Handling</h3>
      <Field label="Steering sens." value={`${s.steeringSensitivity.toFixed(2)}x`}>
        <Slider label="Steering sensitivity" min={0.6} max={1.6} step={0.05} value={s.steeringSensitivity} onChange={(v) => set({ steeringSensitivity: v })} />
      </Field>
      <Field label="Brake force" value={`${s.brakeForce.toFixed(2)}x`}>
        <Slider label="Brake force" min={0.6} max={1.6} step={0.05} value={s.brakeForce} onChange={(v) => set({ brakeForce: v })} />
      </Field>
    </div>
  );
}
