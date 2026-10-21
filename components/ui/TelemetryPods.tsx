'use client';

import React from 'react';
import { world } from '@/lib/game/sim/world';
import { useTicker } from '@/lib/game/useTicker';
import { useWriter } from './domWrite';
import { tempColor, tempWord } from './format';

const TYRES = [
  { id: 'fl', label: 'FRONT LEFT' },
  { id: 'fr', label: 'FRONT RIGHT' },
  { id: 'rl', label: 'REAR LEFT' },
  { id: 'rr', label: 'REAR RIGHT' },
] as const;

/** Collapsed-by-default drawer (T). One compact panel; every value is written straight to the DOM. */
export function TelemetryPods() {
  const w = useWriter();

  useTicker(() => {
    const car = world.player;
    const p = car.phys;
    for (const t of TYRES) {
      const tyre = p.tires[t.id];
      w.css(`tt-${t.id}`, '--tc', tempColor(tyre.temp));
      w.text(`tt-${t.id}-t`, String(Math.round(tyre.temp)));
      w.text(`tt-${t.id}-w`, `${Math.round(tyre.wear * 100)}% worn`);
      w.text(`tt-${t.id}-g`, `${Math.round(tyre.grip * 100)}% grip`);
    }
    w.text('tele-state', tempWord(p.tires.avgTemp));
    w.css('brk', 'width', `${Math.round(p.brakeInput * 100)}%`);
    w.text('brk-v', `${Math.round(p.brakeInput * 100)}%`);
    w.css('ers2', 'width', `${Math.round(p.ersCharge)}%`);
    w.text('ers2-v', `${Math.round(p.ersCharge)}%`);
    w.text('top', `${Math.round(car.stats.topSpeedKmh)}`);
    w.text('drift', `${Math.round(Math.abs(p.driftAngle) * (180 / Math.PI))}°`);
    w.cls('drift', 'on', p.isDrifting);
    const f = Math.round(p.brakeBias * 100);
    w.text('bias2', `${f}:${100 - f}`);
  });

  return (
    <div className="h-root">
      <aside className="h-tele" aria-label="Telemetry">
        <div className="h-tele-head">
          <span>TELEMETRY</span>
          <span ref={w.ref('tele-state')}>OPTIMAL</span>
        </div>
        <div className="h-tele-tyres">
          {TYRES.map((t) => (
            <div key={t.id} className="h-tt" ref={w.ref(`tt-${t.id}`)}>
              <div className="pos">{t.label}</div>
              <div className="temp">
                <span ref={w.ref(`tt-${t.id}-t`)}>--</span>
                <small>°C</small>
              </div>
              <div className="sub">
                <span ref={w.ref(`tt-${t.id}-w`)}>--</span>
                <span ref={w.ref(`tt-${t.id}-g`)}>--</span>
              </div>
            </div>
          ))}
        </div>
        <div className="h-tele-row">
          <span>BRAKE</span>
          <div className="bar">
            <i className="brk" ref={w.ref('brk')} />
          </div>
          <b ref={w.ref('brk-v')}>0%</b>
        </div>
        <div className="h-tele-row">
          <span>ERS</span>
          <div className="bar">
            <i className="ers" ref={w.ref('ers2')} />
          </div>
          <b ref={w.ref('ers2-v')}>100%</b>
        </div>
        <div className="h-tele-grid">
          <div>
            <small>TOP KM/H</small>
            <b ref={w.ref('top')}>0</b>
          </div>
          <div>
            <small>DRIFT</small>
            <b ref={w.ref('drift')}>0°</b>
          </div>
          <div>
            <small>BIAS F:R</small>
            <b ref={w.ref('bias2')}>56:44</b>
          </div>
        </div>
      </aside>
    </div>
  );
}
