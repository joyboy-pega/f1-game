'use client';

import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { CarPhysicsState, AICarState } from '@/lib/game/physics';
import { GameSettings, RaceState, RaceOrderRow, ToastMessage } from '@/lib/game/gameState';
import { performanceGovernor } from '@/lib/game/performance';
import { GamePhysics } from './Physics';
import { Track } from './Track';
import { TrackProps } from './TrackProps';
import { Car } from './Car';
import { AICars } from './AICars';
import { Camera } from './Camera';
import { Environment } from './Environment';
import { Effects } from './Effects';
import { GameManager } from './GameManager';

interface GameCanvasProps {
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

export function GameCanvas({
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
}: GameCanvasProps) {
  const perf = performanceGovernor.getSettings();

  return (
    <div className="relative w-full h-full select-none overflow-hidden bg-slate-900">
      <Canvas
        shadows={perf.shadows}
        dpr={perf.pixelRatio}
        camera={{ position: [0, 30, -100], fov: 65, near: 0.5, far: 14000 }}
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.1,
        }}
      >
        <Suspense fallback={null}>
          <Environment
            weather={settings.weather}
            carState={carState}
            shadows={perf.shadows}
            shadowMapSize={perf.shadowMapSize}
          />

          <GamePhysics>
            <Track weather={settings.weather} />
            <TrackProps lightsActiveCount={lightsActiveCount} lightsOut={lightsOut} />

            <Car
              carState={carState}
              modelType={settings.carModel}
              bodyColor={settings.bodyColor}
              accentColor={settings.accentColor}
              rimColor={settings.rimColor}
            />

            <AICars aiCars={aiCars} />
          </GamePhysics>

          <Effects
            carState={carState}
            weather={settings.weather}
            particleDensity={perf.particleDensity}
          />

          <Camera carState={carState} viewMode={settings.cameraView} />

          <GameManager
            carState={carState}
            aiCars={aiCars}
            settings={settings}
            raceState={raceState}
            setRaceState={setRaceState}
            lightsActiveCount={lightsActiveCount}
            setLightsActiveCount={setLightsActiveCount}
            lightsOut={lightsOut}
            setLightsOut={setLightsOut}
            currentLap={currentLap}
            setCurrentLap={setCurrentLap}
            lapTime={lapTime}
            setLapTime={setLapTime}
            bestLapTime={bestLapTime}
            setBestLapTime={setBestLapTime}
            lastLapTime={lastLapTime}
            setLastLapTime={setLastLapTime}
            playerPosition={playerPosition}
            setPlayerPosition={setPlayerPosition}
            raceOrder={raceOrder}
            setRaceOrder={setRaceOrder}
            addToast={addToast}
            onRaceFinished={onRaceFinished}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
