'use client';

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '@/lib/game/store';
import { world } from '@/lib/game/sim/world';

export function Camera() {
  const { camera } = useThree();
  const viewMode = useGameStore((s) => s.settings.cameraView);
  const smoothedCamPos = useRef(new THREE.Vector3(0, 30, -100));

  useFrame((state, dt) => {
    const carState = world.player.phys;
    const pCam = camera as THREE.PerspectiveCamera;
    if (!pCam.isPerspectiveCamera) return;

    // Dynamic FOV with speed
    const targetFov = 60 + Math.min(18, (carState.kmh / 330) * 16);
    pCam.fov += (targetFov - pCam.fov) * Math.min(1, 8.0 * dt);
    pCam.updateProjectionMatrix();

    const cosA = Math.cos(carState.a);
    const sinA = Math.sin(carState.a);

    if (viewMode === 'chase') {
      const chaseDist = 88;
      const chaseH = 26;
      const driftCamOffset = carState.isDrifting && carState.vf > 60 ? -carState.driftAngle * 0.38 : 0;
      const camAngle = carState.a + driftCamOffset;

      const targetCamX = carState.x - Math.cos(camAngle) * chaseDist;
      const targetCamZ = carState.y - Math.sin(camAngle) * chaseDist;
      const targetCamY = chaseH + Math.sin(state.clock.elapsedTime * 8) * 0.3;

      smoothedCamPos.current.x += (targetCamX - smoothedCamPos.current.x) * Math.min(1, 11 * dt);
      smoothedCamPos.current.z += (targetCamZ - smoothedCamPos.current.z) * Math.min(1, 11 * dt);
      smoothedCamPos.current.y += (targetCamY - smoothedCamPos.current.y) * Math.min(1, 14 * dt);

      pCam.position.copy(smoothedCamPos.current);
      pCam.lookAt(carState.x + cosA * 45, 6, carState.y + sinA * 45);

    } else if (viewMode === 'cockpit') {
      const cockX = carState.x + cosA * 2.5;
      const cockZ = carState.y + sinA * 2.5;
      const vib = Math.sin(state.clock.elapsedTime * 35) * (carState.kmh / 330) * 0.3;
      const cockY = 9.8 + vib;

      pCam.position.set(cockX, cockY, cockZ);
      pCam.lookAt(carState.x + cosA * 105, 8.2, carState.y + sinA * 105);

      if (carState.isDrifting && carState.vf > 60) {
        pCam.rotation.z += -carState.driftAngle * 0.15;
      }

    } else if (viewMode === 'tcam') {
      const tcamX = carState.x - cosA * 4.5;
      const tcamZ = carState.y - sinA * 4.5;
      const tcamY = 16.5;

      pCam.position.set(tcamX, tcamY, tcamZ);
      pCam.lookAt(carState.x + cosA * 95, 7.5, carState.y + sinA * 95);

      if (carState.isDrifting && carState.vf > 60) {
        pCam.rotation.z += -carState.driftAngle * 0.12;
      }

    } else if (viewMode === 'hood') {
      const hoodX = carState.x + cosA * 24;
      const hoodZ = carState.y + sinA * 24;
      const hoodY = 4.2;

      pCam.position.set(hoodX, hoodY, hoodZ);
      pCam.lookAt(carState.x + cosA * 120, 3.8, carState.y + sinA * 120);
    }
  });

  return null;
}
