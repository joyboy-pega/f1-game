'use client';

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CAR_SCALE } from '@/lib/game/constants';
import { AICarState } from '@/lib/game/physics';

interface AICarsProps {
  aiCars: AICarState[];
}

function SingleAICar({ ai }: { ai: AICarState }) {
  const rootRef = useRef<THREE.Group>(null);
  const wheelsSpinRef = useRef<THREE.Group[]>([]);

  useFrame((_, dt) => {
    if (!rootRef.current) return;
    rootRef.current.position.set(ai.x, 0.05, ai.y);
    rootRef.current.rotation.y = Math.PI / 2 - ai.a;

    const spin = (ai.speed / (0.34 * CAR_SCALE)) * dt;
    wheelsSpinRef.current.forEach((w) => {
      if (w) w.rotation.x += spin;
    });
  });

  return (
    <group ref={rootRef} scale={[CAR_SCALE, CAR_SCALE, CAR_SCALE]}>
      {/* Monocoque & Floor */}
      <mesh position={[0, 0.14, -0.15]} castShadow>
        <boxGeometry args={[1.35, 0.04, 2.2]} />
        <meshStandardMaterial color={0x221a12} roughness={0.92} />
      </mesh>
      <mesh position={[0, 0.36, 0.1]} castShadow>
        <boxGeometry args={[0.52, 0.42, 1.5]} />
        <meshStandardMaterial color={ai.cfg.color} roughness={0.75} />
      </mesh>
      <mesh position={[0, 0.28, 1.25]} rotation={[-THREE.MathUtils.degToRad(10), 0, 0]} castShadow>
        <boxGeometry args={[0.36, 0.26, 1.0]} />
        <meshStandardMaterial color={ai.cfg.color} roughness={0.75} />
      </mesh>

      {/* Front Wing */}
      <mesh position={[0, 0.14, 1.75]} castShadow>
        <boxGeometry args={[1.65, 0.04, 0.38]} />
        <meshStandardMaterial color={ai.cfg.color} roughness={0.75} />
      </mesh>
      <mesh position={[0.45, 0.21, 1.68]} rotation={[-THREE.MathUtils.degToRad(18), 0, 0]} castShadow>
        <boxGeometry args={[0.55, 0.03, 0.22]} />
        <meshStandardMaterial color={ai.cfg.accent} roughness={0.65} />
      </mesh>
      <mesh position={[-0.45, 0.21, 1.68]} rotation={[-THREE.MathUtils.degToRad(18), 0, 0]} castShadow>
        <boxGeometry args={[0.55, 0.03, 0.22]} />
        <meshStandardMaterial color={ai.cfg.accent} roughness={0.65} />
      </mesh>

      {/* Sidepods */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.48, 0, 0]}>
          <mesh position={[0, 0.35, -0.25]} castShadow>
            <boxGeometry args={[0.44, 0.38, 0.95]} />
            <meshStandardMaterial color={ai.cfg.color} roughness={0.75} />
          </mesh>
          <mesh position={[0, 0.55, 0.18]} castShadow>
            <boxGeometry args={[0.46, 0.04, 0.25]} />
            <meshStandardMaterial color={ai.cfg.accent} roughness={0.65} />
          </mesh>
        </group>
      ))}

      {/* Airbox & Engine Cover */}
      <mesh position={[0, 0.78, -0.55]} castShadow>
        <boxGeometry args={[0.32, 0.42, 0.45]} />
        <meshStandardMaterial color={ai.cfg.color} roughness={0.75} />
      </mesh>
      <mesh position={[0, 0.65, -0.92]} rotation={[THREE.MathUtils.degToRad(22), 0, 0]} castShadow>
        <boxGeometry args={[0.28, 0.38, 0.75]} />
        <meshStandardMaterial color={ai.cfg.color} roughness={0.75} />
      </mesh>

      {/* Rear Wing */}
      <mesh position={[0, 0.92, -1.38]} castShadow>
        <boxGeometry args={[1.35, 0.04, 0.32]} />
        <meshStandardMaterial color={ai.cfg.color} roughness={0.75} />
      </mesh>
      <mesh position={[0, 1.04, -1.48]} castShadow>
        <boxGeometry args={[1.35, 0.04, 0.22]} />
        <meshStandardMaterial color={ai.cfg.accent} roughness={0.65} />
      </mesh>
      <mesh position={[0.68, 0.86, -1.4]} castShadow>
        <boxGeometry args={[0.04, 0.52, 0.48]} />
        <meshStandardMaterial color={ai.cfg.color} roughness={0.75} />
      </mesh>
      <mesh position={[-0.68, 0.86, -1.4]} castShadow>
        <boxGeometry args={[0.04, 0.52, 0.48]} />
        <meshStandardMaterial color={ai.cfg.color} roughness={0.75} />
      </mesh>

      {/* 4 Wheels */}
      {[
        [0.82, 0.32, 0.9, 0.32, 0.3],
        [-0.82, 0.32, 0.9, 0.32, 0.3],
        [0.86, 0.36, -0.98, 0.36, 0.38],
        [-0.86, 0.36, -0.98, 0.36, 0.38],
      ].map(([wx, wy, wz, rad, width], i) => (
        <group key={i} position={[wx, wy, wz]}>
          <group
            ref={(el) => {
              if (el) wheelsSpinRef.current[i] = el;
            }}
          >
            <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[rad, rad, width, 10]} />
              <meshStandardMaterial color={0x18181b} roughness={0.9} />
            </mesh>
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[rad * 0.58, rad * 0.58, width + 0.04, 10]} />
              <meshStandardMaterial color={ai.cfg.rim} roughness={0.65} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  );
}

export function AICars({ aiCars }: AICarsProps) {
  return (
    <group name="ai-cars">
      {aiCars.map((ai, index) => (
        <SingleAICar key={index} ai={ai} />
      ))}
    </group>
  );
}
