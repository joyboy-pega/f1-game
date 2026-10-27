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
import { multiplayerRoom } from '@/lib/game/multiplayer/room';
import type { Pose } from '@/lib/game/sim/interp';

const mpPoseScratch: Pose = { x: 0, y: 0, a: 0 };

const HUD_INTERVAL = 0.1;
const RESULTS_DELAY_MS = 2500;

/** Pending results popup; module-level so a restart (or unmount) can cancel it. */
let resultsTimer: ReturnType<typeof setTimeout> | null = null;

function cancelResultsTimer() {
  if (resultsTimer !== null) clearTimeout(resultsTimer);
  resultsTimer = null;
}

function scheduleResults(results: ReturnType<typeof world.buildResults>, delayMs = RESULTS_DELAY_MS) {
  cancelResultsTimer();
  const raceIdAtFinish = world.raceId;
  resultsTimer = setTimeout(() => {
    resultsTimer = null;
    if (world.raceId !== raceIdAtFinish) return;
    const s = useGameStore.getState();
    s.recordRace(results.playerPosition, true);
    s.setResults(results);
  }, delayMs);
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
        scheduleResults(world.buildResults(), RESULTS_DELAY_MS);
      }
      break;
    case 'reset':
      if (e.carId === pid) toast({ id: 'reset', type: 'info', title: 'CAR RESET', duration: 1.2 });
      break;
    case 'engineer':
      toast({
        id: `eng-${Date.now()}`,
        type: 'info',
        title: 'RADIO · RACE ENGINEER',
        subtitle: e.message,
        duration: 4.5,
      });
      break;
    case 'qualifyingComplete': {
      const s = useGameStore.getState();
      s.setSettings({ qualifyingGrid: e.grid });
      const pos = e.grid.indexOf('player') + 1;
      toast({
        id: 'quali-done',
        type: 'info',
        title: `QUALIFYING COMPLETE — P${pos || 1}`,
        subtitle: 'Starting grid set for Grand Prix',
        duration: 4.0,
      });
      scheduleResults(world.buildResults(), RESULTS_DELAY_MS);
      break;
    }
    case 'flag':
      if (e.flag === 'yellow') {
        toast({
          id: `yellow-sec-${e.sector ?? 0}`,
          type: 'penalty',
          title: `YELLOW FLAG — SECTOR ${(e.sector ?? 0) + 1}`,
          subtitle: 'No overtaking · Reduce speed',
          duration: 3.5,
        });
      } else if (e.flag === 'green') {
        toast({
          id: 'green-flag',
          type: 'info',
          title: 'GREEN FLAG',
          subtitle: 'Track clear · Racing resumes',
          duration: 2.5,
        });
      }
      break;
    case 'safetyCar':
      if (e.ending) {
        toast({
          id: 'sc-ending',
          type: 'info',
          title: 'SAFETY CAR IN THIS LAP',
          subtitle: 'Prepare to resume racing',
          duration: 4.0,
        });
      } else if (e.mode === 'sc') {
        toast({
          id: 'sc-deployed',
          type: 'penalty',
          title: 'SAFETY CAR DEPLOYED',
          subtitle: 'Queue behind Safety Car · No overtaking',
          duration: 5.0,
        });
      } else if (e.mode === 'vsc') {
        toast({
          id: 'vsc-deployed',
          type: 'penalty',
          title: 'VIRTUAL SAFETY CAR',
          subtitle: 'Maintain positive delta · Speed restricted',
          duration: 5.0,
        });
      }
      break;
  }
}

export function GameLoop() {
  const hudTimer = useRef(0);
  const lastSnapshotTime = useRef(0);

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
    if (input.cameraCycleRequested) {
      st.cycleCamera();
      const nextView = useGameStore.getState().settings.cameraView;
      const label = nextView === 'chase' ? 'CHASE' : nextView === 'tcam' ? 'T-CAM' : nextView === 'cockpit' ? 'COCKPIT' : 'NOSE CAM';
      st.pushToast({ id: 'cam-cycle', type: 'info', title: `CAMERA: ${label}`, duration: 1.5 });
    }
    if (input.telemetryToggleRequested) st.toggleTelemetry();

    // Multiplayer room synchronization: send client inputs / receive host snapshot
    if (world.isMultiplayer) {
      if (multiplayerRoom.role === 'host') {
        multiplayerRoom.applyClientInputs(world, performance.now());
        if (performance.now() - lastSnapshotTime.current >= 40) {
          multiplayerRoom.broadcastSnapshot(world);
          lastSnapshotTime.current = performance.now();
        }
      } else if (multiplayerRoom.role === 'client') {
        multiplayerRoom.sendInput(input, world.raceTime);
      }
    }

    world.paused = st.paused || !!st.results;
    world.updateSettings(st.settings);
    const simT0 = devStats.enabled ? performance.now() : 0;
    world.step(dt, input);
    if (devStats.enabled) devStats.addSim(performance.now() - simT0);

    // Apply remote car positions on client after simulation step (prevents local step overwrite)
    if (world.isMultiplayer && multiplayerRoom.role === 'client') {
      for (let i = 0; i < world.cars.length; i++) {
        const car = world.cars[i];
        if (!car.isPlayer) {
          const hasSample = multiplayerRoom.interpolator.sample(car.id, world.raceTime, mpPoseScratch);
          if (hasSample) {
            car.prevX = car.phys.x = mpPoseScratch.x;
            car.prevY = car.phys.y = mpPoseScratch.y;
            car.prevA = car.phys.a = mpPoseScratch.a;
          }
        }
      }
    }

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
