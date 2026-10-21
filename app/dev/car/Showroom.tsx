'use client';

import React, { useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { F1Car } from '@/components/game/car/F1Car';
import { CAR_SCALE, type Livery, type TyreCompound } from '@/lib/game/constants';
import { makeCar } from '@/lib/game/sim/world';
import type { WorldCar } from '@/lib/game/sim/types';
import { createInitialCarState } from '@/lib/game/physics';
import { useGameStore } from '@/lib/game/store';

const SPACING = 30;

interface Spec {
  livery: Livery;
  compound: TyreCompound;
  street?: boolean;
  drs?: boolean;
  brake?: number;
}

const SPECS: Spec[] = [
  { livery: { body: '#1E41B0', accent: '#FFD700', rim: '#C0C0C0', number: 1 }, compound: 'soft', drs: true },
  { livery: { body: '#DC0000', accent: '#FFFFFF', rim: '#DC0000', number: 16 }, compound: 'medium', brake: 1 },
  { livery: { body: '#F5F5F5', accent: '#E10600', rim: '#111111', number: 22 }, compound: 'hard' },
  { livery: { body: '#FF8700', accent: '#0072BB', rim: '#1E1E1E', number: 4 }, compound: 'inter' },
  { livery: { body: '#6B21A8', accent: '#F59E0B', rim: '#F59E0B', number: 10 }, compound: 'wet', street: true },
];

function fakeCar(i: number, spec: Spec, anim: boolean): WorldCar {
  const phys = createInitialCarState(0, 0);
  phys.x = i * SPACING;
  phys.y = 0;
  phys.a = Math.PI / 2; // rotation.y = 0 -> nose toward +z
  if (anim) {
    phys.vf = spec.brake ? 500 : 120;
    phys.brakeInput = spec.brake ?? 0;
    phys.drsOpen = !!spec.drs;
  }
  const car = makeCar(i, !!spec.street, 0, 0, spec.compound);
  car.phys = phys;
  car.driver = { name: 'Test', code: 'TST', team: 'Test', livery: spec.livery };
  car.position = i + 1;
  return car;
}

const CAMS: Record<string, [number, number, number]> = {
  // offsets from the focus car, in car-lengths-ish world units
  front: [28, 14, 62],
  rear: [-30, 18, -62],
  side: [70, 12, 4],
  top: [0.1, 90, 0.1],
  iso: [52, 30, -52],
  close: [24, 11, -30],
  chase: [0, 22, -62],
  wheel: [32, 5, 14],
  all: [0, 60, -150],
};

function Rig({ focus, cam }: { focus: number; cam: string }) {
  const { camera } = useThree();
  const target = useMemo(() => new THREE.Vector3(focus * SPACING, cam === 'all' ? 0 : 7, 0), [focus, cam]);
  useEffect(() => {
    const o = CAMS[cam] ?? CAMS.iso;
    camera.position.set(target.x + o[0], target.y + o[1] - 7, target.z + o[2]);
    camera.lookAt(target);
  }, [camera, cam, target]);
  return <OrbitControls target={target} enableDamping makeDefault />;
}

function Turntable({ enabled }: { enabled: boolean }) {
  useFrame(({ camera, clock }) => {
    if (!enabled) return;
    const t = clock.elapsedTime * 0.3;
    camera.position.x = 80 * Math.sin(t);
    camera.position.z = 80 * Math.cos(t);
    camera.lookAt(0, 7, 0);
  });
  return null;
}

export default function Showroom() {
  const params = useMemo(() => (typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.search)), []);
  const cam = params.get('cam') ?? 'all';
  const focus = Number(params.get('focus') ?? 1.5);
  const spin = params.get('spin') === '1';
  const anim = params.get('anim') !== '0';
  const weather = params.get('weather');
  const cars = useMemo(() => SPECS.map((s, i) => fakeCar(i, s, anim)), [anim]);

  useEffect(() => {
    useGameStore.getState().setSettings({ carModel: 'street', ...(weather ? { weather: weather as 'rain' } : {}) });
  }, [weather]);

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 32, near: 1, far: 3000, position: [0, 60, -150] }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.95 }}
    >
      <color attach="background" args={['#10131a']} />
      <Environment resolution={256} background={false}>
        <Lightformer form="rect" intensity={1.4} position={[0, 12, 0]} rotation-x={Math.PI / 2} scale={[40, 40, 1]} />
        <Lightformer form="rect" intensity={1.1} position={[-12, 5, -8]} rotation-y={Math.PI / 2} scale={[30, 8, 1]} />
        <Lightformer form="rect" intensity={1.1} position={[12, 4, 8]} rotation-y={-Math.PI / 2} scale={[30, 8, 1]} />
        <Lightformer form="rect" intensity={0.8} position={[0, 3, 14]} rotation-y={Math.PI} scale={[30, 6, 1]} />
        <Lightformer form="ring" intensity={2} position={[0, 8, -12]} scale={6} />
      </Environment>
      <directionalLight
        castShadow
        position={[60, 120, -40]}
        intensity={1.5}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-120}
        shadow-camera-right={120}
        shadow-camera-top={120}
        shadow-camera-bottom={-120}
        shadow-camera-far={400}
      />
      <hemisphereLight args={['#bcd0ff', '#2a2f3a', 0.2]} />
      <mesh rotation-x={-Math.PI / 2} position={[2 * SPACING, -0.01, 0]} receiveShadow>
        <planeGeometry args={[2000, 1200]} />
        <meshStandardMaterial color="#14171d" roughness={0.9} />
      </mesh>
      <ContactShadows position={[2 * SPACING, 0.02, 0]} scale={400} blur={2.4} far={14} opacity={0.5} />
      {cars.map((c) => (
        <F1Car key={c.id} car={c} />
      ))}
      <Rig focus={focus} cam={cam} />
      <Turntable enabled={spin} />
      <GridLabel />
    </Canvas>
  );
}

function GridLabel() {
  // Scale reference: 1 car length (unscaled 3.45) in world units.
  return <group position={[0, 0, 0]} scale={CAR_SCALE} visible={false} />;
}
