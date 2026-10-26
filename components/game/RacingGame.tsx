'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { audio } from '@/lib/game/audio';
import { controls } from '@/lib/game/controls';
import { migrateLegacyQualityKey, performanceGovernor } from '@/lib/game/performance';
import { useGameStore } from '@/lib/game/store';
import { world } from '@/lib/game/sim/world';
import { ghostStore, loadGhost, migrateLegacyGhostKeys } from '@/lib/game/replay/ghost';
import { ensureTrack } from '@/lib/game/track';
import { ReplayControls } from '@/components/ui/ReplayControls';
import { GameCanvas } from './GameCanvas';
import { HUD } from '@/components/ui/HUD';
import { Minimap } from '@/components/ui/Minimap';
import { TelemetryPods } from '@/components/ui/TelemetryPods';
import { MobileControls } from '@/components/ui/MobileControls';
import { PauseMenu } from '@/components/ui/PauseMenu';
import { GameOver } from '@/components/ui/GameOver';

/** Build the world from current settings, then bump the session so the scene remounts against it. */
export async function startSession() {
  const settings = useGameStore.getState().settings;
  // Load (and build) the selected circuit before the world is set up against it.
  try {
    await ensureTrack(settings.trackId);
  } catch {
    useGameStore.getState().setSettings({ trackId: 'buddh' });
  }
  const s = useGameStore.getState().settings;
  world.setup(s);
  ghostStore.set(s.mode === 'timetrial' ? loadGhost(s.trackId, s.weather) : null);
  useGameStore.getState().newSession();
}

/** Owns the race session lifecycle and layers the DOM HUD over the canvas. */
export function RacingGame() {
  const router = useRouter();
  const sessionId = useGameStore((s) => s.sessionId);
  const results = useGameStore((s) => s.results);
  const paused = useGameStore((s) => s.paused);
  const replayActive = useGameStore((s) => s.replayActive);
  const telemetryOpen = useGameStore((s) => s.telemetryOpen || s.settings.showTelemetry);
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
      try {
        migrateLegacyGhostKeys(window.localStorage);
      } catch {}
      void startSession().then(() => setReady(true));
    };
    if (useGameStore.persist.hasHydrated()) start();
    else return useGameStore.persist.onFinishHydration(start);
  }, []);

  // Touch controls for any coarse-pointer device, mobile viewport, or touch interaction.
  useEffect(() => {
    const checkTouch = () => {
      const isCoarse = window.matchMedia('(pointer: coarse)').matches;
      const hasTouch = 'ontouchstart' in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
      const isMobileWidth = window.innerWidth <= 1024;
      return Boolean(isCoarse || hasTouch || isMobileWidth);
    };
    setTouch(checkTouch());
    const handleTouchStart = () => setTouch(true);
    window.addEventListener('touchstart', handleTouchStart, { once: true });
    return () => window.removeEventListener('touchstart', handleTouchStart);
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

  const restart = () => void startSession();
  const exit = () => router.push('/');

  if (!ready) return null;

  return (
    <div className="fixed inset-0 w-full h-full min-h-[100dvh] overflow-hidden bg-black select-none font-sans touch-none">
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
