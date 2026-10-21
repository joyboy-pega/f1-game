'use client';

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '@/lib/game/store';
import { world } from '@/lib/game/sim/world';
import { QUALITY_PRESETS } from '@/lib/game/performance';

const SKID_MAX = 180;
const SMOKE_MAX = 90;
const RAIN_COUNT = 900;
const SNOW_COUNT = 700;

export function Effects() {
  const weather = useGameStore((s) => s.settings.weather);
  const { particleDensity } = QUALITY_PRESETS[useGameStore((s) => s.quality)];
  // 1. Skid marks (instanced mesh)
  const skidMeshRef = useRef<THREE.InstancedMesh>(null);
  const skidHead = useRef(0);
  const lastSkidPos = useRef(new THREE.Vector2());

  const skidDummy = useMemo(() => new THREE.Object3D(), []);

  // 2. Tire smoke particles
  const smokePos = useMemo(() => new Float32Array(SMOKE_MAX * 3), []);
  const smokeData = useMemo(() => {
    return Array.from({ length: SMOKE_MAX }, () => ({
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
      maxLife: 1.0,
      size: 15,
    }));
  }, []);
  const smokeHead = useRef(0);
  const smokeGeoRef = useRef<THREE.BufferGeometry>(null);

  const smokeTexture = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext('2d');
    if (ctx) {
      const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
      grad.addColorStop(0, 'rgba(235, 240, 248, 0.7)');
      grad.addColorStop(0.4, 'rgba(200, 215, 230, 0.3)');
      grad.addColorStop(1, 'rgba(160, 175, 190, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);
    }
    return new THREE.CanvasTexture(c);
  }, []);

  // 3. Weather Particles (Rain / Snow)
  const rainGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(RAIN_COUNT * 3);
    for (let i = 0; i < RAIN_COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 450;
      pos[i * 3 + 1] = Math.random() * 160;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 450;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return geo;
  }, []);

  const snowGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(SNOW_COUNT * 3);
    for (let i = 0; i < SNOW_COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 450;
      pos[i * 3 + 1] = Math.random() * 140;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 450;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return geo;
  }, []);

  const rainRef = useRef<THREE.Points>(null);
  const snowRef = useRef<THREE.Points>(null);

  // Initialize skid mark positions underground
  React.useEffect(() => {
    if (!skidMeshRef.current) return;
    for (let i = 0; i < SKID_MAX; i++) {
      skidDummy.position.set(0, -100, 0);
      skidDummy.updateMatrix();
      skidMeshRef.current.setMatrixAt(i, skidDummy.matrix);
    }
    skidMeshRef.current.instanceMatrix.needsUpdate = true;
  }, [skidDummy]);

  useFrame((_, dt) => {
    const carState = world.player.phys;
    // 1. Skid marks logic
    const isSkidding = (carState.isDrifting && carState.kmh > 60) || (carState.brakeInput > 0.6 && carState.kmh > 35);
    if (isSkidding && skidMeshRef.current) {
      const d = Math.hypot(carState.x - lastSkidPos.current.x, carState.y - lastSkidPos.current.y);
      if (d > 7) {
        lastSkidPos.current.set(carState.x, carState.y);
        const idx = skidHead.current;
        skidDummy.position.set(carState.x, 0.1, carState.y);
        skidDummy.rotation.set(-Math.PI / 2, 0, carState.a);
        skidDummy.updateMatrix();
        skidMeshRef.current.setMatrixAt(idx, skidDummy.matrix);
        skidMeshRef.current.instanceMatrix.needsUpdate = true;
        skidHead.current = (idx + 1) % SKID_MAX;
      }
    }

    // 2. Tire smoke logic
    if (carState.isDrifting && carState.driftIntensity > 0.15 && Math.random() < 0.65 * particleDensity) {
      const sIdx = smokeHead.current;
      smokeData[sIdx].life = 1.0;
      smokeData[sIdx].maxLife = 0.6 + Math.random() * 0.4;
      smokeData[sIdx].vx = (Math.random() - 0.5) * 12;
      smokeData[sIdx].vy = 4 + Math.random() * 8;
      smokeData[sIdx].vz = (Math.random() - 0.5) * 12;

      smokePos[sIdx * 3] = carState.x + (Math.random() - 0.5) * 12;
      smokePos[sIdx * 3 + 1] = 2.0;
      smokePos[sIdx * 3 + 2] = carState.y + (Math.random() - 0.5) * 12;
      smokeHead.current = (sIdx + 1) % SMOKE_MAX;
    }

    for (let i = 0; i < SMOKE_MAX; i++) {
      if (smokeData[i].life > 0) {
        smokeData[i].life -= dt / smokeData[i].maxLife;
        smokePos[i * 3] += smokeData[i].vx * dt;
        smokePos[i * 3 + 1] += smokeData[i].vy * dt;
        smokePos[i * 3 + 2] += smokeData[i].vz * dt;
        if (smokeData[i].life <= 0) {
          smokePos[i * 3 + 1] = -100;
        }
      }
    }
    if (smokeGeoRef.current) {
      smokeGeoRef.current.attributes.position.needsUpdate = true;
    }

    // 3. Rain / Snow position following
    if (weather === 'rain' && rainRef.current) {
      rainRef.current.position.set(carState.x, 0, carState.y);
      const arr = rainGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < RAIN_COUNT; i++) {
        arr[i * 3 + 1] -= 320 * dt;
        if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] = 160;
      }
      rainGeo.attributes.position.needsUpdate = true;
    }

    if (weather === 'snow' && snowRef.current) {
      snowRef.current.position.set(carState.x, 0, carState.y);
      const arr = snowGeo.attributes.position.array as Float32Array;
      for (let i = 0; i < SNOW_COUNT; i++) {
        arr[i * 3 + 1] -= 60 * dt;
        arr[i * 3] += Math.sin(arr[i * 3 + 1] * 0.05) * 8 * dt;
        if (arr[i * 3 + 1] < 0) arr[i * 3 + 1] = 140;
      }
      snowGeo.attributes.position.needsUpdate = true;
    }
  });

  return (
    <group name="effects">
      {/* Skid marks */}
      <instancedMesh ref={skidMeshRef} args={[undefined, undefined, SKID_MAX]}>
        <planeGeometry args={[3.4, 6.2]} />
        <meshBasicMaterial color={0x111115} transparent opacity={0.42} depthWrite={false} />
      </instancedMesh>

      {/* Tire Smoke */}
      <points>
        <bufferGeometry ref={smokeGeoRef}>
          <bufferAttribute
            attach="attributes-position"
            args={[smokePos, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          map={smokeTexture}
          size={16}
          transparent
          opacity={0.55}
          depthWrite={false}
          blending={THREE.NormalBlending}
        />
      </points>

      {/* Rain Particles */}
      {weather === 'rain' && (
        <points ref={rainRef} geometry={rainGeo}>
          <pointsMaterial color={0x94b8e0} size={2.5} transparent opacity={0.65} depthWrite={false} />
        </points>
      )}

      {/* Snow Particles */}
      {weather === 'snow' && (
        <points ref={snowRef} geometry={snowGeo}>
          <pointsMaterial color={0xffffff} size={3.8} transparent opacity={0.8} depthWrite={false} />
        </points>
      )}
    </group>
  );
}
