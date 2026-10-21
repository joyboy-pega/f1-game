'use client';

import React, { useRef } from 'react';
import { PIT_LANE } from '@/lib/game/constants';
import { useGameStore } from '@/lib/game/store';
import { world } from '@/lib/game/sim/world';
import { useTicker } from '@/lib/game/useTicker';
import { useWriter } from '../domWrite';
import { COMPOUNDS, tempColor } from '../format';

const LED_COUNT = 15;
const LEDS = Array.from({ length: LED_COUNT }, (_, i) => i);
const RPM_FIRST = 6200;
const RPM_LIMIT = 10800;

/** Bottom-right driver cluster. Every 60 Hz value is written straight to the DOM by a ticker. */
export function DriverCluster() {
  const w = useWriter();
  const tyreClock = useRef(0);

  const compound = useGameStore((s) => s.hud.compound);
  const wear = useGameStore((s) => s.hud.tyreWear);
  const nextCompound = useGameStore((s) => s.hud.nextCompound);
  const boxRequested = useGameStore((s) => s.hud.boxRequested);
  const inPitLane = useGameStore((s) => s.hud.inPitLane);
  const penaltySec = useGameStore((s) => s.hud.penaltySec);
  const warnings = useGameStore((s) => s.hud.trackLimitWarnings);

  useTicker((dt) => {
    const car = world.player;
    const p = car.phys;

    w.text('speed', String(Math.round(p.kmh)));
    w.text('gear', String(p.gear));

    const lit = Math.max(0, Math.min(LED_COUNT, Math.round(((p.rpm - RPM_FIRST) / (RPM_LIMIT - RPM_FIRST)) * LED_COUNT)));
    for (let i = 0; i < LED_COUNT; i++) w.cls(`led${i}`, 'on', i < lit);
    w.cls('leds', 'limit', p.rpm >= RPM_LIMIT);

    const ers = Math.max(0, Math.min(100, p.ersCharge));
    w.css('ers', 'width', `${ers.toFixed(1)}%`);
    w.cls('ersBox', 'boost', p.isBoosting);
    w.cls('ersBox', 'low', ers < 15);

    w.cls('drs', 'open', p.drsOpen);
    w.cls('drs', 'avail', !p.drsOpen && car.drsAvailable);

    const f = Math.round(p.brakeBias * 100);
    w.text('bias', `${f}:${100 - f}`);

    tyreClock.current += dt;
    if (tyreClock.current >= 0.1) {
      tyreClock.current = 0;
      const t = p.tires;
      w.css('tfl', 'background', tempColor(t.fl.temp));
      w.css('tfr', 'background', tempColor(t.fr.temp));
      w.css('trl', 'background', tempColor(t.rl.temp));
      w.css('trr', 'background', tempColor(t.rr.temp));
    }
  });

  const comp = COMPOUNDS[compound];
  const next = COMPOUNDS[nextCompound];

  return (
    <div className="h-cluster" aria-label="Driver cluster">
      <div className="h-leds" ref={w.ref('leds')} aria-hidden="true">
        {LEDS.map((i) => (
          <span key={i} ref={w.ref(`led${i}`)} className={i < 5 ? 'g' : i < 10 ? 'r' : 'b'} />
        ))}
      </div>

      <div className="h-cl-main">
        <div className="h-gear">
          <small>GEAR</small>
          <span ref={w.ref('gear')}>N</span>
        </div>
        <div className="h-speed">
          <span ref={w.ref('speed')}>0</span>
          <small>KM/H</small>
        </div>
        <div className="h-tyres" title={`${comp.name} · wear ${Math.round(wear * 100)}%`}>
          <div className="h-tyre-grid" aria-hidden="true">
            <i ref={w.ref('tfl')} />
            <i ref={w.ref('tfr')} />
            <i ref={w.ref('trl')} />
            <i ref={w.ref('trr')} />
          </div>
          <div className="h-tyre-side">
            <span className="k-comp lg" style={{ ['--c' as string]: comp.color }}>
              {comp.letter}
            </span>
            <span className="h-wear">{Math.round(wear * 100)}%</span>
          </div>
        </div>
      </div>

      <div className="h-cl-bars">
        <div className="h-ers" ref={w.ref('ersBox')}>
          <span className="lbl">ERS</span>
          <span className="track">
            <i ref={w.ref('ers')} />
          </span>
        </div>
        <span className="h-drs" ref={w.ref('drs')}>
          DRS
        </span>
        <span className="h-bias">
          BB <b ref={w.ref('bias')}>56:44</b>
        </span>
      </div>

      {(boxRequested || inPitLane || penaltySec > 0 || warnings > 0) && (
        <div className="h-cl-status">
          {inPitLane && (
            <span className="h-status pit">
              PIT LIMITER <b>{PIT_LANE.speedLimitKmh}</b>
            </span>
          )}
          {!inPitLane && boxRequested && (
            <span className="h-status box">
              BOX BOX <em>NEXT</em>
              <span className="k-comp" style={{ ['--c' as string]: next.color }}>
                {next.letter}
              </span>
              <kbd>O</kbd>
            </span>
          )}
          {penaltySec > 0 && <span className="h-status pen">+{Math.round(penaltySec)}s PENALTY</span>}
          {warnings > 0 && <span className="h-status warn">TRACK LIMITS {warnings}/3</span>}
        </div>
      )}
    </div>
  );
}
