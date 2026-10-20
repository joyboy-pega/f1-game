'use client';

import React, { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import {
  N,
  HW,
  TW,
  trackSplinePoints,
  tangents,
  normals,
  DRS_CONFIG,
} from '@/lib/game/constants';

interface TrackPropsProps {
  lightsActiveCount: number; // 0 to 5
  lightsOut: boolean;
}

export function TrackProps({ lightsActiveCount, lightsOut }: TrackPropsProps) {
  const gantryLightsRef = useRef<THREE.MeshStandardMaterial[]>([]);

  // 1. Finish Line Decal Texture
  const finishTexture = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 32;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 128, 32);
      ctx.fillStyle = '#111111';
      for (let y = 0; y < 32; y += 16) {
        for (let x = 0; x < 128; x += 32) {
          ctx.fillRect(x + (y ? 16 : 0), y, 16, 16);
        }
      }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }, []);

  // Update Gantry Lights dynamically
  useEffect(() => {
    gantryLightsRef.current.forEach((mat, i) => {
      if (!mat) return;
      const isOn = i < lightsActiveCount && !lightsOut;
      mat.color.setHex(isOn ? 0xff0000 : 0x220000);
      mat.emissive.setHex(isOn ? 0xff1100 : 0x000000);
      mat.emissiveIntensity = isOn ? 1.8 : 0;
    });
  }, [lightsActiveCount, lightsOut]);

  // Start Gantry Transform (at idx 0)
  const gantryTransform = useMemo(() => {
    const p0 = trackSplinePoints[0];
    const tx = tangents[0][0];
    const ty = tangents[0][1];
    const rotY = Math.PI / 2 - Math.atan2(ty, tx);
    return { pos: [p0[0], 0, p0[1]] as [number, number, number], rotY };
  }, []);

  // 2. Instanced Guard Posts
  const guardPostsMesh = useMemo(() => {
    const railOffset = HW + 82;
    const postGeo = new THREE.BoxGeometry(1.8, 16, 1.8);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
    const postCount = Math.floor(N / 4) * 2;
    const mesh = new THREE.InstancedMesh(postGeo, postMat, postCount);
    mesh.castShadow = true;

    const dummy = new THREE.Object3D();
    let pIdx = 0;
    for (let i = 0; i < N; i += 4) {
      const p = trackSplinePoints[i];
      const nx = normals[i][0];
      const ny = normals[i][1];

      dummy.position.set(p[0] - nx * railOffset, 8, p[1] - ny * railOffset);
      dummy.updateMatrix();
      mesh.setMatrixAt(pIdx++, dummy.matrix);

      dummy.position.set(p[0] + nx * railOffset, 8, p[1] + ny * railOffset);
      dummy.updateMatrix();
      mesh.setMatrixAt(pIdx++, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }, []);

  // 3. Instanced Perimeter Trees
  const treesMesh = useMemo(() => {
    const treeCount = 140;
    const trunkGeo = new THREE.CylinderGeometry(1.8, 2.4, 16, 6);
    const foliageGeo = new THREE.ConeGeometry(9.5, 24, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a2e18, roughness: 0.9 });
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x1e3f20, roughness: 0.8 });

    const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
    const foliageInst = new THREE.InstancedMesh(foliageGeo, foliageMat, treeCount);
    trunkInst.castShadow = true;
    foliageInst.castShadow = true;

    const dummy = new THREE.Object3D();
    for (let k = 0; k < treeCount; k++) {
      const idx = Math.floor((k / treeCount) * N);
      const side = k % 2 === 0 ? 1 : -1;
      const dist = HW + 120 + ((k * 37) % 180);
      const p = trackSplinePoints[idx];
      const nx = normals[idx][0];
      const ny = normals[idx][1];

      const tx = p[0] + side * nx * dist;
      const tz = p[1] + side * ny * dist;

      dummy.position.set(tx, 8, tz);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(k, dummy.matrix);

      dummy.position.set(tx, 24, tz);
      dummy.updateMatrix();
      foliageInst.setMatrixAt(k, dummy.matrix);
    }

    trunkInst.instanceMatrix.needsUpdate = true;
    foliageInst.instanceMatrix.needsUpdate = true;

    const group = new THREE.Group();
    group.add(trunkInst);
    group.add(foliageInst);
    return group;
  }, []);

  return (
    <group name="track-props">
      {/* Start / Finish Overhead Gantry */}
      <group position={gantryTransform.pos} rotation={[0, gantryTransform.rotY, 0]}>
        {/* Overhead beam */}
        <mesh position={[0, 32, 0]} castShadow>
          <boxGeometry args={[TW + 40, 4.5, 5]} />
          <meshStandardMaterial color={0x1e293b} roughness={0.5} metalness={0.6} />
        </mesh>

        {/* Support towers */}
        {[-HW - 18, HW + 18].map((x, idx) => (
          <mesh key={idx} position={[x, 17, 0]} castShadow>
            <boxGeometry args={[4.5, 34, 4.5]} />
            <meshStandardMaterial color={0x1e293b} roughness={0.5} metalness={0.6} />
          </mesh>
        ))}

        {/* 5 Start Light Pods */}
        {[-2, -1, 0, 1, 2].map((l, i) => (
          <group key={i} position={[l * 9.5, 27, 0]}>
            <mesh>
              <boxGeometry args={[6.5, 8.5, 3.2]} />
              <meshStandardMaterial color={0x0f172a} roughness={0.7} />
            </mesh>
            <mesh position={[0, -1, 1.6]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[1.6, 1.6, 0.8, 16]} />
              <meshStandardMaterial
                ref={(el) => {
                  if (el) gantryLightsRef.current[i] = el;
                }}
                color={0x220000}
                roughness={0.3}
                emissive={0x000000}
              />
            </mesh>
          </group>
        ))}

        {/* Checkered Finish Line Decal */}
        <mesh position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[TW, 14]} />
          <meshStandardMaterial map={finishTexture} roughness={0.8} />
        </mesh>
      </group>

      {/* Instanced Armco Guard Posts */}
      <primitive object={guardPostsMesh} />

      {/* Instanced Perimeter Trees */}
      <primitive object={treesMesh} />
    </group>
  );
}
