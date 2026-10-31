'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CAR_SCALE, type TyreCompound } from '@/lib/game/constants';
import { useGameStore } from '@/lib/game/store';
import type { WorldCar } from '@/lib/game/sim/types';
import { world } from '@/lib/game/sim/world';
import { renderPose, type Pose } from '@/lib/game/sim/interp';
import { F1_WHEELS, ROADSTER_WHEELS, type WheelSpec } from './dimensions';
import { getF1Geometries } from './f1Geometry';
import { getRoadsterGeometries } from './roadsterGeometry';
import { getLiveryMaterial } from './livery';
import { createCarMaterials, getSharedMaterials } from './materials';
import { getRimGeometry, getTyreGeometry } from './wheels';
import { PegasusCar } from './PegasusCar';
import { track } from '@/lib/game/track';
import { surfaceHeight, surfaceGradeAngle, surfaceCamberAngle, surfaceIndex } from '@/lib/game/track/surface';

export interface F1CarProps {
  car: WorldCar;
  /** Blend between the last two fixed steps (live sim cars). Off for ghost / showroom cars that write `phys` directly. */
  interpolate?: boolean;
}

/**
 * Renders one world car. Reads `car.phys` every frame; never re-renders from sim state.
 * Contract: root group placed at (phys.x, 0.05, phys.y), rotation.y = PI/2 - phys.a,
 * uniform CAR_SCALE. Supports modern 2026 F1, Tesla Roadster, and Formula Student Pegasus #53.
 */
export function F1Car({ car, interpolate = false }: F1CarProps) {
  const carModel = useGameStore((s) => s.settings.carModel);
  const isPegasus =
    (car.isPlayer && carModel === 'pegasus') || car.driver.team === 'Pegasus';
  if (isPegasus) {
    return <PegasusCar car={car} interpolate={interpolate} />;
  }
  const isRoadster = car.isPlayer && carModel === 'roadster';
  return (
    <CarRig
      key={isRoadster ? 'roadster' : 'f1'}
      car={car}
      roadster={isRoadster}
      interpolate={interpolate}
    />
  );
}

// Scratch for the per-frame render pose (cars update one after another, so one shared object is enough).
const scratchPose: Pose = { x: 0, y: 0, a: 0 };

interface CarRigProps {
  car: WorldCar;
  roadster: boolean;
  interpolate: boolean;
}

function CarRig({ car, roadster, interpolate }: CarRigProps) {
  const rootRef = useRef<THREE.Group>(null);
  const chassisRef = useRef<THREE.Group>(null);
  const flapRef = useRef<THREE.Mesh>(null);
  const steerWheelRef = useRef<THREE.Mesh>(null);
  const wheelSteerRefs = useRef<(THREE.Group | null)[]>([null, null, null, null]);
  const wheelSpinRefs = useRef<(THREE.Group | null)[]>([null, null, null, null]);
  const tyreMeshRefs = useRef<(THREE.Mesh | null)[]>([null, null, null, null]);

  const spinAngleRef = useRef(0);
  const drsAngleRef = useRef(0);
  const pitchRef = useRef(0);
  const rollRef = useRef(0);
  const frontBrakeHeatRef = useRef(0);
  const rearBrakeHeatRef = useRef(0);
  const activeCompoundRef = useRef<TyreCompound>(car.compound ?? 'soft');

  const wheelSpecs: readonly WheelSpec[] = roadster ? ROADSTER_WHEELS : F1_WHEELS;
  const f1 = useMemo(() => (roadster ? null : getF1Geometries()), [roadster]);
  const rd = useMemo(() => (roadster ? getRoadsterGeometries() : null), [roadster]);
  const rimGeo = useMemo(() => getRimGeometry(), []);
  const initialTyreGeo = useMemo(
    () => getTyreGeometry(car.compound ?? 'soft'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const sharedMats = useMemo(() => getSharedMaterials(), []);
  const livery = car.driver.livery;
  const liveryMat = useMemo(
    () => getLiveryMaterial(livery),
    [livery.body, livery.accent, livery.rim, livery.number],
  );
  const carMats = useMemo(() => createCarMaterials(), []);

  useEffect(() => {
    return () => {
      carMats.dispose?.();
    };
  }, [carMats]);

  useFrame((_, dt) => {
    const root = rootRef.current;
    if (!root) return;

    const p = car.phys;
    if (interpolate) {
      renderPose(car, world.alpha, scratchPose);
    } else {
      scratchPose.x = p.x;
      scratchPose.y = p.y;
      scratchPose.a = p.a;
    }

    // 1. Track elevation, grade (pitch), and banking (camber/roll)
    const T = track?.current;
    let carY = 0.05;
    let roadPitch = 0;
    let roadBank = 0;
    let cosH = 1;
    let sinH = 0;

    if (T && T.px) {
      const idx = p.idx ?? 0;
      const dx = scratchPose.x - T.px[idx];
      const dz = scratchPose.y - T.py[idx];
      const lat = dx * T.nx[idx] + dz * T.ny[idx];
      const f = surfaceIndex(idx, scratchPose.x, scratchPose.y);
      carY = surfaceHeight(f, lat) + 0.05;
      roadPitch = surfaceGradeAngle(f);
      roadBank = surfaceCamberAngle(f);
      const trackYaw = Math.atan2(T.ty[idx], T.tx[idx]);
      const headingDiff = scratchPose.a - trackYaw;
      cosH = Math.cos(headingDiff);
      sinH = Math.sin(headingDiff);
    }

    root.position.set(scratchPose.x, carY, scratchPose.y);
    root.rotation.set(0, Math.PI / 2 - scratchPose.a, 0);

    // 2. Braking dive / acceleration squat and cornering roll on the chassis. rotation.x > 0 is
    // nose-down here, which is the vehicle model's pitch convention (brake > 0), while an uphill
    // grade needs nose-up — the previous hand-rolled pitch had both signs inverted (squatting
    // under braking, diving uphill). Same terms as InstancedAICars so player and AI agree.
    if (chassisRef.current) {
      const netPitch = (p.pitch || 0) - roadPitch * cosH + roadBank * sinH;
      const netRoll = (p.roll || 0) + roadBank * cosH + roadPitch * sinH;

      pitchRef.current = THREE.MathUtils.lerp(pitchRef.current, netPitch, Math.min(1, dt * 14));
      rollRef.current = THREE.MathUtils.lerp(rollRef.current, netRoll, Math.min(1, dt * 14));
      chassisRef.current.rotation.set(pitchRef.current, 0, rollRef.current);
    }

    // 3. Steering angle (front wheels + cockpit butterfly steering wheel)
    const steerAngle = THREE.MathUtils.clamp(p.steer ?? car.ctrl?.steer ?? 0, -0.45, 0.45);
    // Sim steer sign is opposite the three.js wheel yaw convention.
    const wheelAngle = -steerAngle;
    if (steerWheelRef.current) {
      steerWheelRef.current.rotation.z = steerAngle * 2.4;
    }

    // 4. Wheel spin & dynamic pit-stop tyre compound swap
    const currentCompound: TyreCompound = car.compound ?? 'soft';
    const swapTyreGeo =
      currentCompound !== activeCompoundRef.current
        ? getTyreGeometry(currentCompound)
        : null;
    if (swapTyreGeo) {
      activeCompoundRef.current = currentCompound;
    }

    const avgRadius = wheelSpecs[0]?.radius ?? 0.36;
    spinAngleRef.current = (spinAngleRef.current + ((p.vf ?? 0) * dt) / avgRadius) % (Math.PI * 200);

    for (let i = 0; i < wheelSpecs.length; i++) {
      const spec = wheelSpecs[i];
      const steerGrp = wheelSteerRefs.current[i];
      const spinGrp = wheelSpinRefs.current[i];
      const tyreMesh = tyreMeshRefs.current[i];

      if (steerGrp && spec.front) {
        const ackermann = (spec.left && wheelAngle > 0) || (!spec.left && wheelAngle < 0) ? 1.08 : 0.94;
        steerGrp.rotation.y = wheelAngle * ackermann;
      }
      if (spinGrp) {
        spinGrp.rotation.x = spinAngleRef.current;
      }
      if (tyreMesh && swapTyreGeo) {
        tyreMesh.geometry = swapTyreGeo;
      }
    }

    // 5. 2026 Active-Aero / DRS Flap rotation around hinge pivot
    if (flapRef.current) {
      const targetDrs = p.drsOpen ? -0.42 : 0;
      drsAngleRef.current = THREE.MathUtils.lerp(drsAngleRef.current, targetDrs, Math.min(1, dt * 16));
      flapRef.current.rotation.x = drsAngleRef.current;
    }

    // 6. Brake Disc Thermal Glow & Rear Rain/ERS LED Intensity
    const brakeInput = p.brakeInput ?? car.ctrl?.brake ?? 0;
    const speedNorm = THREE.MathUtils.clamp((p.vf ?? 0) / 70, 0, 1);
    const targetFrontHeat = brakeInput > 0.05 ? brakeInput * speedNorm * 2.8 : 0;
    const targetRearHeat = brakeInput > 0.05 ? brakeInput * speedNorm * 1.8 : 0;

    frontBrakeHeatRef.current = THREE.MathUtils.lerp(
      frontBrakeHeatRef.current,
      targetFrontHeat,
      Math.min(1, dt * (targetFrontHeat > frontBrakeHeatRef.current ? 10 : 3.5)),
    );
    rearBrakeHeatRef.current = THREE.MathUtils.lerp(
      rearBrakeHeatRef.current,
      targetRearHeat,
      Math.min(1, dt * (targetRearHeat > rearBrakeHeatRef.current ? 10 : 3.5)),
    );

    carMats.rimFront.emissiveIntensity = frontBrakeHeatRef.current;
    carMats.rimRear.emissiveIntensity = rearBrakeHeatRef.current;

    const isBraking = brakeInput > 0.05;
    const isHarvesting = (car.ctrl?.throttle ?? 0) < 0.25 && (p.vf ?? 0) > 35;
    const pulse = isHarvesting ? (Math.sin(performance.now() * 0.022) > 0 ? 1.8 : 0.15) : 0.15;
    carMats.brakeLight.emissiveIntensity = isBraking ? 3.2 : pulse;
  });

  return (
    <group ref={rootRef} scale={CAR_SCALE}>
      <group ref={chassisRef}>
        {f1 && (
          <>
            {/* Primary Livery Bodywork */}
            <mesh geometry={f1.body} material={liveryMat} castShadow receiveShadow />

            {/* Carbon Fibre Floor, Wings, Halo, Suspension & Hub Uprights */}
            <mesh geometry={f1.carbon} material={sharedMats.carbon} castShadow receiveShadow />

            {/* 2026 Active-Aero / DRS Rear Wing Flap */}
            <mesh
              ref={flapRef}
              geometry={f1.flap}
              material={liveryMat}
              position={f1.flapPivot}
              castShadow
            />

            {/* Cockpit Butterfly Steering Wheel (angled toward driver at [0, 0.585, 0.28]) */}
            <group position={[0, 0.585, 0.285]} rotation={[-0.38, 0, 0]}>
              <mesh ref={steerWheelRef} geometry={f1.steeringWheel} material={sharedMats.carbon} />
            </group>

            {/* Central FIA Rain Light + 2026 Dual Rear Endplate LED Strips */}
            <mesh geometry={f1.brakeLight} material={carMats.brakeLight} />
          </>
        )}

        {rd && (
          <>
            <mesh geometry={rd.body} material={liveryMat} castShadow receiveShadow />
            <mesh geometry={rd.trim} material={sharedMats.carbon} castShadow receiveShadow />
            <mesh geometry={rd.glass} material={sharedMats.glass} />
            <mesh geometry={rd.lamps} material={sharedMats.lamp} />
            <mesh geometry={rd.tailLight} material={carMats.brakeLight} />
            <group position={[0.22, 0.54, 0.18]} rotation={[0.4, 0, 0]}>
              <mesh ref={steerWheelRef} geometry={rd.yoke} material={sharedMats.carbon} />
            </group>
          </>
        )}
      </group>

      {/* 4 Corner Wheels (Steer Group -> Spin Group -> Scaled Tyre + Rim + Aero Cover). Siblings of
          chassisRef, not children: suspension decouples the wheels from chassis pitch/roll/dive, so
          they must not inherit that rotation or they'd tilt rigidly with the body under braking,
          cornering and road camber instead of tracking the road at each contact patch. */}
      {wheelSpecs.map((w, i) => {
        const flipRim = w.left ? 1 : -1;
        return (
          <group
            key={i}
            position={[w.x, w.radius, w.z]}
            ref={(el) => {
              wheelSteerRefs.current[i] = el;
            }}
          >
            <group
              ref={(el) => {
                wheelSpinRefs.current[i] = el;
              }}
            >
              <mesh
                ref={(el) => {
                  tyreMeshRefs.current[i] = el;
                }}
                geometry={initialTyreGeo}
                material={sharedMats.tyre}
                scale={[w.width, w.radius, w.radius]}
                castShadow
                receiveShadow
              />
              <mesh
                geometry={rimGeo}
                material={w.front ? carMats.rimFront : carMats.rimRear}
                scale={[w.width * flipRim, w.radius, w.radius]}
                castShadow
              />
            </group>
          </group>
        );
      })}
    </group>
  );
}
