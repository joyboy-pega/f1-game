'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { audio } from '@/lib/game/audio';
import { controls } from '@/lib/game/controls';
import { migrateLegacyQualityKey, performanceGovernor } from '@/lib/game/performance';
import { useGameStore } from '@/lib/game/store';
import { world } from '@/lib/game/sim/world';
import { ghostStore, loadGhost } from '@/lib/game/replay/ghost';
import { ReplayControls } from '@/components/ui/ReplayControls';
import { GameCanvas } from './GameCanvas';
import { HUD } from '@/components/ui/HUD';
import { Minimap } from '@/components/ui/Minimap';
import { TelemetryPods } from '@/components/ui/TelemetryPods';
import { MobileControls } from '@/components/ui/MobileControls';
import { PauseMenu } from '@/components/ui/PauseMenu';
import { GameOver } from '@/components/ui/GameOver';

/** Build the world from current settings, then bump the session so the scene remounts against it. */
export function startSession() {
  const settings = useGameStore.getState().settings;
  world.setup(settings);
  ghostStore.set(settings.mode === 'timetrial' ? loadGhost(settings.weather) : null);
  useGameStore.getState().newSession();
}

/** Owns the race session lifecycle and layers the DOM HUD over the canvas. */
export function RacingGame() {
  const router = useRouter();
  const sessionId = useGameStore((s) => s.sessionId);
  const results = useGameStore((s) => s.results);
  const paused = useGameStore((s) => s.paused);
  const replayActive = useGameStore((s) => s.replayActive);
  const telemetryOpen = useGameStore((s) => s.telemetryOpen);
  const showMinimap = useGameStore((s) => s.settings.showMinimap);
  const quality = useGameStore((s) => s.settings.quality);
  const audioEnabled = useGameStore((s) => s.settings.audioEnabled);
  const volume = useGameStore((s) => s.settings.volume);
  const [ready, setReady] = useState(false);
  const [touch, setTouch] = useState(false);

  // Wait for persisted settings to hydrate, then start the first session.
  useEffect(() => {
    const start = () => {
      // The old standalone quality key is folded into settings.quality once, then deleted (one source of truth).
      const legacy = migrateLegacyQualityKey(window.localStorage);
      const st = useGameStore.getState();
      if (legacy && st.settings.quality === 'AUTO') st.setSettings({ quality: legacy });
      startSession();
      setReady(true);
    };
    if (useGameStore.persist.hasHydrated()) start();
    else return useGameStore.persist.onFinishHydration(start);
  }, []);

  // Touch controls for any coarse-pointer device (phones in landscape are wider than 640 px).
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    setTouch(mq.matches);
    const on = (e: MediaQueryListEvent) => setTouch(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  useEffect(() => {
    performanceGovernor.setQuality(quality);
    useGameStore.getState().setQuality(performanceGovernor.getSettings().level);
  }, [quality]);

  useEffect(() => {
    audio.setVolume(volume);
    if (audio.isEnabled() !== audioEnabled) audio.toggleAudio();
  }, [audioEnabled, volume]);

  useEffect(() => {
    controls.attachListeners();
    const unlockAudio = () => audio.init();
    window.addEventListener('keydown', unlockAudio, { once: true });
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    return () => {
      controls.detachListeners();
      window.removeEventListener('keydown', unlockAudio);
      window.removeEventListener('pointerdown', unlockAudio);
    };
  }, []);

  const restart = startSession;
  const exit = () => router.push('/');

  if (!ready) return null;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black select-none font-sans">
      <GameCanvas key={sessionId} />
      {replayActive ? null : (
        <>
          <HUD />
          {showMinimap && <Minimap />}
          {telemetryOpen && <TelemetryPods />}
          {touch && <MobileControls />}
        </>
      )}
      {paused && !results && (
        <PauseMenu onResume={() => useGameStore.getState().setPaused(false)} onRestart={restart} onExitToMenu={exit} />
      )}
      {replayActive && <ReplayControls />}
      {results && <GameOver results={results} onRestart={restart} onExitToMenu={exit} />}
    </div>
  );
}
