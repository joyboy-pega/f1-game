'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { Difficulty, GameMode, Livery, TimeOfDay, TyreCompound, WeatherType } from '@/lib/game/constants';
import { DEFAULT_SETTINGS, formatLapTime, type GameSettings } from '@/lib/game/gameState';
import { recordKey, useGameStore } from '@/lib/game/store';
import { ControlsPanel } from './ControlsPanel';
import { SettingsPanel } from './SettingsPanel';
import { COMPOUNDS, COMPOUND_ORDER, LAP_RECORD, MODE_NAMES, WEATHER_LABEL, useMounted } from './format';
import { Field, Seg, Slider } from './kit';

const Showroom = dynamic(() => import('./Showroom'), {
  ssr: false,
  loading: () => <div className="l-showroom-loading">Warming up the garage…</div>,
});

const MODES: { id: GameMode; name: string; sub: string }[] = [
  { id: 'race', name: 'Grand Prix', sub: 'Full grid · pit stops · strategy' },
  { id: 'timetrial', name: 'Time Trial', sub: 'Solo · chase your ghost' },
  { id: 'practice', name: 'Free Practice', sub: 'No pressure · test tyres' },
];

const PRESETS: { name: string; livery: Omit<Livery, 'number'> }[] = [
  { name: 'Pegasus #53', livery: { body: '#f8fafc', accent: '#dc2626', rim: '#9a6b26' } },
  { name: 'Scarlet', livery: { body: '#e10600', accent: '#121212', rim: '#c0c0c0' } },
  { name: 'Papaya', livery: { body: '#ff8700', accent: '#0072bb', rim: '#1e1e1e' } },
  { name: 'Silver', livery: { body: '#d9dce1', accent: '#111111', rim: '#111111' } },
  { name: 'Racing green', livery: { body: '#0b5d3b', accent: '#cedc00', rim: '#1e1e1e' } },
  { name: 'Royal', livery: { body: '#1e41b0', accent: '#ffd700', rim: '#c0c0c0' } },
  { name: 'Violet', livery: { body: '#6b21a8', accent: '#f59e0b', rim: '#f59e0b' } },
];

const TABS = ['Setup', 'Garage', 'Records', 'Options'] as const;
type Tab = (typeof TABS)[number];

function Colour({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="l-colour">
      <span>{label}</span>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
    </label>
  );
}

export function MainMenu() {
  const mounted = useMounted();
  const stored = useGameStore((s) => s.settings);
  const records = useGameStore((s) => s.records);
  const set = useGameStore((s) => s.setSettings);
  const s: GameSettings = mounted ? stored : DEFAULT_SETTINGS;
  const [tab, setTab] = useState<Tab>('Setup');

  const race = s.mode === 'race';
  const setLivery = (patch: Partial<Livery>) => set({ livery: { ...s.livery, ...patch } });
  const bestKey = recordKey(s.mode, s.weather);
  const best = mounted ? records.bestLaps[bestKey] : undefined;

  return (
    <main className="l-root" aria-label="Open Race lobby">
      <header className="l-top">
        <div className="l-brand">
          <span className="l-flag" aria-hidden="true" />
          <div>
            <h1>Open Race</h1>
            <p>by Arigatoo Club · Buddh International Circuit</p>
          </div>
        </div>
        <div className="l-track">
          <img src="/svg/buddh_circuit_clean.svg" alt="" className="l-track-img" />
          <dl>
            <div>
              <dt>Length</dt>
              <dd>5.125 km</dd>
            </div>
            <div>
              <dt>Turns</dt>
              <dd>16</dd>
            </div>
            <div>
              <dt>Lap record</dt>
              <dd>
                {formatLapTime(LAP_RECORD.time)} <small>{LAP_RECORD.driver.split(' ')[1]} {LAP_RECORD.year}</small>
              </dd>
            </div>
          </dl>
        </div>
      </header>

      <div className="l-grid">
        <section className={`l-stage ${s.weather === 'rain' ? 'is-rain' : s.weather === 'snow' ? 'is-snow' : ''}`} aria-label="Your car">
          <div className="l-showroom">
            <Showroom model={s.carModel} livery={s.livery} compound={s.startCompound} weather={s.weather} />
          </div>
          {(s.weather === 'rain' || s.weather === 'snow') && (
            <div className={`l-weather-pill ${s.weather}`} aria-live="polite">
              <span className="l-weather-pill-dot" />
              <span>{s.weather === 'rain' ? '🌧️ Wet Weather Active' : '❄️ Snow Conditions Active'}</span>
            </div>
          )}
          <div className="l-stage-cap">
            <span className="l-num">#{s.livery.number}</span>
            <div>
              <b>{s.driverName || 'You'}</b>
              <small>
                {s.carModel === 'pegasus' ? 'Formula Student (SAE India) · Team Pegasus #53' : s.carModel === 'f1' ? 'Formula car' : 'Tesla Roadster'} · {COMPOUNDS[s.startCompound].name} tyres
              </small>
            </div>
          </div>
        </section>

        <section className="l-panel">
          <div className="l-modes" role="radiogroup" aria-label="Game mode">
            {MODES.map((m) => (
              <button key={m.id} type="button" role="radio" aria-checked={s.mode === m.id} className={`l-mode ${s.mode === m.id ? 'on' : ''}`} onClick={() => set({ mode: m.id })}>
                <b>{m.name}</b>
                <small>{m.sub}</small>
              </button>
            ))}
          </div>

          <div className="m-tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} className={`m-tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
                {t}
              </button>
            ))}
          </div>

          <div className="l-body">
            {tab === 'Setup' && (
              <>
                {race && (
                  <>
                    <Field label="Laps" value={String(s.totalLaps)}>
                      <Slider label="Laps" min={1} max={20} step={1} value={s.totalLaps} onChange={(v) => set({ totalLaps: v })} />
                    </Field>
                    <Field label="Opponents" value={String(s.aiCount)}>
                      <Slider
                        label="Opponents"
                        min={0}
                        max={11}
                        step={1}
                        value={s.aiCount}
                        onChange={(v) => set({ aiCount: v, gridPosition: Math.min(s.gridPosition, v + 1) })}
                      />
                    </Field>
                    <Field label="Difficulty">
                      <Seg<Difficulty>
                        label="Difficulty"
                        value={s.difficulty}
                        options={[
                          { value: 'rookie', label: 'Rookie' },
                          { value: 'pro', label: 'Pro' },
                          { value: 'legend', label: 'Legend' },
                        ]}
                        onChange={(v) => set({ difficulty: v })}
                      />
                    </Field>
                    <Field label="Grid slot" value={`P${Math.min(s.gridPosition, s.aiCount + 1)}`}>
                      <Slider label="Grid position" min={1} max={s.aiCount + 1} step={1} value={Math.min(s.gridPosition, s.aiCount + 1)} onChange={(v) => set({ gridPosition: v })} />
                    </Field>
                  </>
                )}
                <Field label="Weather">
                  <Seg<WeatherType>
                    label="Weather"
                    value={s.weather}
                    options={(['sunny', 'cloudy', 'rain', 'snow'] as WeatherType[]).map((w) => ({ value: w, label: WEATHER_LABEL[w] }))}
                    onChange={(v) => set({ weather: v })}
                  />
                </Field>
                <Field label="Time of day">
                  <Seg<TimeOfDay>
                    label="Time of day"
                    value={s.timeOfDay}
                    options={[
                      { value: 'day', label: 'Day' },
                      { value: 'sunset', label: 'Sunset' },
                      { value: 'night', label: 'Night' },
                    ]}
                    onChange={(v) => set({ timeOfDay: v })}
                  />
                </Field>
                <Field label="Starting tyre" hint={s.weather === 'rain' || s.weather === 'snow' ? 'Slicks struggle in the wet: pick Inter or Wet.' : undefined}>
                  <Seg<TyreCompound>
                    label="Starting tyre"
                    value={s.startCompound}
                    options={COMPOUND_ORDER.map((c) => ({ value: c, label: COMPOUNDS[c].letter, title: COMPOUNDS[c].name }))}
                    onChange={(v) => set({ startCompound: v })}
                  />
                </Field>
              </>
            )}

            {tab === 'Garage' && (
              <>
                <Field label="Car">
                  <Seg
                    label="Car model"
                    value={s.carModel}
                    options={[
                      { value: 'f1', label: 'Formula' },
                      { value: 'roadster', label: 'Tesla Roadster' },
                      { value: 'pegasus', label: 'Pegasus #53' },
                    ]}
                    onChange={(v) => {
                      if (v === 'pegasus') {
                        set({
                          carModel: v,
                          livery: { ...s.livery, number: 53, body: '#f8fafc', accent: '#dc2626', rim: '#9a6b26' },
                          driverName: s.driverName === 'You' ? 'Pegasus #53' : s.driverName,
                          driverCode: s.driverCode === 'YOU' ? 'PEG' : s.driverCode,
                        });
                      } else {
                        set({ carModel: v });
                      }
                    }}
                  />
                </Field>
                <div className="l-presets" role="group" aria-label="Livery presets">
                  {PRESETS.map((p) => (
                    <button key={p.name} type="button" title={p.name} className="l-preset" style={{ background: p.livery.body, borderColor: p.livery.accent }} onClick={() => setLivery(p.livery)} aria-label={`${p.name} livery`} />
                  ))}
                </div>
                <div className="l-colours">
                  <Colour label="Body" value={s.livery.body} onChange={(v) => setLivery({ body: v })} />
                  <Colour label="Accent" value={s.livery.accent} onChange={(v) => setLivery({ accent: v })} />
                  <Colour label="Wheels" value={s.livery.rim} onChange={(v) => setLivery({ rim: v })} />
                </div>
                <Field label="Number" value={`#${s.livery.number}`}>
                  <Slider label="Car number" min={1} max={99} step={1} value={s.livery.number} onChange={(v) => setLivery({ number: v })} />
                </Field>
                <Field label="Driver name">
                  <input className="l-input" value={s.driverName} maxLength={18} onChange={(e) => set({ driverName: e.target.value })} aria-label="Driver name" />
                </Field>
                <Field label="Timing code">
                  <input
                    className="l-input l-code"
                    value={s.driverCode}
                    maxLength={3}
                    onChange={(e) => set({ driverCode: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })}
                    aria-label="Three letter timing code"
                  />
                </Field>
              </>
            )}

            {tab === 'Records' && (
              <div className="l-records">
                <div className="m-stats">
                  <div>
                    <small>Races started</small>
                    <b>{mounted ? records.racesStarted : 0}</b>
                  </div>
                  <div>
                    <small>Finished</small>
                    <b>{mounted ? records.racesFinished : 0}</b>
                  </div>
                  <div>
                    <small>Wins</small>
                    <b>{mounted ? records.wins : 0}</b>
                  </div>
                  <div>
                    <small>Podiums</small>
                    <b>{mounted ? records.podiums : 0}</b>
                  </div>
                </div>
                <h3 className="k-section-title">Best laps</h3>
                {mounted && Object.keys(records.bestLaps).length === 0 && <p className="m-empty">Set a lap in Time Trial or Practice to see it here.</p>}
                {mounted &&
                  Object.entries(records.bestLaps).map(([key, t]) => {
                    const [mode, weather] = key.split(':');
                    return (
                      <div key={key} className="m-lap">
                        <span>
                          {MODE_NAMES[mode as GameMode] ?? mode} · {WEATHER_LABEL[weather as WeatherType] ?? weather}
                        </span>
                        <b>{formatLapTime(t)}</b>
                      </div>
                    );
                  })}
              </div>
            )}

            {tab === 'Options' && (
              <>
                <SettingsPanel />
                <h3 className="k-section-title">Controls</h3>
                <ControlsPanel />
              </>
            )}
          </div>

          <div className="l-start">
            <div className="l-start-info">
              <b>{MODE_NAMES[s.mode]}</b>
              <small>
                {race ? `${s.totalLaps} laps · P${Math.min(s.gridPosition, s.aiCount + 1)}/${s.aiCount + 1} · ${s.difficulty}` : best !== undefined ? `Your best ${formatLapTime(best)}` : 'No time set yet'} · {WEATHER_LABEL[s.weather]} · {s.timeOfDay}
              </small>
            </div>
            <Link href="/game" className="l-go">
              Start
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
