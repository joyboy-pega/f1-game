'use client';

import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  N,
  trackSplinePoints,
  tangents,
  AI_CONFIGS,
} from '@/lib/game/constants';
import { controls } from '@/lib/game/controls';
import {
  CarPhysicsState,
  AICarState,
  updateCarPhysics,
  updateAI,
  fitFreshTires,
  isCarInDrsZone,
} from '@/lib/game/physics';
import { audio } from '@/lib/game/audio';
import { performanceGovernor } from '@/lib/game/performance';
import { RaceState, GameSettings, ToastMessage, RaceOrderRow } from '@/lib/game/gameState';

interface GameManagerProps {
  carState: CarPhysicsState;
  aiCars: AICarState[];
  settings: GameSettings;
  raceState: RaceState;
  setRaceState: (state: RaceState) => void;
  lightsActiveCount: number;
  setLightsActiveCount: (count: number) => void;
  lightsOut: boolean;
  setLightsOut: (out: boolean) => void;
  currentLap: number;
  setCurrentLap: (lap: number) => void;
  lapTime: number;
  setLapTime: (time: number) => void;
  bestLapTime: number | null;
  setBestLapTime: (time: number | null) => void;
  lastLapTime: number | null;
  setLastLapTime: (time: number | null) => void;
  playerPosition: number;
  setPlayerPosition: (pos: number) => void;
  raceOrder: RaceOrderRow[];
  setRaceOrder: (order: RaceOrderRow[]) => void;
  addToast: (toast: ToastMessage) => void;
  onRaceFinished: (stats: {
    position: number;
    totalTime: number;
    bestLap: number | null;
    lastLap: number | null;
    topSpeed: number;
    overtakeCount: number;
    drsUseCount: number;
    ersUseCount: number;
    lapTimes: number[];
  }) => void;
}

export function GameManager({
  carState,
  aiCars,
  settings,
  raceState,
  setRaceState,
  lightsActiveCount,
  setLightsActiveCount,
  lightsOut,
  setLightsOut,
  currentLap,
  setCurrentLap,
  lapTime,
  setLapTime,
  bestLapTime,
  setBestLapTime,
  lastLapTime,
  setLastLapTime,
  playerPosition,
  setPlayerPosition,
  raceOrder,
  setRaceOrder,
  addToast,
  onRaceFinished,
}: GameManagerProps) {
  const lightsTimer = useRef(0);
  const halfwayCheckpoint = useRef(false);
  const lapTimes = useRef<number[]>([]);
  const totalRaceTime = useRef(0);
  const topSpeedKmh = useRef(0);
  const overtakeCount = useRef(0);
  const drsUseCount = useRef(0);
  const ersUseCount = useRef(0);
  const prevDrsState = useRef(false);
  const prevErsState = useRef(false);
  const prevPosition = useRef(1);

  const lastUiUpdate = useRef(0);

  // Initialize AI cars positions on start
  useEffect(() => {
    aiCars.forEach((ai, i) => {
      const startIdx = (N - 10 - i * 28 + N) % N;
      const sp = trackSplinePoints[startIdx];
      const nx = trackSplinePoints[(startIdx + 1) % N];
      ai.x = sp[0];
      ai.y = sp[1];
      ai.a = Math.atan2(nx[1] - sp[1], nx[0] - sp[0]);
      ai.idx = startIdx;
      ai.speed = 0;
      ai.lapNo = 1;
      ai.halfway = false;
      ai.lapT = 0;
      ai.totalDist = 0;
      ai.finished = false;
    });
  }, [aiCars]);

  useFrame((state, delta) => {
    const now = state.clock.elapsedTime * 1000;
    const dt = Math.min(0.06, delta);

    // Record FPS for adaptive performance
    performanceGovernor.recordFrame(dt, now);

    // 1. Start Lights Countdown Sequence
    if (raceState === 'lights') {
      lightsTimer.current += dt;
      const count = Math.min(5, Math.floor(lightsTimer.current / 0.8));
      if (count !== lightsActiveCount) {
        setLightsActiveCount(count);
      }

      if (lightsTimer.current >= 4.6) {
        setLightsOut(true);
        setRaceState('run');
        addToast({
          id: 'go',
          type: 'lap',
          title: 'LIGHTS OUT · GO!',
          duration: 1.5,
        });
      }
    }

    // 2. Poll Controls
    const ctrl = controls.poll();

    // Auto-start drive if player hits throttle/brake while idle
    if (raceState === 'idle' && (ctrl.throttle || ctrl.brake || ctrl.handbrake)) {
      setRaceState('run');
    }

    // Handle single-fire actions
    if (ctrl.pitStopRequested) {
      fitFreshTires(carState);
      audio.playPitSound();
      addToast({
        id: 'pit',
        type: 'tire',
        title: 'PIT STOP COMPLETE',
        subtitle: 'FRESH SOFT TIRES FITTED (100% GRIP)',
        duration: 2.5,
      });
    }

    if (ctrl.brakeBiasUp || ctrl.brakeBiasDown) {
      audio.playBiasTick();
      const fPct = Math.round(carState.brakeBias * 100);
      const rPct = 100 - fPct;
      addToast({
        id: 'bias',
        type: 'bias',
        title: `BRAKE BIAS: ${fPct}% F / ${rPct}% R`,
        duration: 1.5,
      });
    }

    // 3. Update Car Physics
    const physicsResult = updateCarPhysics(
      carState,
      ctrl,
      dt,
      settings.weather,
      settings.steeringSensitivity,
      settings.brakeForce,
      settings.tireWearRate
    );

    if (physicsResult.drsClosedReason) {
      audio.playDrsTone(false);
    } else if (carState.drsOpen && !prevDrsState.current) {
      audio.playDrsTone(true);
      drsUseCount.current++;
    }
    prevDrsState.current = carState.drsOpen;

    if (carState.isBoosting && !prevErsState.current) {
      ersUseCount.current++;
    }
    prevErsState.current = carState.isBoosting;

    audio.updateErs(carState.isBoosting);

    // Audio Engine Update
    const kmh = carState.kmh;
    if (kmh > topSpeedKmh.current) topSpeedKmh.current = kmh;

    const lateralSlipRatio = Math.abs(carState.vl) / Math.max(70, Math.abs(carState.vf));
    const tireSlip = Math.min(
      1,
      lateralSlipRatio * 2.6 + carState.driftIntensity * 0.72 + (Math.abs(carState.steer) > 0.5 ? 0.2 : 0)
    );
    audio.updateEngine(
      carState.rpm,
      ctrl.throttle,
      carState.gear,
      raceState === 'run' || raceState === 'lights',
      kmh / 330,
      tireSlip
    );

    // 4. Update AI Rival Cars
    if (raceState === 'run') {
      const playerDist = (currentLap - 1) * N + carState.idx;
      updateAI(aiCars, dt, playerDist, carState.idx);
    }

    // 5. Lap Completion Logic
    if (raceState === 'run') {
      const newLapT = lapTime + dt;
      totalRaceTime.current += dt;

      if (carState.idx > N * 0.45 && carState.idx < N * 0.55) {
        halfwayCheckpoint.current = true;
      }

      // Check Start / Finish crossing
      if (carState.idx < N * 0.1 && halfwayCheckpoint.current && carState.vf > 0) {
        halfwayCheckpoint.current = false;
        lapTimes.current.push(newLapT);

        const isNewBest = bestLapTime === null || newLapT < bestLapTime;
        if (isNewBest) setBestLapTime(newLapT);
        setLastLapTime(newLapT);

        const nextLap = currentLap + 1;
        setCurrentLap(nextLap);
        setLapTime(0);

        if (currentLap >= settings.totalLaps) {
          setRaceState('finished');
          onRaceFinished({
            position: playerPosition,
            totalTime: totalRaceTime.current,
            bestLap: isNewBest ? newLapT : bestLapTime,
            lastLap: newLapT,
            topSpeed: topSpeedKmh.current,
            overtakeCount: overtakeCount.current,
            drsUseCount: drsUseCount.current,
            ersUseCount: ersUseCount.current,
            lapTimes: lapTimes.current,
          });
        } else {
          addToast({
            id: `lap-${currentLap}`,
            type: 'lap',
            title: `LAP ${currentLap} COMPLETE`,
            subtitle: `LAP TIME: ${newLapT.toFixed(3)}s ${isNewBest ? '★ NEW BEST!' : ''}`,
            duration: 3.0,
          });
        }
      } else {
        setLapTime(newLapT);
      }
    }

    // 6. Throttled UI State & Leaderboard Update (10 Hz)
    if (now - lastUiUpdate.current > 100) {
      lastUiUpdate.current = now;

      // Calculate Positions
      const playerDist = (currentLap - 1) * N + carState.idx;
      const competitors: { name: string; isPlayer: boolean; color: string; dist: number }[] = [
        { name: 'YOU', isPlayer: true, color: settings.bodyColor, dist: playerDist },
        ...aiCars.map((ai) => ({
          name: ai.cfg.name,
          isPlayer: false,
          color: ai.cfg.color,
          dist: (ai.lapNo - 1) * N + ai.idx,
        })),
      ];

      competitors.sort((a, b) => b.dist - a.dist);

      let currentPos = 1;
      const newOrder: RaceOrderRow[] = competitors.map((c, i) => {
        if (c.isPlayer) currentPos = i + 1;
        const leaderDist = competitors[0].dist;
        const gapSec = ((leaderDist - c.dist) / 720).toFixed(1);
        return {
          position: i + 1,
          name: c.name,
          isPlayer: c.isPlayer,
          color: c.color,
          gapText: i === 0 ? 'LEADER' : `+${gapSec}s`,
        };
      });

      if (currentPos !== playerPosition) {
        if (currentPos < prevPosition.current && raceState === 'run') {
          overtakeCount.current++;
          addToast({
            id: `overtake-${Date.now()}`,
            type: 'overtake',
            title: `OVERTAKE! UP TO P${currentPos}`,
            duration: 2.0,
          });
        }
        prevPosition.current = currentPos;
        setPlayerPosition(currentPos);
      }

      setRaceOrder(newOrder);
    }
  });

  return null;
}
