'use client';

import React from 'react';
import { Physics as RapierPhysics, RigidBody, CuboidCollider } from '@react-three/rapier';

interface GamePhysicsProps {
  children: React.ReactNode;
}

export function GamePhysics({ children }: GamePhysicsProps) {
  return (
    <RapierPhysics gravity={[0, -9.81, 0]}>
      {/* Ground Physics Floor */}
      <RigidBody type="fixed" colliders={false} position={[0, -0.2, 0]}>
        <CuboidCollider args={[18000, 0.2, 18000]} friction={0.9} />
      </RigidBody>

      {children}
    </RapierPhysics>
  );
}
