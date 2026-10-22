'use client';

import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { PerformanceMonitor, type PerformanceMonitorApi } from '@react-three/drei';
import * as THREE from 'three';
import { GOVERNOR, QUALITY_PRESETS, dprFor, performanceGovernor } from '@/lib/game/performance';
import { useGameStore } from '@/lib/game/store';

/**
 * Drives render resolution continuously from measured frame rate (PerformanceMonitor) and, only after the
 * resolution has sat on its floor for a while, lets the governor drop a whole tier. The Canvas is never remounted.
 * Hysteresis band: decline below 45 fps, incline above 58 fps (refresh rates above 100 Hz: 55-100).
 * AUTO only; a manual quality choice pins the tier at its full resolution.
 */
export function AdaptiveQuality() {
  const setDpr = useThree((s) => s.setDpr);
  const scene = useThree((s) => s.scene);
  const quality = useGameStore((s) => s.quality);
  const auto = useGameStore((s) => s.settings.quality === 'AUTO');
  const mountedAt = useRef(performance.now());
  const factor = useRef(1);

  // Tier or mode changed: apply that tier's resolution.
  useEffect(() => {
    setDpr(dprFor(quality, auto ? factor.current : 1));
  }, [quality, auto, setDpr]);

  // Tier changed (not on mount): rebuild only what the change invalidates, instead of remounting the Canvas.
  //  - a different shadow-map size needs the old map freed so three allocates the new size;
  //  - toggling shadows changes compiled programs, so refresh materials (only then: recompiling is the expensive part).
  const prevQuality = useRef(quality);
  useEffect(() => {
    const from = QUALITY_PRESETS[prevQuality.current];
    const to = QUALITY_PRESETS[quality];
    prevQuality.current = quality;
    if (from === to) return;
    const resizeShadows = from.shadowMapSize !== to.shadowMapSize;
    const toggledShadows = from.shadows !== to.shadows;
    if (!resizeShadows && !toggledShadows) return;
    scene.traverse((o) => {
      const light = o as THREE.DirectionalLight;
      if (resizeShadows && light.isDirectionalLight && light.shadow?.map) {
        light.shadow.map.dispose();
        light.shadow.map = null;
      }
      const mesh = o as THREE.Mesh;
      if (toggledShadows && mesh.isMesh) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) if (m) m.needsUpdate = true;
      }
    });
  }, [quality, scene]);

  if (!auto) return null;

  const warm = () => performance.now() - mountedAt.current < GOVERNOR.warmupMs;
  const applyTier = (to: 'LOW' | 'MEDIUM' | 'HIGH' | null) => {
    if (to) useGameStore.getState().setQuality(to);
  };

  return (
    <PerformanceMonitor
      factor={1}
      step={0.2}
      bounds={(refreshrate) => (refreshrate > 100 ? [55, 100] : [45, 58])}
      onDecline={(api: PerformanceMonitorApi) => {
        if (warm()) {
          // Load-time hitch (shader compiles, lazy chunks): undo the monitor's own factor change.
          api.factor = Math.min(1, api.factor + 0.2);
          return;
        }
        applyTier(performanceGovernor.noteDecline(api.factor, performance.now()));
      }}
      onIncline={(api: PerformanceMonitorApi) => {
        if (!warm()) applyTier(performanceGovernor.noteIncline(api.factor, performance.now()));
      }}
      onChange={(api: PerformanceMonitorApi) => {
        factor.current = api.factor;
        if (!performanceGovernor.isLocked()) setDpr(dprFor(useGameStore.getState().quality, api.factor));
      }}
    />
  );
}
