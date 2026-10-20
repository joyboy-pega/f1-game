'use client';

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { WeatherType } from '@/lib/game/constants';
import { CarPhysicsState } from '@/lib/game/physics';

interface EnvironmentProps {
  weather: WeatherType;
  carState: CarPhysicsState;
  shadows: boolean;
  shadowMapSize: number;
}

export function Environment({ weather, carState, shadows, shadowMapSize }: EnvironmentProps) {
  const sunLightRef = useRef<THREE.DirectionalLight>(null);
  const sunTargetRef = useRef<THREE.Object3D>(null);

  // Weather lighting presets
  const weatherConfig = React.useMemo(() => {
    switch (weather) {
      case 'cloudy':
        return {
          bgColor: '#6b7c8f',
          fogColor: '#7d8e9f',
          fogDensity: 0.00055,
          hemiSky: 0xced7e0,
          hemiGround: 0x3d4856,
          hemiIntensity: 0.65,
          sunColor: 0xffffff,
          sunIntensity: 0.65,
        };
      case 'rain':
        return {
          bgColor: '#1c2430',
          fogColor: '#283240',
          fogDensity: 0.00095,
          hemiSky: 0x5a6d85,
          hemiGround: 0x222b38,
          hemiIntensity: 0.5,
          sunColor: 0xaec6e0,
          sunIntensity: 0.45,
        };
      case 'snow':
        return {
          bgColor: '#dde8f4',
          fogColor: '#cfdde8',
          fogDensity: 0.0008,
          hemiSky: 0xf0f6ff,
          hemiGround: 0xd8e4f0,
          hemiIntensity: 0.85,
          sunColor: 0xffffff,
          sunIntensity: 0.95,
        };
      case 'sunny':
      default:
        return {
          bgColor: '#5ca7e8',
          fogColor: '#8ec3f8',
          fogDensity: 0.00035,
          hemiSky: 0xfff8ed,
          hemiGround: 0x3d4856,
          hemiIntensity: 0.8,
          sunColor: 0xfff3de,
          sunIntensity: 1.35,
        };
    }
  }, [weather]);

  // Keep sunlight and shadow frustum centered near player car
  useFrame(() => {
    if (sunLightRef.current && sunTargetRef.current) {
      sunLightRef.current.position.set(carState.x + 180, 280, carState.y + 120);
      sunTargetRef.current.position.set(carState.x, 0, carState.y);
    }
  });

  return (
    <>
      <color attach="background" args={[weatherConfig.bgColor]} />
      <fogExp2 attach="fog" args={[weatherConfig.fogColor, weatherConfig.fogDensity]} />

      <hemisphereLight
        color={weatherConfig.hemiSky}
        groundColor={weatherConfig.hemiGround}
        intensity={weatherConfig.hemiIntensity}
      />

      <object3D ref={sunTargetRef} />
      <directionalLight
        ref={sunLightRef}
        color={weatherConfig.sunColor}
        intensity={weatherConfig.sunIntensity}
        castShadow={shadows}
        target={sunTargetRef.current || undefined}
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
        shadow-camera-near={5}
        shadow-camera-far={1200}
        shadow-camera-left={-260}
        shadow-camera-right={260}
        shadow-camera-top={260}
        shadow-camera-bottom={-260}
        shadow-bias={-0.0004}
      />
    </>
  );
}
