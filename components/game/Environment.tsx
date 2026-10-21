'use client';

import React, { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment as DreiEnvironment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore } from '@/lib/game/store';
import { world } from '@/lib/game/sim/world';
import { QUALITY_PRESETS } from '@/lib/game/performance';
import { useLighting, type Lighting } from '@/lib/game/visuals/lighting';
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

  useEffect(() => {
    gl.toneMappingExposure = L.exposure;
  }, [gl, L.exposure]);

  // Keep the sun and its shadow frustum centred on the player.
  useFrame(() => {
    const p = world.player.phys;
    const light = sunLightRef.current;
    const target = sunTargetRef.current;
    if (!light || !target) return;
    light.target = target;
    target.position.set(p.x, 0, p.y);
    light.position.set(p.x + L.sunDir[0] * 500, L.sunDir[1] * 500, p.y + L.sunDir[2] * 500);
  });

  return (
    <>
      <color attach="background" args={[L.skyHorizon]} />
      <fogExp2 attach="fog" args={[L.fogColor, L.fogDensity]} />
      <SkyDome lighting={L} />
      <Ibl L={L} />

      <hemisphereLight color={L.hemiSky} groundColor={L.hemiGround} intensity={L.hemiIntensity} />

      <object3D ref={sunTargetRef} />
      <directionalLight
        ref={sunLightRef}
        color={L.sunColor}
        intensity={L.sunIntensity}
        castShadow={shadows}
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
        shadow-camera-near={5}
        shadow-camera-far={1400}
        shadow-camera-left={-300}
        shadow-camera-right={300}
        shadow-camera-top={300}
        shadow-camera-bottom={-300}
        shadow-bias={-0.0004}
        shadow-normalBias={0.6}
      />
    </>
  );
}
