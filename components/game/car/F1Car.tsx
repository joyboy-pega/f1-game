'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CAR_SCALE, type TyreCompound } from '@/lib/game/constants';
import { useGameStore } from '@/lib/game/store';
import type { WorldCar } from '@/lib/game/sim/types';
import { world } from '@/lib/game/sim/world';
import { renderPose, type Pose } from '@/lib/game/sim/interp';
import { F1_WHEELS, STREET_WHEELS, type WheelSpec } from './dimensions';
import { getF1Geometries } from './f1Geometry';
import { getStreetGeometries } from './streetGeometry';
import { getLiveryMaterial } from './livery';
import { createCarMaterials, getSharedMaterials } from './materials';
import { getRimGeometry, getTyreGeometry } from './wheels';

export interface F1CarProps {
  car: WorldCar;
  /** Blend between the last two fixed steps (live sim cars). Off for ghost / showroom cars that write `phys` directly. */
  interpolate?: boolean;
}

/**
 * Renders one world car. Reads `car.phys` every frame; never re-renders from sim state.
 * Contract: root group placed at (phys.x, 0.05, phys.y), rotation.y = PI/2 - phys.a,
 * uniform CAR_SCALE. The player's car becomes a road supercar when settings.carModel === 'street'.
 */
export function F1Car({ car, interpolate = false }: F1CarProps) {
  const carModel = useGameStore((s) => s.settings.carModel);
  const street = car.isPlayer && carModel === 'street';
  return <CarRig key={street ? 'street' : 'f1'} car={car} street={street} interpolate={interpolate} />;
}

// Scratch for the per-frame render pose (cars update one after another, so one shared object is enough).
const scratchPose: Pose = { x: 0, y: 0, a: 0 };

// Max visual wheel spin per frame (rad): keeps 6-spoke rims from strobing backwards.
const MAX_SPIN_STEP = 0.5;
const DEG = Math.PI / 180;
const FLAP_CLOSED = 25 * DEG;
const FLAP_OPEN = -3 * DEG;

function CarRig({ car, street, interpolate }: { car: WorldCar; street: boolean; interpolate: boolean }) {
  const livery = car.driver.livery;
  const wheels: WheelSpec[] = street ? STREET_WHEELS : F1_WHEELS;

  const liveryMat = useMemo(() => getLiveryMaterial(livery), [livery.body, livery.accent, livery.rim, livery.number]); // eslint-disable-line react-hooks/exhaustive-deps
  const shared = getSharedMaterials();
  const mats = useMemo(() => createCarMaterials(), []);
  useEffect(() => () => {
    mats.rimFront.dispose();
    mats.rimRear.dispose();
    mats.brakeLight.dispose();
  }, [mats]);

  const f1 = useMemo(() => (street ? null : getF1Geometries()), [street]);
  const st = useMemo(() => (street ? getStreetGeometries() : null), [street]);
  const rimGeo = useMemo(() => getRimGeometry(livery.rim), [livery.rim]);
  const tyreGeo0 = useMemo(() => getTyreGeometry(car.compound), []); // eslint-disable-line react-hooks/exhaustive-deps

  const root = useRef<THREE.Group>(null);
  const bodyGroup = useRef<THREE.Group>(null);
  const flapRef = useRef<THREE.Mesh>(null);
  const steerRef = useRef<THREE.Mesh>(null);
  const pivots = useRef<(THREE.Group | null)[]>([]);
  const spins = useRef<(THREE.Group | null)[]>([]);
  const tyres = useRef<(THREE.Mesh | null)[]>([]);

  // Per-car animation state (no allocations in the frame loop).
  const s = useRef({ compound: car.compound as TyreCompound, glow: 0, flap: FLAP_CLOSED, spin: [0, 0, 0, 0], tail: 0, t: Math.random() * 10 });

  useFrame((_, dtRaw) => {
    const g = root.current;
    if (!g) return;
    const dt = Math.min(dtRaw, 0.05);
    const p = car.phys;
    const a = s.current;
    a.t += dt;

    // Live sim cars blend between the last two fixed steps; ghost / showroom cars are written directly.
    if (interpolate) {
      const q = renderPose(car, world.alpha, scratchPose);
      g.position.set(q.x, 0.05, q.y);
      g.rotation.y = Math.PI / 2 - q.a;
    } else {
      g.position.set(p.x, 0.05, p.y);
      g.rotation.y = Math.PI / 2 - p.a;
    }

    // Body attitude + ride-height drop with speed (aero squat).
    const speedN = Math.min(1, Math.abs(p.vf) / 900);
    if (bodyGroup.current) {
      bodyGroup.current.rotation.x = p.pitch || 0;
      bodyGroup.current.rotation.z = p.roll || 0;
      bodyGroup.current.position.y = -0.016 * speedN * speedN;
    }

    // Wheels
    const steerAngle = -p.steer * 0.45;
    const base = p.vf * dt;
    for (let i = 0; i < wheels.length; i++) {
      const w = wheels[i];
      const slip = w.front ? p.wheelSlipFront : p.wheelSlipRear;
      const rate = (base / (w.radius * CAR_SCALE)) * (1 - Math.min(1, Math.max(0, slip || 0)) * 0.7);
      const step = rate > MAX_SPIN_STEP ? MAX_SPIN_STEP : rate < -MAX_SPIN_STEP ? -MAX_SPIN_STEP : rate;
      a.spin[i] = (a.spin[i] + step) % (Math.PI * 2);
      const sp = spins.current[i];
      if (sp) sp.rotation.x = a.spin[i];
      const pv = pivots.current[i];
      if (pv && w.front) pv.rotation.y = steerAngle;
    }

    // Tyre compound may change at runtime (pit stops).
    if (a.compound !== car.compound) {
      a.compound = car.compound;
      const geo = getTyreGeometry(car.compound);
      for (let i = 0; i < tyres.current.length; i++) {
        const m = tyres.current[i];
        if (m) m.geometry = geo;
      }
    }

    // Brake discs: heat up fast under hard braking at speed, cool slowly.
    const heat = Math.min(1, p.brakeInput * 1.4) * Math.min(1, Math.abs(p.vf) / 260);
    const k = heat > a.glow ? 1 - Math.exp(-dt / 0.12) : 1 - Math.exp(-dt / 1.4);
    a.glow += (heat - a.glow) * k;
    const gl = a.glow * a.glow * 3.2;
    mats.rimFront.emissiveIntensity = gl * (0.55 + 0.45 * (p.brakeBias ?? 0.5));
    mats.rimRear.emissiveIntensity = gl * (1 - 0.35 * (p.brakeBias ?? 0.5));

    // Tail light: steady red on the brakes, 4 Hz blink in rain/snow.
    const weather = useGameStore.getState().settings.weather;
    const wet = weather === 'rain' || weather === 'snow';
    let lamp = 0.35 + p.brakeInput * 3.2;
    if (wet && p.brakeInput < 0.05) lamp = Math.floor(a.t * 8) % 2 === 0 ? 3.2 : 0.2;
    mats.brakeLight.emissiveIntensity = lamp;

    // DRS flap (physics only seeds the angle, so animate it here).
    const target = p.drsOpen ? FLAP_OPEN : FLAP_CLOSED;
    a.flap += (target - a.flap) * Math.min(1, 16 * dt);
    p.drsFlapAngle = a.flap;
    if (flapRef.current) flapRef.current.rotation.x = a.flap;

    if (steerRef.current) steerRef.current.rotation.z = -p.steer * 1.8;
  });

  const setPivot = (i: number) => (el: THREE.Group | null) => {
    pivots.current[i] = el;
  };
  const setSpin = (i: number) => (el: THREE.Group | null) => {
    spins.current[i] = el;
  };
  const setTyre = (i: number) => (el: THREE.Mesh | null) => {
    tyres.current[i] = el;
  };

  return (
    <group ref={root} scale={CAR_SCALE}>
      <group ref={bodyGroup}>
        {f1 && (
          <>
            <mesh geometry={f1.body} material={liveryMat} castShadow receiveShadow />
            <mesh geometry={f1.carbon} material={shared.carbon} castShadow receiveShadow />
            <mesh ref={flapRef} geometry={f1.flap} material={liveryMat} position={f1.flapPivot} castShadow />
            <group position={[0, 0.6, 0.3]} rotation={[0.6, Math.PI, 0]}>
              <mesh ref={steerRef} geometry={f1.steeringWheel} material={shared.carbon} />
            </group>
            <mesh geometry={f1.brakeLight} material={mats.brakeLight} position={[0, 0.355, -1.472]} />
          </>
        )}
        {st && (
          <>
            <mesh geometry={st.body} material={liveryMat} castShadow receiveShadow />
            <mesh geometry={st.trim} material={shared.carbon} castShadow receiveShadow />
            <mesh geometry={st.glass} material={shared.glass} />
            <mesh geometry={st.lamps} material={shared.lamp} />
            <mesh geometry={st.tailLight} material={mats.brakeLight} />
          </>
        )}
      </group>

      {wheels.map((w, i) => (
        <group key={i} ref={setPivot(i)} position={[w.x, w.y, w.z]}>
          <group ref={setSpin(i)}>
            <mesh ref={setTyre(i)} geometry={tyreGeo0} material={shared.tyre} scale={[w.width, w.radius, w.radius]} castShadow />
            <mesh geometry={rimGeo} material={w.front ? mats.rimFront : mats.rimRear} scale={[w.width, w.radius, w.radius]} />
          </group>
        </group>
      ))}
    </group>
  );
}
