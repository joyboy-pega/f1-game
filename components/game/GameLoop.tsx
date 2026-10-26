'use client';

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { controls } from '@/lib/game/controls';
import { formatLapTime } from '@/lib/game/gameState';
import { useGameStore, recordKey } from '@/lib/game/store';
import { world } from '@/lib/game/sim/world';
import { recorder } from '@/lib/game/sim/recorder';
import { ghostRecorder } from '@/lib/game/replay/ghost';
import { devStats } from '@/lib/game/devStats';
import type { SimEvent } from '@/lib/game/sim/events';

const HUD_INTERVAL = 0.1;
const RESULTS_DELAY_MS = 2500;

/** Pending results popup; module-level so a restart (or unmount) can cancel it. */
let resultsTimer: ReturnType<typeof setTimeout> | null = null;

function cancelResultsTimer() {
  if (resultsTimer !== null) clearTimeout(resultsTimer);
  resultsTimer = null;
}

/** Bridges simulation events to toasts, audio and records. */
function handleEvent(e: SimEvent) {
  const st = useGameStore.getState();
  const toast = st.pushToast;
  const pid = world.player.id;

  switch (e.type) {
    case 'lightsOut':
      toast({ id: 'go', type: 'info', title: 'LIGHTS OUT', subtitle: 'AWAY WE GO', duration: 1.6 });
      break;
    case 'lap':
      if (e.carId === pid) {
        if (world.settings.mode !== 'race') st.submitLap(recordKey(world.settings.trackId, world.settings.mode, world.settings.weather), e.time);
        if (world.settings.mode === 'timetrial' && e.personalBest) ghostRecorder.commit(world.settings.trackId, world.settings.weather);
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
    case 'bias': {
      const f = Math.round(e.bias * 100);
      toast({ id: 'bias', type: 'bias', title: `BRAKE BIAS ${f}:${100 - f}`, duration: 1.2 });
      break;
    }
    case 'pitExit':
      if (e.carId === pid) {
        toast({ id: 'pit', type: 'pit', title: 'FRESH TYRES', subtitle: e.compound.toUpperCase(), duration: 2 });
      }
      break;
    case 'penalty':
      if (e.carId === pid) toast({ id: `pen-${Date.now()}`, type: 'penalty', title: `+${e.seconds}s PENALTY`, subtitle: e.reason, duration: 3 });
      break;
    case 'trackLimits':
      if (e.carId === pid) toast({ id: 'tl', type: 'penalty', title: 'TRACK LIMITS', subtitle: `WARNING ${e.warnings}/3`, duration: 2 });
      break;
    case 'lapInvalid':
      if (e.carId === pid) toast({ id: 'lap-invalid', type: 'penalty', title: 'LAP DELETED', subtitle: e.reason, duration: 2.5 });
      break;
    case 'chicaneCut':
      if (e.carId === pid) toast({ id: 'chicane-cut', type: 'penalty', title: 'CHICANE CUT', subtitle: `+${e.gainedSec.toFixed(2)}s ADVANTAGE`, duration: 2.5 });
      break;
    case 'chequered':
      toast({ id: 'chequered', type: 'info', title: 'CHEQUERED FLAG', duration: 2.5 });
      break;
    case 'finish':
      if (e.carId === pid) {
        cancelResultsTimer();
        const raceIdAtFinish = world.raceId;
        resultsTimer = setTimeout(() => {
          resultsTimer = null;
          // A restart inside the delay must not show the previous race's results over the new one.
          if (world.raceId !== raceIdAtFinish) return;
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

  useEffect(() => {
    const unsubscribe = world.events.subscribe(handleEvent);
    return () => {
      unsubscribe();
      cancelResultsTimer();
    };
  }, []);

  useFrame((_state, delta) => {
    const dt = Math.min(0.1, delta);

    const st = useGameStore.getState();
    const playerSpeedKmh = world.player ? Math.abs(world.player.phys.vf) * 0.36 : 0;
    const input = controls.poll(dt, playerSpeedKmh);

    // Replay: the director owns the cars and camera; nothing else steps or reacts to input.
    if (st.replayActive) {
      world.paused = true;
      world.alpha = 1; // the director writes `phys` directly; draw it as is, not blended with a stale previous pose
      return;
    }

    if (input.menuToggleRequested && !st.results) st.setPaused(!st.paused);
    if (input.cameraCycleRequested) st.cycleCamera();
    if (input.telemetryToggleRequested) st.toggleTelemetry();

    world.paused = st.paused || !!st.results;
    world.updateSettings(st.settings);
    const simT0 = devStats.enabled ? performance.now() : 0;
    world.step(dt, input);
    if (devStats.enabled) devStats.addSim(performance.now() - simT0);
    recorder.capture(world);
    ghostRecorder.capture(world);

    world.events.flush();

    if (st.phase !== world.phase) st.setPhase(world.phase);
    if (st.lightsLit !== world.lightsLit) st.setLightsLit(world.lightsLit);

    hudTimer.current += dt;
    if (hudTimer.current >= HUD_INTERVAL) {
      hudTimer.current = 0;
      st.setHud(world.buildHud());
    }
  });

  return null;
}
