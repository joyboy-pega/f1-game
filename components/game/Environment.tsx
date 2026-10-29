'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment as DreiEnvironment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore } from '@/lib/game/store';
import { world } from '@/lib/game/sim/world';
import { track } from '@/lib/game/track';
import { QUALITY_PRESETS } from '@/lib/game/performance';
import { useLighting, rotateSunByAzimuth, type Lighting } from '@/lib/game/visuals/lighting';
import { SkyDome } from './world/SkyDome';

/** Procedural image-based lighting: the sky dome plus a few softboxes. No network. */
function Ibl({ L }: { L: Lighting }) {
  const sun = L.sunDir;
  const night = L.nightFactor;
  const k = 1 - L.cloudCover * 0.6;
  return (
    <DreiEnvironment
      key={`${L.tod}-${L.weather}`}
      resolution={256}
      frames={1}
      environmentIntensity={L.envIntensity}
    >
      <SkyDome lighting={L} follow={false} />
      {/* big overhead softbox */}
      <Lightformer form="rect" intensity={(1.2 - night * 0.8) * (0.6 + 0.4 * k)} color={L.skyHorizon} position={[0, 40, 0]} rotation-x={Math.PI / 2} scale={[80, 80, 1]} />
      {/* key light as a hot spot in the sun direction */}
      <Lightformer form="circle" intensity={(L.sunVisible ? 14 : 3) * k * (L.weather === 'rain' ? 0.3 : 1)} color={L.sunColor} position={[sun[0] * 40, sun[1] * 40, sun[2] * 40]} scale={[18, 18, 1]} target={[0, 0, 0]} />
      {/* side strips for crisp bodywork highlights */}
      <Lightformer form="rect" intensity={1.8 - night} color={L.skyHorizon} position={[-45, 8, 0]} rotation-y={Math.PI / 2} scale={[60, 10, 1]} />
      <Lightformer form="rect" intensity={1.8 - night} color={L.skyHorizon} position={[45, 8, 0]} rotation-y={-Math.PI / 2} scale={[60, 10, 1]} />
      {/* warm bounce from the ground */}
      <Lightformer form="rect" intensity={0.6} color={L.hemiGround} position={[0, -30, 0]} rotation-x={-Math.PI / 2} scale={[100, 100, 1]} />
    </DreiEnvironment>
  );
}

export function Environment() {
  const L = useLighting();
  const { shadows, shadowMapSize } = QUALITY_PRESETS[useGameStore((s) => s.quality)];
  const sunLightRef = useRef<THREE.DirectionalLight>(null);
  const sunTargetRef = useRef<THREE.Object3D>(null);
  const gl = useThree((s) => s.gl);

  // Rotate sun direction by circuit azimuth (PLAN-v3 §7 G4)
  const sunAzimuth = track.current.meta.sunAzimuthDeg ?? 0;
  const sunDir = useMemo(() => rotateSunByAzimuth(L.sunDir, sunAzimuth), [L.sunDir, sunAzimuth]);

  useEffect(() => {
    gl.toneMappingExposure = L.exposure;
  }, [gl, L.exposure]);

  // Light-space basis for texel snapping: the sun shines in at an angle, so snapping world X/Z (as
  // before) does not line the shadow map up with its own texels and shadow edges on the car still
  // crawled every frame — read as constant flicker from the T-cam/cockpit, where the car fills the view.
  const lightBasis = useMemo(() => {
    const fwd = new THREE.Vector3(-sunDir[0], -sunDir[1], -sunDir[2]).normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
    return { fwd, right, up, centre: new THREE.Vector3() };
  }, [sunDir]);

  useFrame(() => {
    const p = world.player.phys;
    const light = sunLightRef.current;
    const target = sunTargetRef.current;
    if (!light || !target) return;

    // Tight 120 m bounds around the player ([-600, 600] world units)
    const bounds = 600;
    const shadowRes = shadowMapSize || 2048;
    const texelSize = (bounds * 2) / shadowRes;

    // Follow the car's elevation too: on hilly circuits (Spa, Red Bull Ring) the car sits hundreds
    // of units above y = 0, outside the old fixed-height shadow box, so its shadows popped in and out.
    const T = track.current;
    const i = p.idx ?? 0;
    const groundY = T.pz ? T.pz[((i % T.N) + T.N) % T.N] : 0;

    const { fwd, right, up, centre } = lightBasis;
    centre.set(p.x, groundY, p.y);
    const a = Math.floor(centre.dot(right) / texelSize) * texelSize;
    const b = Math.floor(centre.dot(up) / texelSize) * texelSize;
    const d = centre.dot(fwd);
    centre.copy(right).multiplyScalar(a).addScaledVector(up, b).addScaledVector(fwd, d);

    light.target = target;
    target.position.copy(centre);
    light.position.set(centre.x + sunDir[0] * 500, centre.y + sunDir[1] * 500, centre.z + sunDir[2] * 500);
  });

  return (
    <>
      <color attach="background" args={[L.skyHorizon]} />
      <fogExp2 attach="fog" args={[L.fogColor, L.fogDensity]} />
      <SkyDome lighting={{ ...L, sunDir }} />
      <Ibl L={{ ...L, sunDir }} />

      <hemisphereLight color={L.hemiSky} groundColor={L.hemiGround} intensity={L.hemiIntensity} />

      <object3D ref={sunTargetRef} />
      <directionalLight
        ref={sunLightRef}
        color={L.sunColor}
        intensity={L.sunIntensity}
        castShadow={shadows}
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
        shadow-camera-near={10}
        shadow-camera-far={1100}
        shadow-camera-left={-600}
        shadow-camera-right={600}
        shadow-camera-top={600}
        shadow-camera-bottom={-600}
        shadow-bias={-0.0003}
        shadow-normalBias={0.5}
      />
    </>
  );
}
