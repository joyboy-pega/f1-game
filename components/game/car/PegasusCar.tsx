'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CAR_SCALE, type TyreCompound } from '@/lib/game/constants';
import { useGameStore } from '@/lib/game/store';
import type { WorldCar } from '@/lib/game/sim/types';
import { PEGASUS_WHEELS } from './dimensions';
import {
  buildSculptedNoseCone,
  createHelicalSpringGeometry,
  createTubeGeometry,
  getCarbonTexture,
  getPegasusHelmetTexture,
  getPegasusNoseConeTexture,
  getPegasusRimGeometry,
  getPegasusSidepodTexture,
  toGamePt,
} from './pegasusGeometry';
import { createCarMaterials, getSharedMaterials } from './materials';
import { getTyreGeometry } from './wheels';

export interface PegasusCarProps {
  car: WorldCar;
}

const MAX_SPIN_STEP = 0.5;
const DEG = Math.PI / 180;
const FLAP_CLOSED = 25 * DEG;
const FLAP_OPEN = -3 * DEG;

export function PegasusCar({ car }: PegasusCarProps) {
  const livery = car.driver.livery;
  const shared = getSharedMaterials();
  const mats = useMemo(() => createCarMaterials(), []);
  useEffect(() => () => {
    mats.rimFront.dispose();
    mats.rimRear.dispose();
    mats.brakeLight.dispose();
  }, [mats]);

  // Dynamic livery textures updating live when livery changes
  const noseTex = useMemo(() => {
    return getPegasusNoseConeTexture(livery, car.driver.code || 'PEG');
  }, [livery.body, livery.accent, livery.number, car.driver.code]);

  const sidepodTex = useMemo(() => {
    return getPegasusSidepodTexture(livery);
  }, [livery.body, livery.accent, livery.number]);

  const helmetTex = useMemo(() => {
    return getPegasusHelmetTexture(livery);
  }, [livery.body, livery.accent]);

  // Pegasus-specific materials
  const noseMat = useMemo(() => {
    return new THREE.MeshPhysicalMaterial({
      map: noseTex,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      roughness: 0.18,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
  }, [noseTex]);

  const sidepodMat = useMemo(() => {
    return new THREE.MeshPhysicalMaterial({
      map: sidepodTex,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      roughness: 0.18,
      metalness: 0.05,
    });
  }, [sidepodTex]);

  const helmetMat = useMemo(() => {
    return new THREE.MeshPhysicalMaterial({
      map: helmetTex,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
      roughness: 0.15,
    });
  }, [helmetTex]);

  const carbonMat = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      map: getCarbonTexture(),
      roughness: 0.35,
      metalness: 0.2,
    });
  }, []);

  const bodyColorMat = useMemo(() => {
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(livery.body || '#f8fafc'),
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
      roughness: 0.18,
    });
  }, [livery.body]);

  const accentColorMat = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(livery.accent || '#dc2626'),
      metalness: 0.5,
      roughness: 0.25,
    });
  }, [livery.accent]);

  const frameTubeMat = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: 0x141619,
      roughness: 0.32,
      metalness: 0.65,
    });
  }, []);

  const darkEngineMat = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: 0x1f2229,
      metalness: 0.65,
      roughness: 0.38,
    });
  }, []);

  const engineAlloyMat = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: 0xd4d4d8,
      metalness: 0.85,
      roughness: 0.25,
    });
  }, []);

  const copperGoldMat = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: 0xd97706,
      metalness: 0.85,
      roughness: 0.2,
    });
  }, []);

  const orangeCoilMat = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: 0xea580c,
      metalness: 0.35,
      roughness: 0.3,
    });
  }, []);

  const noseGeom = useMemo(() => buildSculptedNoseCone(), []);
  const rimGeo = useMemo(() => getPegasusRimGeometry(livery.rim, livery.accent), [livery.rim, livery.accent]);
  const tyreGeo0 = useMemo(() => getTyreGeometry(car.compound), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Frame tube segments
  const tubes = useMemo(() => {
    const rawTubes: [number, number, number, number, number, number, number][] = [
      // Main roll hoop
      [-0.36, 0.42, 0.3, -0.34, 0.88, 0.26, 0.019],
      [-0.34, 0.88, 0.26, -0.31, 1.19, 0.16, 0.019],
      [-0.31, 1.19, 0.16, -0.3, 1.24, 0.0, 0.019],
      [-0.3, 1.24, 0.0, -0.31, 1.19, -0.16, 0.019],
      [-0.31, 1.19, -0.16, -0.34, 0.88, -0.26, 0.019],
      [-0.34, 0.88, -0.26, -0.36, 0.42, -0.3, 0.019],

      // Forward cockpit triangulation & top halo bars
      [-0.31, 1.15, 0.17, -0.14, 0.94, 0.23, 0.015],
      [-0.31, 1.15, -0.17, -0.14, 0.94, -0.23, 0.015],
      [-0.14, 0.94, 0.23, -0.34, 0.88, 0.26, 0.014],
      [-0.14, 0.94, -0.23, -0.34, 0.88, -0.26, 0.014],

      // Cockpit side impact structure tubes
      [-0.36, 0.56, 0.3, 0.28, 0.56, 0.29, 0.016],
      [-0.36, 0.56, -0.3, 0.28, 0.56, -0.29, 0.016],
      [-0.14, 0.94, 0.23, 0.28, 0.56, 0.29, 0.015],
      [-0.14, 0.94, -0.23, 0.28, 0.56, -0.29, 0.015],

      // Rear roll hoop bracing struts
      [-0.32, 1.08, 0.18, -0.96, 0.52, 0.24, 0.016],
      [-0.32, 1.08, -0.18, -0.96, 0.52, -0.24, 0.016],

      // Rear spaceframe engine cage
      [-0.36, 0.42, 0.3, -1.05, 0.42, 0.24, 0.014],
      [-0.36, 0.42, -0.3, -1.05, 0.42, -0.24, 0.014],
      [-0.36, 0.12, 0.28, -1.05, 0.14, 0.22, 0.014],
      [-0.36, 0.12, -0.28, -1.05, 0.14, -0.22, 0.014],
      [-1.05, 0.14, 0.22, -1.05, 0.52, 0.24, 0.014],
      [-1.05, 0.14, -0.22, -1.05, 0.52, -0.24, 0.014],
      [-1.05, 0.52, 0.24, -1.05, 0.52, -0.24, 0.014],
      [-1.05, 0.14, 0.22, -1.05, 0.14, -0.22, 0.014],
      [-0.36, 0.12, 0.28, -0.72, 0.55, 0.26, 0.014],
      [-0.36, 0.12, -0.28, -0.72, 0.55, -0.26, 0.014],
      [-0.72, 0.55, 0.26, -1.05, 0.14, 0.22, 0.014],
      [-0.72, 0.55, -0.26, -1.05, 0.14, -0.22, 0.014],

      // Front cowl damper canisters
      [0.62, 0.54, 0.27, 0.54, 0.34, 0.318, 0.026],
      [0.62, 0.54, -0.27, 0.54, 0.34, -0.318, 0.026],

      // Exhaust header & coolant pipes
      [-0.68, 0.44, 0.12, -0.88, 0.58, 0.12, 0.026],
      [-0.42, 0.36, 0.22, -0.64, 0.48, 0.21, 0.016],
      [-0.55, 0.24, 0.2, -0.78, 0.32, 0.22, 0.014],
    ];

    return rawTubes.map(([x1, y1, z1, x2, y2, z2, r]) => {
      const p1 = toGamePt([x1, y1, z1]);
      const p2 = toGamePt([x2, y2, z2]);
      return createTubeGeometry(p1, p2, r);
    });
  }, []);

  // Suspension wishbone links
  const suspensionLinks = useMemo(() => {
    const rawLinks: [number, number, number, number, number, number, number][] = [];
    // Front wishbones & tie-rods
    [1, -1].forEach((side) => {
      const zChas = side * 0.24;
      const zHub = side * 0.58;
      rawLinks.push([0.96, 0.35, zChas, 0.82, 0.36, zHub, 0.012]); // Upper A-Arm
      rawLinks.push([0.66, 0.35, zChas, 0.82, 0.36, zHub, 0.012]);
      rawLinks.push([0.98, 0.16, zChas, 0.82, 0.17, zHub, 0.013]); // Lower A-Arm
      rawLinks.push([0.64, 0.16, zChas, 0.82, 0.17, zHub, 0.013]);
      rawLinks.push([0.58, 0.48, side * 0.28, 0.8, 0.2, zHub, 0.011]); // Pushrod
      rawLinks.push([0.74, 0.24, zChas, 0.74, 0.24, zHub, 0.01]); // Tie-rod
    });
    // Rear wishbones & half-shafts
    [1, -1].forEach((side) => {
      const zChas = side * 0.22;
      const zHub = side * 0.6;
      rawLinks.push([-0.82, 0.38, zChas, -0.98, 0.38, zHub, 0.013]); // Upper A-Arm
      rawLinks.push([-1.12, 0.38, zChas, -0.98, 0.38, zHub, 0.013]);
      rawLinks.push([-0.8, 0.16, zChas, -0.98, 0.17, zHub, 0.014]); // Lower A-Arm
      rawLinks.push([-1.14, 0.16, zChas, -0.98, 0.17, zHub, 0.014]);
      rawLinks.push([-0.92, 0.27, side * 0.18, -0.98, 0.28, zHub, 0.02]); // Drive Half-shaft
      rawLinks.push([-0.74, 0.32, side * 0.26, -0.96, 0.19, zHub, 0.012]); // Pushrod
    });

    return rawLinks.map(([x1, y1, z1, x2, y2, z2, r]) => {
      const p1 = toGamePt([x1, y1, z1]);
      const p2 = toGamePt([x2, y2, z2]);
      return createTubeGeometry(p1, p2, r);
    });
  }, []);

  // Helical Coilover Springs
  const upperSpring = useMemo(() => createHelicalSpringGeometry(0.028, 0.28, 7.5, 0.0055), []);
  const rearSpring = useMemo(() => createHelicalSpringGeometry(0.028, 0.26, 7.5, 0.0055), []);

  const root = useRef<THREE.Group>(null);
  const bodyGroup = useRef<THREE.Group>(null);
  const steerRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const flapRef = useRef<THREE.Mesh>(null);
  const pivots = useRef<(THREE.Group | null)[]>([]);
  const spins = useRef<(THREE.Group | null)[]>([]);
  const tyres = useRef<(THREE.Mesh | null)[]>([]);

  const s = useRef({
    compound: car.compound as TyreCompound,
    glow: 0,
    flap: FLAP_CLOSED,
    spin: [0, 0, 0, 0],
    t: Math.random() * 10,
  });

  useFrame((_, dtRaw) => {
    const g = root.current;
    if (!g) return;
    const dt = Math.min(dtRaw, 0.05);
    const p = car.phys;
    const a = s.current;
    a.t += dt;

    g.position.set(p.x, 0.05, p.y);
    g.rotation.y = Math.PI / 2 - p.a;

    // Attitude + engine vibration
    const speedN = Math.min(1, Math.abs(p.vf) / 900);
    const engineBuzz = Math.sin(a.t * 48) * 0.0006 * (1 + Math.abs(p.vf) * 0.002);
    if (bodyGroup.current) {
      bodyGroup.current.rotation.x = p.pitch || 0;
      bodyGroup.current.rotation.z = p.roll || 0;
      bodyGroup.current.position.y = -0.016 * speedN * speedN + engineBuzz;
    }

    // Steering & Head tracking
    const steerAngle = -p.steer * 0.45;
    if (steerRef.current) steerRef.current.rotation.z = -p.steer * 1.8;
    if (headRef.current) headRef.current.rotation.y = steerAngle * 0.45;

    // Wheels
    const base = p.vf * dt;
    for (let i = 0; i < PEGASUS_WHEELS.length; i++) {
      const w = PEGASUS_WHEELS[i];
      const slip = w.front ? p.wheelSlipFront : p.wheelSlipRear;
      const rate = (base / (w.radius * CAR_SCALE)) * (1 - Math.min(1, Math.max(0, slip || 0)) * 0.7);
      const step = rate > MAX_SPIN_STEP ? MAX_SPIN_STEP : rate < -MAX_SPIN_STEP ? -MAX_SPIN_STEP : rate;
      a.spin[i] = (a.spin[i] + step) % (Math.PI * 2);
      const sp = spins.current[i];
      if (sp) sp.rotation.x = a.spin[i];
      const pv = pivots.current[i];
      if (pv && w.front) pv.rotation.y = steerAngle;
    }

    // Tyre compound live swap
    if (a.compound !== car.compound) {
      a.compound = car.compound;
      const geo = getTyreGeometry(car.compound);
      for (let i = 0; i < tyres.current.length; i++) {
        const m = tyres.current[i];
        if (m) m.geometry = geo;
      }
    }

    // Brake discs glow
    const heat = Math.min(1, p.brakeInput * 1.4) * Math.min(1, Math.abs(p.vf) / 260);
    const k = heat > a.glow ? 1 - Math.exp(-dt / 0.12) : 1 - Math.exp(-dt / 1.4);
    a.glow += (heat - a.glow) * k;
    const gl = a.glow * a.glow * 3.2;
    mats.rimFront.emissiveIntensity = gl * (0.55 + 0.45 * (p.brakeBias ?? 0.5));
    mats.rimRear.emissiveIntensity = gl * (1 - 0.35 * (p.brakeBias ?? 0.5));

    // Tail / rain light
    const weather = useGameStore.getState().settings.weather;
    const wet = weather === 'rain' || weather === 'snow';
    let lamp = 0.35 + p.brakeInput * 3.2;
    if (wet && p.brakeInput < 0.05) lamp = Math.floor(a.t * 8) % 2 === 0 ? 3.2 : 0.2;
    mats.brakeLight.emissiveIntensity = lamp;

    // DRS flap
    const target = p.drsOpen ? FLAP_OPEN : FLAP_CLOSED;
    a.flap += (target - a.flap) * Math.min(1, 16 * dt);
    p.drsFlapAngle = a.flap;
    if (flapRef.current) flapRef.current.rotation.x = a.flap;
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
        {/* 1. Sculpted Aerodynamic Nosecone & Undertray */}
        <mesh geometry={noseGeom} material={noseMat} castShadow receiveShadow />
        <mesh position={[0, 0.085, -0.22]} material={carbonMat} castShadow>
          <boxGeometry args={[0.66, 0.025, 2.15]} />
        </mesh>

        {/* 2. Sidepods with customizable livery & number */}
        <mesh position={[-0.44, 0.26, -0.08]} material={sidepodMat} castShadow receiveShadow>
          <boxGeometry args={[0.24, 0.33, 0.72]} />
        </mesh>
        <mesh position={[0.44, 0.26, -0.08]} material={sidepodMat} castShadow receiveShadow>
          <boxGeometry args={[0.24, 0.33, 0.72]} />
        </mesh>

        {/* Radiator honeycomb grilles */}
        <mesh position={[-0.44, 0.26, 0.275]}>
          <boxGeometry args={[0.19, 0.27, 0.03]} />
          <meshStandardMaterial color={0x090a0f} roughness={0.9} />
        </mesh>
        <mesh position={[0.44, 0.26, 0.275]}>
          <boxGeometry args={[0.19, 0.27, 0.03]} />
          <meshStandardMaterial color={0x090a0f} roughness={0.9} />
        </mesh>

        {/* 3. Spaceframe Tubular Chassis */}
        {tubes.map((t, idx) => (
          <mesh key={idx} geometry={t.geometry} position={t.position} quaternion={t.quaternion} material={frameTubeMat} castShadow receiveShadow />
        ))}

        {/* Carbon fiber headrest behind driver */}
        <mesh position={[0, 0.84, -0.3]} rotation={[0.15, 0, 0]} material={carbonMat}>
          <boxGeometry args={[0.26, 0.36, 0.06]} />
        </mesh>

        {/* 4. Cockpit & Driver */}
        {/* Seat */}
        <mesh position={[0, 0.16, -0.08]} material={carbonMat}>
          <boxGeometry args={[0.38, 0.08, 0.42]} />
        </mesh>
        <mesh position={[0, 0.42, -0.24]} rotation={[0.28, 0, 0]} material={carbonMat}>
          <boxGeometry args={[0.38, 0.55, 0.08]} />
        </mesh>

        {/* Driver Torso */}
        <mesh position={[0, 0.46, -0.11]} rotation={[0.26, 0, 0]} scale={[1.15, 1, 0.85]}>
          <cylinderGeometry args={[0.14, 0.16, 0.44, 16]} />
          <meshStandardMaterial color={0x121316} roughness={0.75} />
        </mesh>

        {/* Harness & Shoulders (matching accent color) */}
        {[-0.14, 0.14].map((xPos, idx) => (
          <group key={idx}>
            <mesh position={[xPos, 0.64, -0.08]} rotation={[0.25, 0, 0]} material={accentColorMat}>
              <boxGeometry args={[0.09, 0.04, 0.16]} />
            </mesh>
            <mesh position={[xPos * 0.65, 0.54, -0.02]} rotation={[1.12, 0, 0]} material={accentColorMat}>
              <boxGeometry args={[0.045, 0.025, 0.28]} />
            </mesh>
          </group>
        ))}

        {/* Steering Wheel */}
        <group position={[0, 0.58, 0.25]} rotation={[0.35, 0, 0]}>
          <group ref={steerRef}>
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <torusGeometry args={[0.11, 0.016, 12, 24]} />
              <meshStandardMaterial color={0x121316} roughness={0.75} />
            </mesh>
            <mesh material={carbonMat}>
              <boxGeometry args={[0.18, 0.12, 0.02]} />
            </mesh>
          </group>
        </group>

        {/* Driver Helmet (tracks corner apex & customized with body/accent) */}
        <group ref={headRef} position={[0, 0.83, -0.03]}>
          <mesh material={helmetMat} scale={[0.96, 1.04, 1.18]} castShadow>
            <sphereGeometry args={[0.155, 32, 24]} />
          </mesh>
          <mesh position={[0, -0.055, 0.035]} rotation={[0, 0, Math.PI / 2]} material={helmetMat}>
            <cylinderGeometry args={[0.12, 0.135, 0.13, 24, 1, false, -Math.PI * 0.45, Math.PI * 0.9]} />
          </mesh>
          <mesh position={[0, 0.015, 0.025]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.152, 0.152, 0.105, 24, 1, false, -Math.PI * 0.42, Math.PI * 0.84]} />
            <meshPhysicalMaterial color={0x050508} roughness={0.05} metalness={0.85} clearcoat={1.0} />
          </mesh>
        </group>

        {/* 5. Exposed Rear Engine Bay & Intake Plenum */}
        {/* Engine Block */}
        <mesh position={[0, 0.34, -0.68]} material={darkEngineMat} castShadow>
          <boxGeometry args={[0.34, 0.38, 0.46]} />
        </mesh>
        {/* Aluminum Plenum */}
        <group position={[0, 0.84, -0.54]} rotation={[-0.58, 0, 0]}>
          <mesh material={engineAlloyMat}>
            <boxGeometry args={[0.22, 0.17, 0.36]} />
          </mesh>
          <mesh position={[0, -0.12, -0.14]} material={engineAlloyMat}>
            <cylinderGeometry args={[0.05, 0.07, 0.22, 16]} />
          </mesh>
        </group>
        {/* Gold Manifold */}
        <mesh position={[0, 0.66, -0.5]} rotation={[0, 0, Math.PI / 2]} material={copperGoldMat}>
          <cylinderGeometry args={[0.055, 0.055, 0.26, 16]} />
        </mesh>
        {/* ECU Box */}
        <mesh position={[-0.23, 0.42, -0.56]} material={engineAlloyMat}>
          <boxGeometry args={[0.09, 0.14, 0.19]} />
        </mesh>
        {/* Exhaust Muffler */}
        <mesh position={[-0.12, 0.58, -0.88]} rotation={[0.22, 0, 0]} material={darkEngineMat}>
          <cylinderGeometry args={[0.068, 0.068, 0.34, 20]} />
        </mesh>

        {/* Angled Upper Shocks */}
        <mesh position={[-0.17, 0.61, -0.56]} rotation={[0.5, 0.3, 0]} geometry={upperSpring} material={orangeCoilMat} />
        <mesh position={[0.17, 0.61, -0.56]} rotation={[0.5, -0.3, 0]} geometry={upperSpring} material={orangeCoilMat} />

        {/* Vertical Rear Shocks (accent color) */}
        <mesh position={[-0.26, 0.42, -0.74]} geometry={rearSpring} material={accentColorMat} />
        <mesh position={[0.26, 0.42, -0.74]} geometry={rearSpring} material={accentColorMat} />

        {/* Rear Wing & Flap (body & accent) */}
        <mesh position={[0, 0.82, -1.18]} material={bodyColorMat} castShadow>
          <boxGeometry args={[0.88, 0.03, 0.26]} />
        </mesh>
        <mesh ref={flapRef} position={[0, 0.86, -1.24]} material={accentColorMat} castShadow>
          <boxGeometry args={[0.86, 0.02, 0.14]} />
        </mesh>
        <mesh position={[0, 0.44, -1.06]} material={mats.brakeLight}>
          <boxGeometry args={[0.1, 0.05, 0.03]} />
        </mesh>

        {/* 6. Dynamic Suspension Wishbone Links */}
        {suspensionLinks.map((link, idx) => (
          <mesh key={idx} geometry={link.geometry} position={link.position} quaternion={link.quaternion} material={frameTubeMat} />
        ))}
      </group>

      {/* 7. Wheels & Customizable 6-Spoke Rims */}
      {PEGASUS_WHEELS.map((w, i) => (
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
