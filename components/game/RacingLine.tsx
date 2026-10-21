'use client';

import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { N } from '@/lib/game/constants';
import { useGameStore } from '@/lib/game/store';
import { lineHeading, lineSpeed, lineX, lineY } from '@/lib/game/sim/racingLine';
import { world } from '@/lib/game/sim/world';

const POINTS = 44; // ~1000 units of line ahead (spline points are ~24 units apart)
const HALF_WIDTH = 1.9;
const Y = 0.16;

// Segment colours: full throttle / lift / brake
const GREEN: [number, number, number] = [0.1, 0.9, 0.35];
const YELLOW: [number, number, number] = [1, 0.82, 0.1];
const RED: [number, number, number] = [1, 0.15, 0.1];

/**
 * Racing-line assist: a thin ribbon over the asphalt ahead of the player, coloured by what the
 * driver should do there (green = throttle, yellow = lift, red = brake). One draw call, dynamic
 * geometry, nothing allocated per frame.
 */
export function RacingLine() {
  const mode = useGameStore((s) => s.settings.assists.racingLine);

  const { geometry, positions, colors } = useMemo(() => {
    const positions = new Float32Array(POINTS * 2 * 3);
    const colors = new Float32Array(POINTS * 2 * 4);
    const index: number[] = [];
    for (let i = 0; i < POINTS - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4).setUsage(THREE.DynamicDrawUsage));
    geometry.setIndex(index);
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e6);
    return { geometry, positions, colors };
  }, []);

  useFrame(() => {
    if (mode === 'off') return;
    const p = world.player.phys;
    const v = Math.max(0, p.vf);
    const full = mode === 'full';
    const start = p.idx;

    for (let k = 0; k < POINTS; k++) {
      const i = (start + k) % N;
      const j = (i + 1) % N;
      const target = lineSpeed[i];
      const decel = target - lineSpeed[j]; // >0 while the profile is still slowing down
      let c = GREEN;
      let show = full;
      if (decel > 7 || target < v * 0.9) {
        c = RED;
        show = true;
      } else if (target < v * 0.985) {
        c = YELLOW;
        show = true;
      }

      // Perpendicular of the line heading (sim x,y -> three x,z)
      const h = lineHeading[i];
      const nx = -Math.sin(h);
      const nz = Math.cos(h);
      const px = lineX[i];
      const pz = lineY[i];
      const o = k * 6;
      positions[o] = px - nx * HALF_WIDTH;
      positions[o + 1] = Y;
      positions[o + 2] = pz - nz * HALF_WIDTH;
      positions[o + 3] = px + nx * HALF_WIDTH;
      positions[o + 4] = Y;
      positions[o + 5] = pz + nz * HALF_WIDTH;

      // Fade out along the distance so the far end dissolves into the track
      const alpha = show ? 0.78 * (1 - k / POINTS) : 0;
      const co = k * 8;
      for (let s = 0; s < 2; s++) {
        colors[co + s * 4] = c[0];
        colors[co + s * 4 + 1] = c[1];
        colors[co + s * 4 + 2] = c[2];
        colors[co + s * 4 + 3] = alpha;
      }
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
  });

  if (mode === 'off') return null;
  return (
    <mesh geometry={geometry} frustumCulled={false} renderOrder={2}>
      <meshBasicMaterial vertexColors transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} side={THREE.DoubleSide} toneMapped={false} />
    </mesh>
  );
}
