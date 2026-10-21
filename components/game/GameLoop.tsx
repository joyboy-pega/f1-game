'use client';

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { controls } from '@/lib/game/controls';
import { audio } from '@/lib/game/audio';
import { performanceGovernor } from '@/lib/game/performance';
import { formatLapTime } from '@/lib/game/gameState';
import { useGameStore, recordKey } from '@/lib/game/store';
import { world } from '@/lib/game/sim/world';
import { recorder } from '@/lib/game/sim/recorder';
import { ghostRecorder } from '@/lib/game/replay/ghost';
import type { SimEvent } from '@/lib/game/sim/events';

const HUD_INTERVAL = 0.1;
const RESULTS_DELAY_MS = 2500;

/** Bridges simulation events to toasts, audio and records. */
function handleEvent(e: SimEvent) {
  const st = useGameStore.getState();
  const toast = st.pushToast;
  const pid = world.player.id;

  switch (e.type) {
    case 'lightsOn':
      audio.playBiasTick();
      break;
    case 'lightsOut':
      toast({ id: 'go', type: 'info', title: 'LIGHTS OUT', subtitle: 'AWAY WE GO', duration: 1.6 });
      break;
    case 'lap':
      if (e.carId === pid) {
        if (world.settings.mode !== 'race') st.submitLap(recordKey(world.settings.mode, world.settings.weather), e.time);
        if (world.settings.mode === 'timetrial' && e.personalBest) ghostRecorder.commit(world.settings.weather);
        toast({
          id: `lap-${e.lap}`,
          type: e.overallBest ? 'fastest' : 'lap',
          title: `LAP ${e.lap}  ${formatLapTime(e.time)}`,
          subtitle: e.overallBest ? 'FASTEST LAP' : e.personalBest ? 'PERSONAL BEST' : undefined,
          duration: 3,
        });
      } else if (e.overallBest && world.isRace) {
        const c = world.cars[e.carId];
        toast({ id: 'fastest', type: 'fastest', title: `FASTEST LAP · ${c.driver.code}`, subtitle: formatLapTime(e.time), duration: 2.5 });
      }
      break;
    case 'positionChange':
      if (e.to < e.from) toast({ id: 'pos', type: 'overtake', title: `P${e.to}`, subtitle: 'POSITION GAINED', duration: 1.8 });
      break;
    case 'drs':
      audio.playDrsTone(e.open);
      break;
    case 'bias': {
      audio.playBiasTick();
      const f = Math.round(e.bias * 100);
      toast({ id: 'bias', type: 'bias', title: `BRAKE BIAS ${f}:${100 - f}`, duration: 1.2 });
      break;
    }
    case 'pitExit':
      if (e.carId === pid) {
        audio.playPitSound();
        toast({ id: 'pit', type: 'pit', title: 'FRESH TYRES', subtitle: e.compound.toUpperCase(), duration: 2 });
      }
      break;
    case 'penalty':
      if (e.carId === pid) toast({ id: `pen-${Date.now()}`, type: 'penalty', title: `+${e.seconds}s PENALTY`, subtitle: e.reason, duration: 3 });
      break;
    case 'trackLimits':
      if (e.carId === pid) toast({ id: 'tl', type: 'penalty', title: 'TRACK LIMITS', subtitle: `WARNING ${e.warnings}/3`, duration: 2 });
      break;
    case 'chequered':
      toast({ id: 'chequered', type: 'info', title: 'CHEQUERED FLAG', duration: 2.5 });
      break;
    case 'finish':
      if (e.carId === pid) {
        setTimeout(() => {
          const results = world.buildResults();
          const s = useGameStore.getState();
          s.recordRace(results.playerPosition, true);
          s.setResults(results);
        }, RESULTS_DELAY_MS);
      }
      break;
    case 'reset':
      if (e.carId === pid) toast({ id: 'reset', type: 'info', title: 'CAR RESET', duration: 1.2 });
      break;
  }
}

export function GameLoop() {
  const hudTimer = useRef(0);
  const qualityTimer = useRef(0);

  useEffect(() => world.events.subscribe(handleEvent), []);

  useFrame((state, delta) => {
    const dt = Math.min(0.1, delta);
    performanceGovernor.recordFrame(dt, state.clock.elapsedTime * 1000);

    const st = useGameStore.getState();
    const input = controls.poll();

    // Replay: the director owns the cars and camera; nothing else steps or reacts to input.
    if (st.replayActive) {
      world.paused = true;
      return;
    }

    if (input.menuToggleRequested && !st.results) st.setPaused(!st.paused);
    if (input.cameraCycleRequested) st.cycleCamera();
    if (input.telemetryToggleRequested) st.toggleTelemetry();

    world.paused = st.paused || !!st.results;
    world.step(dt, input);
    recorder.capture(world);
    ghostRecorder.capture(world);

    const p = world.player.phys;
    const tireSlip = Math.min(
      1,
      (Math.abs(p.vl) / Math.max(70, Math.abs(p.vf))) * 2.6 + p.driftIntensity * 0.72 + (Math.abs(p.steer) > 0.5 ? 0.2 : 0)
    );
    audio.updateEngine(p.rpm, world.player.ctrl.throttle > 0.1, p.gear, !world.paused, p.kmh / 330, world.paused ? 0 : tireSlip);
    audio.updateErs(p.isBoosting && !world.paused);

    world.events.flush();

    if (st.phase !== world.phase) st.setPhase(world.phase);
    if (st.lightsLit !== world.lightsLit) st.setLightsLit(world.lightsLit);

    hudTimer.current += dt;
    if (hudTimer.current >= HUD_INTERVAL) {
      hudTimer.current = 0;
      st.setHud(world.buildHud());
    }

    qualityTimer.current += dt;
    if (qualityTimer.current >= 1) {
      qualityTimer.current = 0;
      const q = performanceGovernor.getSettings().level;
      if (q !== st.quality) st.setQuality(q);
    }
  });

  return null;
}
