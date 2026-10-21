'use client';

import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { QUALITY_PRESETS } from '@/lib/game/performance';
import { useGameStore } from '@/lib/game/store';
import { Track } from './Track';
import { TrackProps } from './TrackProps';
import { Cars } from './Cars';
import { Camera } from './Camera';
import { Environment } from './Environment';
import { Effects } from './Effects';
import { GameLoop } from './GameLoop';

/**
 * Scene composition root. Each workstream mounts its components here:
 *  - world/environment: <Environment/>, <Track/>, <TrackProps/>
 *  - cars: <Cars/>
 *  - fx & post-processing: <Effects/>
 *  - cameras: <Camera/>
 *  - simulation bridge: <GameLoop/> (must stay mounted)
 */
export function GameCanvas() {
  const quality = useGameStore((s) => s.quality);
  const perf = QUALITY_PRESETS[quality];

  return (
    <div className="relative w-full h-full select-none overflow-hidden bg-slate-900">
      <Canvas
        shadows={perf.shadows}
        dpr={perf.pixelRatio}
        camera={{ position: [0, 30, -100], fov: 65, near: 0.5, far: 14000 }}
        gl={{
          antialias: true,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.1,
        }}
      >
        <Suspense fallback={null}>
          <Environment />
          <Track />
          <TrackProps />
          <Cars />
          <Effects />
          <Camera />
        </Suspense>
        <GameLoop />
      </Canvas>
    </div>
  );
}
