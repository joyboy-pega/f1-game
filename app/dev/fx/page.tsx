'use client';

// Dev harness for visual effects: /dev/fx?weather=rain&tod=night&quality=HIGH&cam=cockpit&laps=3&ai=9
// Applies the query params to the persisted settings, then mounts the real game.
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useGameStore } from '@/lib/game/store';
import type { GameSettings } from '@/lib/game/gameState';

const RacingGame = dynamic(() => import('@/components/game/RacingGame').then((m) => m.RacingGame), { ssr: false });

export default function FxDevPage() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const apply = () => {
      const q = new URLSearchParams(window.location.search);
      const patch: Partial<GameSettings> = {};
      const weather = q.get('weather');
      const tod = q.get('tod');
      const quality = q.get('quality');
      const cam = q.get('cam');
      if (weather) patch.weather = weather as GameSettings['weather'];
      if (tod) patch.timeOfDay = tod as GameSettings['timeOfDay'];
      if (quality) patch.quality = quality as GameSettings['quality'];
      if (cam) patch.cameraView = cam as GameSettings['cameraView'];
      if (q.get('laps')) patch.totalLaps = Number(q.get('laps'));
      if (q.get('ai')) patch.aiCount = Number(q.get('ai'));
      if (q.get('grid')) patch.gridPosition = Number(q.get('grid'));
      patch.audioEnabled = false;
      useGameStore.getState().setSettings(patch);
      setReady(true);
    };
    if (useGameStore.persist.hasHydrated()) apply();
    else return useGameStore.persist.onFinishHydration(apply);
  }, []);

  return <main className="w-screen h-screen overflow-hidden bg-slate-950">{ready && <RacingGame />}</main>;
}
