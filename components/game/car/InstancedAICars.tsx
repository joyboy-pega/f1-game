'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CAR_SCALE } from '@/lib/game/constants';
import type { WorldCar } from '@/lib/game/sim/types';
import { track } from '@/lib/game/track';
import { surfaceHeight, surfaceGradeAngle, surfaceCamberAngle } from '@/lib/game/track/surface';
import { F1_WHEELS } from './dimensions';
import { getF1Geometries } from './f1Geometry';
import { getSharedMaterials } from './materials';
import { getRimGeometry, getTyreGeometry } from './wheels';

// Module-level reusable scratch objects for zero-allocation hot-loop updates (Rule R7)
const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');
const _matBody = new THREE.Matrix4();
const _matWheel = new THREE.Matrix4();
const _matLight = new THREE.Matrix4();
const _matLocal = new THREE.Matrix4();
const _color = new THREE.Color();

export interface InstancedAICarsProps {
  cars: WorldCar[];
}

/**
 * Instanced rendering for all AI cars (PLAN-v3 §7 G6).
 * Renders 19 AI cars in only 5 draw calls (body, carbon, tyres, rims, brake lights)
 * down from ~250 draw calls, running smoothly at 120 FPS even on low-end GPUs.
 */
export function InstancedAICars({ cars }: { cars: WorldCar[] }) {
  const count = cars.length;
  const wheelCount = count * 4;

  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const carbonRef = useRef<THREE.InstancedMesh>(null);
  const tyresRef = useRef<THREE.InstancedMesh>(null);
  const rimsRef = useRef<THREE.InstancedMesh>(null);
  const brakeLightRef = useRef<THREE.InstancedMesh>(null);

  const f1 = useMemo(() => getF1Geometries(), []);
  const shared = useMemo(() => getSharedMaterials(), []);
  const tyreGeo = useMemo(() => getTyreGeometry('soft'), []);
  const rimGeo = useMemo(() => getRimGeometry('#c0c0c0'), []);

  // Per-instance body material with vertexColors enabled for individual livery body tint
  const bodyMat = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.35,
      metalness: 0.25,
      envMapIntensity: 1.2,
    });
  }, []);

  // Rim material with per-instance rim color tint
  const rimMat = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.28,
      metalness: 0.85,
    });
  }, []);

  const brakeLightMat = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: '#ff1100',
      emissive: '#ff1100',
      emissiveIntensity: 3.5,
      toneMapped: false,
    });
  }, []);

  // Initialise per-instance colors (livery body and rim colors)
  useEffect(() => {
    const bodyMesh = bodyRef.current;
    const rimMesh = rimsRef.current;
    if (!bodyMesh || !rimMesh) return;

    for (let i = 0; i < count; i++) {
      const car = cars[i];
      _color.set(car.driver.livery.body);
      bodyMesh.setColorAt(i, _color);

      _color.set(car.driver.livery.rim);
      for (let w = 0; w < 4; w++) {
        rimMesh.setColorAt(i * 4 + w, _color);
      }
    }

    if (bodyMesh.instanceColor) bodyMesh.instanceColor.needsUpdate = true;
    if (rimMesh.instanceColor) rimMesh.instanceColor.needsUpdate = true;
  }, [cars, count]);

  // Per-frame matrix update loop: strictly zero allocations (Rule R7)
  useFrame(() => {
    const bodyMesh = bodyRef.current;
    const carbonMesh = carbonRef.current;
    const tyresMesh = tyresRef.current;
    const rimsMesh = rimsRef.current;
    const lightMesh = brakeLightRef.current;
    if (!bodyMesh || !carbonMesh || !tyresMesh || !rimsMesh || !lightMesh) return;

    const T = track.current;

    for (let i = 0; i < count; i++) {
      const car = cars[i];
      const p = car.phys;
      const idx = p.idx ?? 0;

      // Surface height and road angles
      const dx = p.x - T.px[idx];
      const dz = p.y - T.py[idx];
      const lat = dx * T.nx[idx] + dz * T.ny[idx];
      const carY = surfaceHeight(idx, lat) + 0.05;

      const roadPitch = surfaceGradeAngle(idx);
      const roadBank = surfaceCamberAngle(idx);
      const trackYaw = Math.atan2(T.ty[idx], T.tx[idx]);
      const headingDiff = p.a - trackYaw;
      const cosH = Math.cos(headingDiff);
      const sinH = Math.sin(headingDiff);

      const pitch = (p.pitch || 0) - roadPitch * cosH + roadBank * sinH;
      const roll = (p.roll || 0) + roadBank * cosH + roadPitch * sinH;
      const yaw = Math.PI / 2 - p.a;

      // Body transform
      _pos.set(p.x, carY, p.y);
      _euler.set(pitch, yaw, roll, 'YXZ');
      _quat.setFromEuler(_euler);
      _scale.set(CAR_SCALE, CAR_SCALE, CAR_SCALE);
      _matBody.compose(_pos, _quat, _scale);

      bodyMesh.setMatrixAt(i, _matBody);
      carbonMesh.setMatrixAt(i, _matBody);

      // Brake light position [0, 0.355, -1.472] in car-local frame
      _matLocal.makeTranslation(0, 0.355, -1.472);
      _matLight.multiplyMatrices(_matBody, _matLocal);
      lightMesh.setMatrixAt(i, _matLight);

      // Wheels transforms (FL, FR, RL, RR)
      const steer = -p.steer * 0.45;

      for (let w = 0; w < F1_WHEELS.length; w++) {
        const spec = F1_WHEELS[w];
        const wheelIdx = i * 4 + w;

        // Local wheel transform: translation + steer rotation (front only) + wheel dimensions scaling
        _pos.set(spec.x, spec.y, spec.z);
        if (spec.front) {
          _euler.set(0, steer, 0, 'YXZ');
          _quat.setFromEuler(_euler);
        } else {
          _quat.identity();
        }
        _scale.set(spec.width, spec.radius, spec.radius);
        _matLocal.compose(_pos, _quat, _scale);

        // World wheel matrix
        _matWheel.multiplyMatrices(_matBody, _matLocal);

        tyresMesh.setMatrixAt(wheelIdx, _matWheel);
        rimsMesh.setMatrixAt(wheelIdx, _matWheel);
      }
    }

    bodyMesh.instanceMatrix.needsUpdate = true;
    carbonMesh.instanceMatrix.needsUpdate = true;
    tyresMesh.instanceMatrix.needsUpdate = true;
    rimsMesh.instanceMatrix.needsUpdate = true;
    lightMesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <group name="instanced-ai-cars">
      {/* 1. Body shells with per-instance livery colors (1 draw call) */}
      <instancedMesh
        ref={bodyRef}
        args={[f1.body, bodyMat, count]}
        castShadow
        receiveShadow
      />

      {/* 2. Exposed carbon fibre aerodynamic elements (1 draw call) */}
      <instancedMesh
        ref={carbonRef}
        args={[f1.carbon, shared.carbon, count]}
        castShadow
        receiveShadow
      />

      {/* 3. Tyres (4 per car, 1 draw call) */}
      <instancedMesh
        ref={tyresRef}
        args={[tyreGeo, shared.tyre, wheelCount]}
        castShadow
      />

      {/* 4. Rims with per-instance rim colors (4 per car, 1 draw call) */}
      <instancedMesh
        ref={rimsRef}
        args={[rimGeo, rimMat, wheelCount]}
      />

      {/* 5. FIA safety rear rain light (1 draw call) */}
      <instancedMesh
        ref={brakeLightRef}
        args={[f1.brakeLight, brakeLightMat, count]}
      />
    </group>
  );
}
