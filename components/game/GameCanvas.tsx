'use client';

import React, { Suspense, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { QUALITY_PRESETS } from '@/lib/game/performance';
import { useGameStore } from '@/lib/game/store';
import { Track } from './Track';
import { TrackProps } from './TrackProps';
import { Cars } from './Cars';
import { RacingLine } from './RacingLine';
import { Camera } from './Camera';
import { Environment } from './Environment';
import { Effects } from './Effects';
import { GameLoop } from './GameLoop';
import { DevStats } from './DevStats';
import { AdaptiveQuality } from './AdaptiveQuality';
import { AudioBridge } from './AudioBridge';
// The composer pulls in the whole postprocessing library: load it after the scene is up.
const PostFX = dynamic(() => import('./fx/PostFX').then((m) => m.PostFX), { ssr: false });
import { Ghost } from './Ghost';
import { ReplayDirector } from './replay/ReplayDirector';

/**
 * Scene composition root. Each workstream mounts its components here:
 *  - world/environment: <Environment/>, <Track/>, <TrackProps/>
 *  - cars: <Cars/>
 *  - fx & post-processing: <Effects/>
 *  - cameras: <Camera/>
 *  - simulation bridge: <GameLoop/> (must stay mounted)
 */
export function GameCanvas() {
  // The Canvas is created once per session and never remounted for a quality change: resolution is adjusted live by
  // <AdaptiveQuality/> and tiers (shadows, particles, foliage, post) react through the store. Only the initial
  // resolution is read here; MSAA is off at every tier (SMAA runs inside the composer; LOW has no AA by design),
  // and PostFX switches renderer tone mapping off while its composer is mounted.
  const initialDpr = useRef(QUALITY_PRESETS[useGameStore.getState().quality].pixelRatio).current;
  const shadows = QUALITY_PRESETS[useGameStore((s) => s.quality)].shadows;

  return (
    <div className="relative w-full h-full select-none overflow-hidden bg-slate-900">
      <Canvas
        shadows={shadows}
        dpr={initialDpr}
        camera={{ position: [0, 30, -100], fov: 65, near: 0.5, far: 14000 }}
        gl={{
          antialias: false,
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
          <RacingLine />
          <Ghost />
          <Effects />
          <Camera />
          <ReplayDirector />
          <PostFX />
        </Suspense>
        <GameLoop />
        <AdaptiveQuality />
        <DevStats />
        <AudioBridge />
      </Canvas>
    </div>
  );
}
