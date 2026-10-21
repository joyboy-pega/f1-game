'use client';

import React, { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import { F1Car } from '@/components/game/car/F1Car';
import type { Livery, TyreCompound, VehicleModelType } from '@/lib/game/constants';
import { createInitialCarState } from '@/lib/game/physics';
import { makeCar } from '@/lib/game/sim/world';
import { useGameStore } from '@/lib/game/store';

function Turntable({ livery, compound }: { livery: Livery; compound: TyreCompound }) {
  const group = useRef<THREE.Group>(null);
  const car = useMemo(() => {
    const c = makeCar(0, true, 0, 0, compound);
    c.phys = createInitialCarState(0, 0);
    c.phys.x = 0;
    c.phys.y = 0;
    c.phys.a = Math.PI / 2; // nose toward +z
    c.driver = { name: 'You', code: 'YOU', team: 'Player', livery };
    return c;
  }, [livery, compound]);

  useFrame((_, dt) => {
    if (group.current) group.current.rotation.y += dt * 0.35;
  });

  return (
    <group ref={group}>
      <F1Car car={car} />
    </group>
  );
}

function Rig() {
  const target = useMemo(() => new THREE.Vector3(62, 29, 83), []);
  useFrame(({ camera }) => {
    camera.position.lerp(target, 0.05);
    camera.lookAt(0, 6, 0);
  });
  return null;
}

/** Live 3D garage: the real race car on a turntable under studio lighting (no network assets). */
export default function Showroom({ model, livery, compound }: { model: VehicleModelType; livery: Livery; compound: TyreCompound }) {
  // The car component reads the model from the store, so mirror the lobby choice into it.
  const setSettings = useGameStore((s) => s.setSettings);
  React.useEffect(() => {
    setSettings({ carModel: model });
  }, [model, setSettings]);

  return (
    <Canvas dpr={[1, 1.5]} camera={{ position: [62, 29, 83], fov: 30, near: 1, far: 900 }} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}>
      <color attach="background" args={['#0b0d11']} />
      <fog attach="fog" args={['#0b0d11', 220, 520]} />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={2.2} color="#ffffff" position={[0, 40, 10]} rotation-x={Math.PI / 2} scale={[60, 40, 1]} />
        <Lightformer form="rect" intensity={2.6} color="#dfe8ff" position={[-40, 14, -10]} rotation-y={Math.PI / 2} scale={[50, 14, 1]} />
        <Lightformer form="rect" intensity={2.4} color="#ffd9b0" position={[40, 10, 20]} rotation-y={-Math.PI / 2} scale={[50, 14, 1]} />
        <Lightformer form="circle" intensity={4} color="#ffffff" position={[0, 22, -50]} scale={[20, 20, 1]} />
      </Environment>
      <directionalLight position={[30, 60, 40]} intensity={1.4} />
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.05, 0]}>
        <circleGeometry args={[70, 64]} />
        <meshStandardMaterial color="#171a20" roughness={0.85} metalness={0.1} />
      </mesh>
      <ContactShadows position={[0, 0.02, 0]} opacity={0.55} scale={90} blur={2.4} far={30} />
      <Turntable livery={livery} compound={compound} />
      <Rig />
    </Canvas>
  );
}
