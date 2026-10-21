'use client';

import { useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CameraRig, type RigMode } from '@/lib/game/camera/rig';
import { useGameStore } from '@/lib/game/store';
import { world } from '@/lib/game/sim/world';

/** Seconds of grid footage covered by the intro dolly (hold + five lights). */
const INTRO_SECONDS = 6;

/**
 * Player camera. All smoothing, FOV, look-back and shake live in CameraRig; this component picks the
 * mode: the selected view, or a cinematic grid intro before a race that hands over at lights out.
 * While a replay is playing the ReplayDirector owns the camera instead.
 */
export function Camera() {
  const { camera } = useThree();
  const rig = useMemo(() => new CameraRig(), []);
  const viewMode = useGameStore((s) => s.settings.cameraView);

  useFrame((_, dt) => {
    if (useGameStore.getState().replayActive) return;
    const cam = camera as THREE.PerspectiveCamera;
    if (!cam.isPerspectiveCamera) return;

    const p = world.player.phys;
    const intro = world.isRace && (world.phase === 'grid' || world.phase === 'lights');
    let mode: RigMode = viewMode;
    let introP = 0;
    if (intro) {
      mode = 'intro';
      const t = world.phase === 'grid' ? world.phaseTime : 1 + world.phaseTime;
      introP = Math.min(1, t / INTRO_SECONDS);
    }
    const pole = world.order[0]?.phys;
    rig.update(cam, p, mode, dt, {
      lookBack: world.player.ctrl.lookBack,
      introP,
      pole: pole ? { x: pole.x, y: pole.y, a: pole.a } : undefined,
    });
  });

  return null;
}
