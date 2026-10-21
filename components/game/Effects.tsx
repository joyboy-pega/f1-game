'use client';

import React, { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameStore } from '@/lib/game/store';
import { world } from '@/lib/game/sim/world';
import { QUALITY_PRESETS } from '@/lib/game/performance';
import { getFxEnv } from '@/lib/game/fx/env';
import { addCameraShake } from '@/lib/game/fx/shake';
import { CarFx } from './fx/CarFx';
import { fxTime } from './fx/ParticlePool';
import { WeatherParticles } from './fx/WeatherParticles';

/**
 * All in-world visual effects for every car (smoke, sparks, spray, dust, skid ribbons) plus
 * camera-following rain/snow. One useFrame drives them; pools are GPU-simulated (see ParticlePool).
 */
export function Effects() {
  const weather = useGameStore((s) => s.settings.weather);
  const timeOfDay = useGameStore((s) => s.settings.timeOfDay);
  const perf = QUALITY_PRESETS[useGameStore((s) => s.quality)];
  const env = useMemo(() => getFxEnv(weather, timeOfDay), [weather, timeOfDay]);

  const carFx = useMemo(
    () => new CarFx(perf.particleDensity, perf.skidSegments),
    [perf.particleDensity, perf.skidSegments],
  );
  const precip = useMemo(() => {
    if (weather !== 'rain' && weather !== 'snow') return null;
    return new WeatherParticles(weather, Math.round(perf.weatherParticles * (weather === 'snow' ? 0.8 : 1)));
  }, [weather, perf.weatherParticles]);

  useEffect(() => () => carFx.dispose(), [carFx]);
  useEffect(() => () => precip?.dispose(), [precip]);

  // Collisions: shake for the player and a spark burst for everyone.
  useEffect(() => {
    return world.events.subscribe((e) => {
      if (e.type !== 'collision') return;
      const pid = world.player.id;
      const k = Math.min(1, Math.max(0, e.intensity));
      carFx.burst(e.carId, k);
      if (e.otherId !== null) carFx.burst(e.otherId, k);
      if (e.carId === pid || e.otherId === pid) addCameraShake(0.25 + 0.5 * k);
    });
  }, [carFx]);

  useFrame((state, rawDt) => {
    if (useGameStore.getState().paused) return;
    const dt = Math.min(rawDt, 0.1);
    fxTime.value += dt;
    const cam = state.camera.position;
    carFx.update(dt, cam.x, cam.z, env);
    precip?.update(dt, cam, env.light);
  });

  return (
    <group name="effects">
      <primitive object={carFx.group} />
      {precip && <primitive object={precip.mesh} />}
    </group>
  );
}
