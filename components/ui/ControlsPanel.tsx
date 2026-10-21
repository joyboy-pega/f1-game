'use client';

import React from 'react';
import { Key } from './kit';

/** Mirrors KEY_TRIGGERS / PAD_TRIGGERS and the hold bindings in lib/game/controls.ts. */
const KEYBOARD: { action: string; keys: string[] }[] = [
  { action: 'Throttle', keys: ['W', '↑'] },
  { action: 'Brake / reverse', keys: ['S', '↓'] },
  { action: 'Steer', keys: ['A', 'D', '←', '→'] },
  { action: 'Handbrake', keys: ['Space'] },
  { action: 'ERS boost (hold)', keys: ['Shift'] },
  { action: 'DRS', keys: ['F', 'E'] },
  { action: 'Brake bias rear / front', keys: ['[', ']'] },
  { action: 'Box this lap', keys: ['P'] },
  { action: 'Next tyre compound', keys: ['O'] },
  { action: 'Camera', keys: ['C'] },
  { action: 'Look back (hold)', keys: ['B'] },
  { action: 'Reset to track', keys: ['R'] },
  { action: 'Telemetry drawer', keys: ['T'] },
  { action: 'Timing tower gap / interval', keys: ['G'] },
  { action: 'Pause', keys: ['Esc', 'M'] },
];

const GAMEPAD: { action: string; keys: string[] }[] = [
  { action: 'Throttle', keys: ['RT'] },
  { action: 'Brake / reverse', keys: ['LT'] },
  { action: 'Steer', keys: ['Left stick'] },
  { action: 'Handbrake', keys: ['B'] },
  { action: 'ERS boost (hold)', keys: ['X'] },
  { action: 'DRS', keys: ['A'] },
  { action: 'Camera', keys: ['Y'] },
  { action: 'Brake bias rear / front', keys: ['LB', 'RB'] },
  { action: 'Box this lap', keys: ['D-pad ↓'] },
  { action: 'Next tyre compound', keys: ['D-pad →'] },
  { action: 'Reset to track', keys: ['D-pad ↑'] },
  { action: 'Look back (hold)', keys: ['L3', 'Stick ↓'] },
  { action: 'Telemetry drawer', keys: ['View'] },
  { action: 'Pause', keys: ['Menu'] },
];

function Table({ title, rows }: { title: string; rows: { action: string; keys: string[] }[] }) {
  return (
    <section className="k-ctl-col" aria-label={title}>
      <h3 className="k-section-title">{title}</h3>
      <ul className="k-ctl-list">
        {rows.map((r) => (
          <li key={r.action}>
            <span>{r.action}</span>
            <span className="keys">
              {r.keys.map((k) => (
                <Key key={k}>{k}</Key>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ControlsPanel() {
  return (
    <div className="k-ctl">
      <Table title="Keyboard" rows={KEYBOARD} />
      <Table title="Gamepad" rows={GAMEPAD} />
      <p className="k-ctl-note">Touch: left side steers, right side is brake and throttle. DRS, ERS and BOX buttons sit above the pedals.</p>
    </div>
  );
}
