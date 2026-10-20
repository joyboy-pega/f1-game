'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  GameSettings,
  RaceState,
  RaceStatistics,
  RaceOrderRow,
  ToastMessage,
  DEFAULT_SETTINGS,
  WeatherType,
  CameraViewMode,
  VehicleModelType,
} from '@/lib/game/gameState';
import {
  createInitialCarState,
  CarPhysicsState,
  AICarState,
} from '@/lib/game/physics';
import { AI_CONFIGS } from '@/lib/game/constants';
import { audio } from '@/lib/game/audio';
import { controls } from '@/lib/game/controls';
import { GameCanvas } from './GameCanvas';
import { HUD } from '@/components/ui/HUD';
import { Minimap } from '@/components/ui/Minimap';
import { TelemetryPods } from '@/components/ui/TelemetryPods';
import { MobileControls } from '@/components/ui/MobileControls';
import { PauseMenu } from '@/components/ui/PauseMenu';
import { GameOver } from '@/components/ui/GameOver';

export function RacingGame() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Load URL query params or defaults
  const initialSettings = useMemo<GameSettings>(() => {
    const laps = parseInt(searchParams.get('laps') || '5', 10);
    const weather = (searchParams.get('weather') || 'sunny') as WeatherType;
    const carModel = (searchParams.get('car') || 'f1') as VehicleModelType;
    const bodyColor = searchParams.get('body') || '#e10600';
    const accentColor = searchParams.get('accent') || '#121212';
    const rimColor = searchParams.get('rim') || '#c0c0c0';
    const cam = (searchParams.get('cam') || 'chase') as CameraViewMode;

    return {
      ...DEFAULT_SETTINGS,
      totalLaps: isNaN(laps) ? 5 : laps,
      weather: ['sunny', 'cloudy', 'rain', 'snow'].includes(weather) ? weather : 'sunny',
      carModel: carModel === 'street' ? 'street' : 'f1',
      bodyColor,
      accentColor,
      rimColor,
      cameraView: ['chase', 'cockpit', 'tcam', 'hood'].includes(cam) ? cam : 'chase',
    };
  }, [searchParams]);

  const [settings, setSettings] = useState<GameSettings>(initialSettings);
  const [raceState, setRaceState] = useState<RaceState>('lights');
  const [lightsActiveCount, setLightsActiveCount] = useState(0);
  const [lightsOut, setLightsOut] = useState(false);

  const [currentLap, setCurrentLap] = useState(1);
  const [lapTime, setLapTime] = useState(0);
  const [bestLapTime, setBestLapTime] = useState<number | null>(null);
  const [lastLapTime, setLastLapTime] = useState<number | null>(null);
  const [playerPosition, setPlayerPosition] = useState(1);
  const [raceOrder, setRaceOrder] = useState<RaceOrderRow[]>([]);

  const [showPauseMenu, setShowPauseMenu] = useState(false);
  const [telemetryOpen, setTelemetryOpen] = useState(true);
  const [raceFinishedStats, setRaceFinishedStats] = useState<RaceStatistics | null>(null);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Persistent Car & AI states (zero reallocation)
  const carStateRef = useRef<CarPhysicsState>(createInitialCarState());
  const aiCarsRef = useRef<AICarState[]>(
    AI_CONFIGS.map((cfg) => ({
      x: 0,
      y: 0,
      a: 0,
      idx: 0,
      speed: 0,
      lapNo: 1,
      halfway: false,
      lapT: 0,
      totalDist: 0,
      cfg,
      finished: false,
    }))
  );

  // Initialize Audio & Controls listeners on mount
  useEffect(() => {
    controls.attachListeners();

    const handleFirstGesture = () => {
      audio.init();
      window.removeEventListener('keydown', handleFirstGesture);
      window.removeEventListener('pointerdown', handleFirstGesture);
    };

    window.addEventListener('keydown', handleFirstGesture);
    window.addEventListener('pointerdown', handleFirstGesture);

    return () => {
      controls.detachListeners();
      window.removeEventListener('keydown', handleFirstGesture);
      window.removeEventListener('pointerdown', handleFirstGesture);
    };
  }, []);

  const addToast = useCallback((toast: ToastMessage) => {
    setToasts((prev) => [...prev.filter((t) => t.id !== toast.id), toast]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== toast.id));
    }, toast.duration * 1000);
  }, []);

  // Keyboard shortcut listener for Menu, Camera, Reset, Telemetry, Weather, Car Model
  useEffect(() => {
    const handleKeys = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'KeyM') {
        if (!raceFinishedStats) {
          setShowPauseMenu((prev) => !prev);
          setRaceState((cur) => (cur === 'paused' ? 'run' : 'paused'));
        }
      } else if (e.code === 'KeyC') {
        cycleCameraView();
      } else if (e.code === 'KeyT') {
        setTelemetryOpen((prev) => !prev);
      } else if (e.code === 'KeyV') {
        toggleCarModel();
      } else if (e.code === 'KeyR') {
        resetCarPosition();
      }
    };

    window.addEventListener('keydown', handleKeys);
    return () => window.removeEventListener('keydown', handleKeys);
  }, [raceFinishedStats]);

  const cycleCameraView = () => {
    const modes: CameraViewMode[] = ['chase', 'cockpit', 'tcam', 'hood'];
    const idx = modes.indexOf(settings.cameraView);
    const next = modes[(idx + 1) % modes.length];
    setSettings((prev) => ({ ...prev, cameraView: next }));
  };

  const cycleWeather = () => {
    const weathers: WeatherType[] = ['sunny', 'cloudy', 'rain', 'snow'];
    const idx = weathers.indexOf(settings.weather);
    const next = weathers[(idx + 1) % weathers.length];
    setSettings((prev) => ({ ...prev, weather: next }));
  };

  const toggleCarModel = () => {
    const next: VehicleModelType = settings.carModel === 'f1' ? 'street' : 'f1';
    setSettings((prev) => ({ ...prev, carModel: next }));
  };

  const resetCarPosition = () => {
    const init = createInitialCarState();
    Object.assign(carStateRef.current, init);
    addToast({
      id: 'reset',
      type: 'lap',
      title: 'CAR RESET TO START LINE',
      duration: 1.5,
    });
  };

  const handleRestartRace = () => {
    resetCarPosition();
    setCurrentLap(1);
    setLapTime(0);
    setBestLapTime(null);
    setLastLapTime(null);
    setPlayerPosition(1);
    setLightsActiveCount(0);
    setLightsOut(false);
    setRaceFinishedStats(null);
    setShowPauseMenu(false);
    setRaceState('lights');
  };

  const handleResumeRace = () => {
    setShowPauseMenu(false);
    setRaceState('run');
  };

  const handleRaceFinished = (stats: RaceStatistics) => {
    setRaceFinishedStats(stats);
  };

  const updateSettings = (newSettings: Partial<GameSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black select-none font-sans">
      {/* 3D R3F Canvas Layer */}
      <GameCanvas
        carState={carStateRef.current}
        aiCars={aiCarsRef.current}
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
        onRaceFinished={handleRaceFinished}
      />

      {/* Real-time HTML HUD Layer matching exact HTML file */}
      <HUD
        carState={carStateRef.current}
        raceState={raceState}
        settings={settings}
        currentLap={currentLap}
        totalLaps={settings.totalLaps}
        lapTime={lapTime}
        bestLapTime={bestLapTime}
        lastLapTime={lastLapTime}
        playerPosition={playerPosition}
        raceOrder={raceOrder}
        toasts={toasts}
        lightsActiveCount={lightsActiveCount}
        lightsOut={lightsOut}
        telemetryOpen={telemetryOpen}
        onToggleTelemetry={() => setTelemetryOpen(!telemetryOpen)}
        onCycleCamera={cycleCameraView}
        onCycleWeather={cycleWeather}
        onToggleCarModel={toggleCarModel}
        onPause={() => {
          setShowPauseMenu(true);
          setRaceState('paused');
        }}
        addToast={addToast}
      />

      {/* Floating GPS Radar Minimap */}
      <Minimap carState={carStateRef.current} aiCars={aiCarsRef.current} />

      {/* Left & Right Telemetry Pods matching exact HTML file */}
      <TelemetryPods
        carState={carStateRef.current}
        isOpen={telemetryOpen}
        onToggle={() => setTelemetryOpen(!telemetryOpen)}
        addToast={addToast}
      />

      {/* Mobile Touch & Pointer Controls */}
      <div className="block sm:hidden">
        <MobileControls />
      </div>

      {/* In-Game Pause Menu matching #race-menu */}
      <PauseMenu
        isOpen={showPauseMenu}
        settings={settings}
        onUpdateSettings={updateSettings}
        onResume={handleResumeRace}
        onRestart={handleRestartRace}
        onExitToMenu={() => router.push('/')}
      />

      {/* Race Finished Modal matching #race-complete */}
      {raceFinishedStats && (
        <GameOver
          stats={raceFinishedStats}
          onRestart={handleRestartRace}
          onExitToMenu={() => router.push('/')}
        />
      )}
    </div>
  );
}
