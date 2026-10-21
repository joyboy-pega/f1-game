'use client';

import dynamic from 'next/dynamic';
import { useEffect } from 'react';
import { DRIVER_ROSTER } from '@/lib/game/constants';
import { useGameStore } from '@/lib/game/store';
import { createBrain } from '@/lib/game/sim/ai';
import { world } from '@/lib/game/sim/world';

const RacingGame = dynamic(() => import('@/components/game/RacingGame').then((m) => m.RacingGame), { ssr: false });

/**
 * Replay test bench: an autopilot drives the player so a recording builds up on its own, then the
 * replay opens after `?t=` seconds (default 25; negative = never, just autopilot). Add `?cam=tv|heli|onboard|chase` to force a camera.
 */
export default function Page() {
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const delay = parseFloat(q.get('t') ?? '25') * 1000;
    let armed = false;
    const arm = setInterval(() => {
      if (armed || world.phase === 'grid' && world.raceTime === 0 && world.cars.length === 0) return;
      if (!world.player.ai) {
        world.player.ai = createBrain(99, 4242);
        world.player.skill = DRIVER_ROSTER[0].skill;
      }
      armed = true;
      clearInterval(arm);
      if (delay < 0) return; // autopilot only: let the race finish normally
      setTimeout(() => {
        useGameStore.getState().setReplayActive(true);
        const cam = q.get('cam');
        if (cam) {
          import('@/lib/game/replay/state').then(({ replay }) => {
            replay.camMode = cam as typeof replay.camMode;
          });
        }
      }, delay);
    }, 500);
    return () => clearInterval(arm);
  }, []);
  return <RacingGame />;
}
