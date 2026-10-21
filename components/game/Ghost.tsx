'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { F1Car } from '@/components/game/car/F1Car';
import { createInitialCarState } from '@/lib/game/physics';
import { ghostStore, sampleGhost, type GhostSample } from '@/lib/game/replay/ghost';
import { makeCar } from '@/lib/game/sim/world';
import { useGameStore } from '@/lib/game/store';
import { world } from '@/lib/game/sim/world';

const GHOST_OPACITY = 0.34;

/**
 * Time-trial ghost: a translucent copy of your best lap, replayed from the start line.
 * It lives outside `world.cars`, so it never collides or affects timing.
 */
export function Ghost() {
  const show = useGameStore((s) => s.settings.showGhost);
  const mode = useGameStore((s) => s.settings.mode);
  const livery = useGameStore((s) => s.settings.livery);
  const [, bump] = useState(0);
  const group = useRef<THREE.Group>(null);
  const sample = useMemo<GhostSample>(() => ({ x: 0, y: 0, a: 0, steer: 0, vf: 0, brake: 0, drsOpen: false }), []);

  // Re-render when a new best ghost is committed.
  useEffect(() => ghostStore.subscribe(() => bump((n) => n + 1)), []);

  const car = useMemo(() => {
    const c = makeCar(500, false, 0, 0, 'soft');
    c.phys = createInitialCarState(0, 0);
    c.driver = { name: 'Ghost', code: 'GHO', team: 'Ghost', livery: { ...livery, body: '#9ad7ff', accent: '#ffffff' } };
    return c;
  }, [livery]);

  // Make every material of the ghost translucent (cloned so shared car materials stay opaque).
  useEffect(() => {
    const g = group.current;
    if (!g) return;
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = false;
      const apply = (mat: THREE.Material) => {
        const c = mat.clone();
        c.transparent = true;
        c.opacity = GHOST_OPACITY;
        c.depthWrite = false;
        return c;
      };
      m.material = Array.isArray(m.material) ? m.material.map(apply) : apply(m.material);
    });
  }, [car]);

  useFrame(() => {
    const g = group.current;
    const best = ghostStore.best;
    if (!g) return;
    const start = world.player.timing.lapStartTime;
    const active = show && mode === 'timetrial' && best && start !== null && world.phase === 'racing' && world.player.timing.lapsCompleted >= 0;
    g.visible = !!active;
    if (!active || !best || start === null) return;
    if (!sampleGhost(best, world.raceTime - start, sample)) {
      g.visible = false;
      return;
    }
    const p = car.phys;
    p.x = sample.x;
    p.y = sample.y;
    p.a = sample.a;
    p.steer = sample.steer;
    p.vf = sample.vf;
    p.brakeInput = sample.brake;
    p.drsOpen = sample.drsOpen;
  });

  return (
    <group ref={group} visible={false}>
      <F1Car car={car} />
    </group>
  );
}
