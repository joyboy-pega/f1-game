'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  Bloom,
  BrightnessContrast,
  EffectComposer,
  HueSaturation,
  SMAA,
  ToneMapping,
  Vignette,
} from '@react-three/postprocessing';
import { ToneMappingMode, type VignetteEffect } from 'postprocessing';
import * as THREE from 'three';
import { useGameStore } from '@/lib/game/store';
import { world } from '@/lib/game/sim/world';
import { QUALITY_PRESETS } from '@/lib/game/performance';
import type { TimeOfDay, WeatherType } from '@/lib/game/constants';

interface Grade {
  saturation: number;
  brightness: number;
  contrast: number;
}

const GRADE: Record<WeatherType, Grade> = {
  sunny: { saturation: 0.1, brightness: 0, contrast: 0.06 },
  cloudy: { saturation: -0.04, brightness: 0, contrast: 0.05 },
  rain: { saturation: -0.2, brightness: -0.02, contrast: 0.08 },
  snow: { saturation: -0.1, brightness: -0.02, contrast: 0.04 },
  dynamic: { saturation: 0.0, brightness: 0, contrast: 0.06 },
};

const BLOOM: Record<TimeOfDay, { intensity: number; threshold: number }> = {
  // Threshold sits above sunlit white kerbs / sky so only true emissives bloom by day.
  day: { intensity: 0.55, threshold: 1.1 },
  sunset: { intensity: 0.75, threshold: 1.0 },
  night: { intensity: 1.15, threshold: 0.8 },
};

/**
 * Post-processing stack, gated by the quality tier (QUALITY_PRESETS[...].postTier):
 *   basic: SMAA + bloom + tone mapping.   full: + vignette (speed-reactive) + weather colour grade.
 * The composer owns tone mapping, so the renderer is switched to NoToneMapping while it is mounted
 * (otherwise colours are mapped twice) and the original mapping is restored on unmount.
 * MSAA is disabled on the composer (multisampling=0): SMAA is the AA when this stack is active.
 */
export function PostFX() {
  const tier = QUALITY_PRESETS[useGameStore((s) => s.quality)].postTier;
  const weather = useGameStore((s) => s.settings.weather);
  const tod = useGameStore((s) => s.settings.timeOfDay);
  const gl = useThree((s) => s.gl);
  const vignette = useRef<VignetteEffect>(null);

  useEffect(() => {
    if (tier === 'off') return;
    const prev = gl.toneMapping;
    gl.toneMapping = THREE.NoToneMapping;
    return () => {
      gl.toneMapping = prev;
    };
  }, [gl, tier]);

  // Speed vignette: a gentle tunnel above ~250 km/h. Mutates the effect directly, no React work.
  useFrame((_, dt) => {
    const v = vignette.current;
    if (!v) return;
    const kmh = world.player?.phys.kmh ?? 0;
    const target = 0.5 + Math.min(1, Math.max(0, (kmh - 250) / 100)) * 0.22;
    v.darkness += (target - v.darkness) * Math.min(1, dt * 3);
  });

  const grade = GRADE[weather];
  const bloom = useMemo(() => {
    const b = BLOOM[tod];
    // Rain lights and wet-surface highlights read better with a touch more glow.
    return weather === 'rain' ? { ...b, intensity: b.intensity * 1.15 } : b;
  }, [tod, weather]);

  if (tier === 'off') return null;
  const full = tier === 'full';

  return (
    <EffectComposer multisampling={0} enableNormalPass={false} frameBufferType={THREE.HalfFloatType}>
      <Bloom
        mipmapBlur
        levels={5}
        intensity={bloom.intensity}
        luminanceThreshold={bloom.threshold}
        luminanceSmoothing={0.12}
        radius={0.72}
      />
      {full ? <Vignette ref={vignette} offset={0.32} darkness={0.5} eskil={false} /> : null}
      {full && Math.abs(grade.saturation) > 0.005 ? <HueSaturation saturation={grade.saturation} /> : null}
      {full && (Math.abs(grade.brightness) > 0.005 || Math.abs(grade.contrast) > 0.005) ? (
        <BrightnessContrast brightness={grade.brightness} contrast={grade.contrast} />
      ) : null}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <SMAA />
    </EffectComposer>
  );
}
