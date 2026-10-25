'use client';

import React, { useMemo, useRef, useState, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { F1Car } from '@/components/game/car/F1Car';
import type { Livery, TyreCompound, VehicleModelType } from '@/lib/game/constants';
import type { WeatherType } from '@/lib/game/gameState';
import { createInitialCarState } from '@/lib/game/physics';
import { makeCar } from '@/lib/game/sim/world';
import { useGameStore } from '@/lib/game/store';
import { ShowroomWeather } from './ShowroomWeather';

type PresetId = 'front34' | 'side' | 'cockpit' | 'rear' | 'wheel';

interface PresetConfig {
  id: PresetId;
  label: string;
  pos: [number, number, number];
  target: [number, number, number];
}

const PRESETS: PresetConfig[] = [
  { id: 'front34', label: '3/4 Aero', pos: [62, 29, 83], target: [0, 6, 0] },
  { id: 'side', label: 'Side Profile', pos: [96, 14, 0], target: [0, 6, 0] },
  { id: 'cockpit', label: 'Cockpit', pos: [0, 24, 20], target: [0, 5, 0] },
  { id: 'rear', label: 'Rear Engine', pos: [-55, 20, -65], target: [0, 5, 0] },
  { id: 'wheel', label: 'Rim & Hub', pos: [36, 9, 38], target: [14, 4, 28] },
];

function Turntable({
  livery,
  compound,
  spinning,
}: {
  livery: Livery;
  compound: TyreCompound;
  spinning: boolean;
}) {
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
    if (spinning && group.current) {
      group.current.rotation.y += dt * 0.35;
    }
  });

  return (
    <group ref={group}>
      <F1Car car={car} />
    </group>
  );
}

function CameraController({
  freeMode,
  presetPos,
  presetTarget,
  onUserInteract,
}: {
  freeMode: boolean;
  presetPos: [number, number, number] | null;
  presetTarget: [number, number, number] | null;
  onUserInteract: () => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);
  const defaultTarget = useMemo(() => new THREE.Vector3(62, 29, 83), []);
  const lookTarget = useMemo(() => new THREE.Vector3(0, 6, 0), []);

  useFrame(({ camera }) => {
    if (!freeMode) {
      camera.position.lerp(defaultTarget, 0.05);
      camera.lookAt(lookTarget);
    } else if (presetPos && controlsRef.current) {
      camera.position.lerp(new THREE.Vector3(...presetPos), 0.08);
      if (presetTarget) {
        controlsRef.current.target.lerp(new THREE.Vector3(...presetTarget), 0.08);
      }
      controlsRef.current.update();
    }
  });

  if (!freeMode) return null;

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={true}
      enableZoom={true}
      enableRotate={true}
      enableDamping={true}
      dampingFactor={0.08}
      minDistance={16}
      maxDistance={220}
      maxPolarAngle={Math.PI / 2 - 0.04}
      target={[0, 6, 0]}
      onStart={onUserInteract}
    />
  );
}

/** Live 3D garage: real race car with both auto-spinning turntable and interactive 360 free camera mode. */
export default function Showroom({
  model,
  livery,
  compound,
  weather,
}: {
  model: VehicleModelType;
  livery: Livery;
  compound: TyreCompound;
  weather?: WeatherType;
}) {
  const storeWeather = useGameStore((s) => s.settings.weather);
  const activeWeather = weather ?? storeWeather;
  const setSettings = useGameStore((s) => s.setSettings);
  const [freeMode, setFreeMode] = useState(false);
  const [activePreset, setActivePreset] = useState<PresetId | null>(null);
  const [presetPos, setPresetPos] = useState<[number, number, number] | null>(null);
  const [presetTarget, setPresetTarget] = useState<[number, number, number] | null>(null);

  React.useEffect(() => {
    setSettings({ carModel: model });
  }, [model, setSettings]);

  const selectPreset = useCallback((preset: PresetConfig) => {
    setActivePreset(preset.id);
    setPresetPos(preset.pos);
    setPresetTarget(preset.target);
  }, []);

  const handleUserInteract = useCallback(() => {
    // When user orbits or zooms manually, disengage preset tracking
    setPresetPos(null);
    setPresetTarget(null);
  }, []);

  const toggleFreeMode = useCallback((active: boolean) => {
    setFreeMode(active);
    if (!active) {
      setActivePreset(null);
      setPresetPos(null);
      setPresetTarget(null);
    } else {
      selectPreset(PRESETS[0]);
    }
  }, [selectPreset]);

  return (
    <div className="relative w-full h-full select-none">
      {/* Top Controls: Mode Switcher */}
      <div className="l-showroom-toolbar" aria-label="Showroom camera modes">
        <button
          type="button"
          className={`l-showroom-btn ${!freeMode ? 'on' : ''}`}
          onClick={() => toggleFreeMode(false)}
          title="Automatic turntable rotation"
        >
          🔄 Spin
        </button>
        <button
          type="button"
          className={`l-showroom-btn ${freeMode ? 'on' : ''}`}
          onClick={() => toggleFreeMode(true)}
          title="Interactive 360 free orbit inspection"
        >
          🎮 Free Mode
        </button>
      </div>

      {/* Free Mode Overlays: Hint and Angle Presets */}
      {freeMode && (
        <>
          <div className="l-showroom-hint">
            <span>🖱️ Drag to orbit · Scroll to zoom</span>
          </div>

          <div className="l-showroom-presets" role="toolbar" aria-label="Camera presets">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`l-showroom-preset-btn ${activePreset === p.id ? 'on' : ''}`}
                onClick={() => selectPreset(p)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* 3D Canvas */}
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [62, 29, 83], fov: 30, near: 1, far: 900 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      >
        <color attach="background" args={['#0b0d11']} />
        <fog attach="fog" args={['#0b0d11', 220, 520]} />
        <Environment resolution={128} frames={1}>
          <Lightformer
            form="rect"
            intensity={2.2}
            color="#ffffff"
            position={[0, 40, 10]}
            rotation-x={Math.PI / 2}
            scale={[60, 40, 1]}
          />
          <Lightformer
            form="rect"
            intensity={2.6}
            color="#dfe8ff"
            position={[-40, 14, -10]}
            rotation-y={Math.PI / 2}
            scale={[50, 14, 1]}
          />
          <Lightformer
            form="rect"
            intensity={2.4}
            color="#ffd9b0"
            position={[40, 10, 20]}
            rotation-y={-Math.PI / 2}
            scale={[50, 14, 1]}
          />
          <Lightformer
            form="circle"
            intensity={4}
            color="#ffffff"
            position={[0, 22, -50]}
            scale={[20, 20, 1]}
          />
        </Environment>
        <directionalLight position={[30, 60, 40]} intensity={activeWeather === 'rain' ? 1.05 : 1.4} />
        <mesh rotation-x={-Math.PI / 2} position={[0, -0.05, 0]}>
          <circleGeometry args={[70, 64]} />
          <meshStandardMaterial
            color={activeWeather === 'rain' ? '#0f1218' : activeWeather === 'snow' ? '#181d26' : '#171a20'}
            roughness={activeWeather === 'rain' ? 0.28 : activeWeather === 'snow' ? 0.72 : 0.85}
            metalness={activeWeather === 'rain' ? 0.35 : 0.1}
          />
        </mesh>
        <ContactShadows position={[0, 0.02, 0]} opacity={0.55} scale={90} blur={2.4} far={30} />
        <ShowroomWeather weather={activeWeather} />
        <Turntable livery={livery} compound={compound} spinning={!freeMode} />
        <CameraController
          freeMode={freeMode}
          presetPos={presetPos}
          presetTarget={presetTarget}
          onUserInteract={handleUserInteract}
        />
      </Canvas>
    </div>
  );
}
