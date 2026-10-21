'use client';

import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { audio } from '@/lib/game/audio';
import { playSimEvent } from '@/lib/game/audio/events';
import { createAudioFrame } from '@/lib/game/audio/types';
import { smoothCurvature } from '@/lib/game/constants';
import { useGameStore } from '@/lib/game/store';
import { world } from '@/lib/game/sim/world';

/**
 * The single place where simulation state is wired into audio: fills a reused AudioFrame
 * every rendered frame and routes sim events to sounds. Renders nothing. Mount inside the
 * <Canvas> after <GameLoop/> so the frame sees the freshly stepped world.
 */
export function AudioBridge() {
  const frame = useMemo(() => createAudioFrame(32), []);

  // Scene lifetime: fade everything in on mount, out on unmount (leaving /game, restart).
  useEffect(() => {
    audio.setActive(true);
    return () => audio.setActive(false);
  }, []);

  useEffect(
    () =>
      world.events.subscribe((e) => {
        playSimEvent(audio, e, world.player.id);
      }),
    []
  );

  useFrame((_, delta) => {
    if (!audio.ready) return;
    const st = useGameStore.getState();
    const pl = world.player;
    const p = pl.phys;
    const f = frame;

    f.dt = delta;
    f.paused = st.paused || world.paused;
    f.results = !!st.results;
    f.phase = world.phase;
    f.camera = st.settings.cameraView;
    f.weather = world.settings.weather;
    f.timeOfDay = world.settings.timeOfDay;

    const q = f.player;
    q.x = p.x;
    q.y = p.y;
    q.a = p.a;
    q.vf = p.vf;
    q.vl = p.vl;
    q.steer = p.steer;
    q.rpm = p.rpm;
    q.gear = p.gear;
    q.kmh = p.kmh;
    q.throttle = pl.ctrl.throttle;
    q.brake = p.brakeInput;
    q.boosting = p.isBoosting;
    q.driftIntensity = p.driftIntensity;
    q.wheelSlipFront = p.wheelSlipFront;
    q.wheelSlipRear = p.wheelSlipRear;
    q.idx = p.idx;
    q.lateral = pl.lateral;
    q.curvature = smoothCurvature[p.idx] ?? 0;
    q.onTrack = pl.surface.onTrack;
    q.gravel = pl.surface.gravel;
    q.sparks = p.guardRailSparks;
    q.inPit = pl.inPit;

    let n = 0;
    const cars = world.cars;
    for (let i = 0; i < cars.length && n < f.ai.length; i++) {
      const c = cars[i];
      if (c === pl) continue;
      const a = f.ai[n++];
      a.id = c.id;
      a.x = c.phys.x;
      a.y = c.phys.y;
      a.rpm = c.phys.rpm;
      a.throttle = c.ctrl.throttle;
      a.kmh = c.phys.kmh;
    }
    f.aiCount = n;

    audio.update(f);
  });

  return null;
}
