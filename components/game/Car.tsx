'use client';

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CAR_SCALE, VehicleModelType } from '@/lib/game/constants';
import { CarPhysicsState } from '@/lib/game/physics';

interface CarProps {
  carState: CarPhysicsState;
  modelType: VehicleModelType;
  bodyColor: string;
  accentColor: string;
  rimColor: string;
}

export function Car({ carState, modelType, bodyColor, accentColor, rimColor }: CarProps) {
  const rootRef = useRef<THREE.Group>(null);
  const bodyGroupRef = useRef<THREE.Group>(null);
  const steeringWheelRef = useRef<THREE.Mesh>(null);
  const drsFlapRef = useRef<THREE.Mesh>(null);
  const brakeLightMatRef = useRef<THREE.MeshStandardMaterial>(null);

  const frontLeftWheelPivotRef = useRef<THREE.Group>(null);
  const frontRightWheelPivotRef = useRef<THREE.Group>(null);
  const frontLeftWheelSpinRef = useRef<THREE.Group>(null);
  const frontRightWheelSpinRef = useRef<THREE.Group>(null);
  const rearLeftWheelSpinRef = useRef<THREE.Group>(null);
  const rearRightWheelSpinRef = useRef<THREE.Group>(null);

  // Procedural corrugated texture for body
  const bodyTexture = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d');
    if (ctx) {
      ctx.fillStyle = bodyColor;
      ctx.fillRect(0, 0, 256, 256);
      ctx.save();
      ctx.translate(128, 128);
      ctx.rotate((-18 * Math.PI) / 180);
      ctx.translate(-128, -128);
      ctx.strokeStyle = 'rgba(35, 16, 4, 0.22)';
      for (let y = -60; y < 320; y += 7) {
        ctx.lineWidth = y % 14 === 0 ? 2.2 : 1.1;
        ctx.beginPath();
        ctx.moveTo(-60, y);
        ctx.lineTo(320, y);
        ctx.stroke();
      }
      ctx.restore();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }, [bodyColor]);

  // Frame update
  useFrame((_, dt) => {
    if (!rootRef.current) return;

    // World position & heading
    rootRef.current.position.set(carState.x, 0.05, carState.y);
    rootRef.current.rotation.y = Math.PI / 2 - carState.a;

    // Body pitch and roll
    if (bodyGroupRef.current) {
      bodyGroupRef.current.rotation.x = carState.pitch || 0;
      bodyGroupRef.current.rotation.z = carState.roll || 0;
    }

    // Front steering angle
    const steerAngle = -carState.steer * 0.45;
    if (frontLeftWheelPivotRef.current) frontLeftWheelPivotRef.current.rotation.y = steerAngle;
    if (frontRightWheelPivotRef.current) frontRightWheelPivotRef.current.rotation.y = steerAngle;

    // Cockpit steering wheel
    if (steeringWheelRef.current) {
      steeringWheelRef.current.rotation.z = -carState.steer * 1.8;
    }

    // Axle-specific wheel spin
    const baseWheelSpinRate = carState.vf / (0.34 * CAR_SCALE);
    const frontSpinDelta = baseWheelSpinRate * (1 - (carState.wheelSlipFront || 0) * 0.7) * dt;
    const rearSpinDelta = baseWheelSpinRate * (1 - (carState.wheelSlipRear || 0) * 0.7) * dt;

    if (frontLeftWheelSpinRef.current) frontLeftWheelSpinRef.current.rotation.x += frontSpinDelta;
    if (frontRightWheelSpinRef.current) frontRightWheelSpinRef.current.rotation.x += frontSpinDelta;
    if (rearLeftWheelSpinRef.current) rearLeftWheelSpinRef.current.rotation.x += rearSpinDelta;
    if (rearRightWheelSpinRef.current) rearRightWheelSpinRef.current.rotation.x += rearSpinDelta;

    // DRS flap animation
    if (drsFlapRef.current) {
      const targetFlap = carState.drsOpen ? -3 * (Math.PI / 180) : 25 * (Math.PI / 180);
      carState.drsFlapAngle += (targetFlap - carState.drsFlapAngle) * Math.min(1, 16.0 * dt);
      drsFlapRef.current.rotation.x = carState.drsFlapAngle;
    }

    // Brake safety LED light
    if (brakeLightMatRef.current) {
      const bIntensity = carState.brakeInput || 0;
      if (bIntensity > 0.05) {
        brakeLightMatRef.current.emissive.setHex(0xff1e00);
        brakeLightMatRef.current.emissiveIntensity = 0.5 + bIntensity * 2.5;
      } else {
        brakeLightMatRef.current.emissive.setHex(0x000000);
        brakeLightMatRef.current.emissiveIntensity = 0;
      }
    }
  });

  return (
    <group ref={rootRef} scale={[CAR_SCALE, CAR_SCALE, CAR_SCALE]}>
      <group ref={bodyGroupRef}>
        {/* Monocoque & Main Floor */}
        <mesh position={[0, 0.14, -0.15]} castShadow receiveShadow>
          <boxGeometry args={[1.35, 0.04, 2.2]} />
          <meshStandardMaterial color={0x221a12} roughness={0.92} />
        </mesh>
        <mesh position={[0, 0.36, 0.1]} castShadow receiveShadow>
          <boxGeometry args={[0.52, 0.42, 1.5]} />
          <meshStandardMaterial map={bodyTexture} roughness={0.78} />
        </mesh>
        <mesh position={[0, 0.28, 1.25]} rotation={[-THREE.MathUtils.degToRad(10), 0, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.36, 0.26, 1.0]} />
          <meshStandardMaterial map={bodyTexture} roughness={0.78} />
        </mesh>

        {/* Front Wing */}
        <mesh position={[0, 0.14, 1.75]} castShadow receiveShadow>
          <boxGeometry args={[1.65, 0.04, 0.38]} />
          <meshStandardMaterial map={bodyTexture} roughness={0.78} />
        </mesh>
        <mesh position={[0.45, 0.21, 1.68]} rotation={[-THREE.MathUtils.degToRad(18), 0, 0]} castShadow>
          <boxGeometry args={[0.55, 0.03, 0.22]} />
          <meshStandardMaterial color={accentColor} roughness={0.65} />
        </mesh>
        <mesh position={[-0.45, 0.21, 1.68]} rotation={[-THREE.MathUtils.degToRad(18), 0, 0]} castShadow>
          <boxGeometry args={[0.55, 0.03, 0.22]} />
          <meshStandardMaterial color={accentColor} roughness={0.65} />
        </mesh>
        <mesh position={[0.82, 0.22, 1.72]} castShadow>
          <boxGeometry args={[0.04, 0.24, 0.46]} />
          <meshStandardMaterial map={bodyTexture} roughness={0.78} />
        </mesh>
        <mesh position={[-0.82, 0.22, 1.72]} castShadow>
          <boxGeometry args={[0.04, 0.24, 0.46]} />
          <meshStandardMaterial map={bodyTexture} roughness={0.78} />
        </mesh>

        {/* Cockpit & Halo */}
        <mesh position={[0.23, 0.62, -0.05]} castShadow>
          <boxGeometry args={[0.06, 0.16, 0.65]} />
          <meshStandardMaterial map={bodyTexture} roughness={0.78} />
        </mesh>
        <mesh position={[-0.23, 0.62, -0.05]} castShadow>
          <boxGeometry args={[0.06, 0.16, 0.65]} />
          <meshStandardMaterial map={bodyTexture} roughness={0.78} />
        </mesh>
        <mesh position={[0, 0.63, 0.25]} rotation={[-THREE.MathUtils.degToRad(25), 0, 0]} castShadow>
          <boxGeometry args={[0.42, 0.12, 0.12]} />
          <meshStandardMaterial map={bodyTexture} roughness={0.78} />
        </mesh>
        <mesh position={[0, 0.52, -0.28]} rotation={[-THREE.MathUtils.degToRad(15), 0, 0]} castShadow>
          <boxGeometry args={[0.36, 0.45, 0.12]} />
          <meshStandardMaterial color={0x221a12} roughness={0.92} />
        </mesh>

        {/* Halo Safety Bar */}
        <mesh position={[0, 0.82, 0.05]} rotation={[-THREE.MathUtils.degToRad(18), 0, 0]} castShadow>
          <boxGeometry args={[0.05, 0.05, 0.55]} />
          <meshStandardMaterial color={0x221a12} roughness={0.92} />
        </mesh>
        <mesh position={[0, 0.74, 0.22]} castShadow>
          <boxGeometry args={[0.36, 0.05, 0.05]} />
          <meshStandardMaterial color={0x221a12} roughness={0.92} />
        </mesh>

        {/* Cockpit Steering Wheel */}
        <mesh ref={steeringWheelRef} position={[0, 0.62, 0.08]} rotation={[THREE.MathUtils.degToRad(55), 0, 0]}>
          <torusGeometry args={[0.13, 0.025, 6, 10]} />
          <meshStandardMaterial color={0x221a12} roughness={0.92} />
        </mesh>

        {/* Sidepods & Airbox */}
        {[-1, 1].map((side) => (
          <group key={side} position={[side * 0.48, 0, 0]}>
            <mesh position={[0, 0.35, -0.25]} castShadow receiveShadow>
              <boxGeometry args={[0.44, 0.38, 0.95]} />
              <meshStandardMaterial map={bodyTexture} roughness={0.78} />
            </mesh>
            <mesh position={[0, 0.35, 0.23]} castShadow receiveShadow>
              <boxGeometry args={[0.36, 0.3, 0.05]} />
              <meshStandardMaterial color={0x221a12} roughness={0.92} />
            </mesh>
            <mesh position={[0, 0.55, 0.18]} castShadow>
              <boxGeometry args={[0.46, 0.04, 0.25]} />
              <meshStandardMaterial color={accentColor} roughness={0.65} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, 0.78, -0.55]} castShadow>
          <boxGeometry args={[0.32, 0.42, 0.45]} />
          <meshStandardMaterial map={bodyTexture} roughness={0.78} />
        </mesh>
        <mesh position={[0, 0.65, -0.92]} rotation={[THREE.MathUtils.degToRad(22), 0, 0]} castShadow>
          <boxGeometry args={[0.28, 0.38, 0.75]} />
          <meshStandardMaterial map={bodyTexture} roughness={0.78} />
        </mesh>

        {/* Rear Wing & Animated DRS Flap */}
        <mesh position={[0.12, 0.72, -1.32]} rotation={[-THREE.MathUtils.degToRad(12), 0, 0]} castShadow>
          <boxGeometry args={[0.05, 0.48, 0.16]} />
          <meshStandardMaterial color={0x221a12} roughness={0.92} />
        </mesh>
        <mesh position={[-0.12, 0.72, -1.32]} rotation={[-THREE.MathUtils.degToRad(12), 0, 0]} castShadow>
          <boxGeometry args={[0.05, 0.48, 0.16]} />
          <meshStandardMaterial color={0x221a12} roughness={0.92} />
        </mesh>
        <mesh position={[0, 0.92, -1.38]} castShadow>
          <boxGeometry args={[1.35, 0.04, 0.32]} />
          <meshStandardMaterial map={bodyTexture} roughness={0.78} />
        </mesh>

        {/* Dynamic DRS Flap */}
        <mesh ref={drsFlapRef} position={[0, 1.04, -1.48]} castShadow>
          <boxGeometry args={[1.35, 0.04, 0.22]} />
          <meshStandardMaterial color={accentColor} roughness={0.65} />
        </mesh>

        {/* Endplates */}
        <mesh position={[0.68, 0.86, -1.4]} castShadow>
          <boxGeometry args={[0.04, 0.52, 0.48]} />
          <meshStandardMaterial map={bodyTexture} roughness={0.78} />
        </mesh>
        <mesh position={[-0.68, 0.86, -1.4]} castShadow>
          <boxGeometry args={[0.04, 0.52, 0.48]} />
          <meshStandardMaterial map={bodyTexture} roughness={0.78} />
        </mesh>

        {/* Rear Safety Rain / Brake Light LED */}
        <mesh position={[0, 0.28, -1.46]}>
          <boxGeometry args={[0.18, 0.12, 0.08]} />
          <meshStandardMaterial ref={brakeLightMatRef} color={0x330000} roughness={0.2} emissive={0x000000} />
        </mesh>
      </group>

      {/* 4 Low-Poly F1 Wheels */}
      {/* Front Left Wheel */}
      <group ref={frontLeftWheelPivotRef} position={[0.82, 0.32, 0.9]}>
        <group ref={frontLeftWheelSpinRef}>
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.32, 0.32, 0.3, 12]} />
            <meshStandardMaterial color={0x18181b} roughness={0.9} />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.18, 0.18, 0.34, 12]} />
            <meshStandardMaterial color={rimColor} roughness={0.65} />
          </mesh>
        </group>
      </group>

      {/* Front Right Wheel */}
      <group ref={frontRightWheelPivotRef} position={[-0.82, 0.32, 0.9]}>
        <group ref={frontRightWheelSpinRef}>
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.32, 0.32, 0.3, 12]} />
            <meshStandardMaterial color={0x18181b} roughness={0.9} />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.18, 0.18, 0.34, 12]} />
            <meshStandardMaterial color={rimColor} roughness={0.65} />
          </mesh>
        </group>
      </group>

      {/* Rear Left Wheel */}
      <group position={[0.86, 0.36, -0.98]}>
        <group ref={rearLeftWheelSpinRef}>
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.36, 0.36, 0.38, 12]} />
            <meshStandardMaterial color={0x18181b} roughness={0.9} />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.2, 0.2, 0.42, 12]} />
            <meshStandardMaterial color={rimColor} roughness={0.65} />
          </mesh>
        </group>
      </group>

      {/* Rear Right Wheel */}
      <group position={[-0.86, 0.36, -0.98]}>
        <group ref={rearRightWheelSpinRef}>
          <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.36, 0.36, 0.38, 12]} />
            <meshStandardMaterial color={0x18181b} roughness={0.9} />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.2, 0.2, 0.42, 12]} />
            <meshStandardMaterial color={rimColor} roughness={0.65} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
