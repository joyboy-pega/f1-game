'use client';

import React, { Suspense } from 'react';
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
  const quality = useGameStore((s) => s.quality);
  const perf = QUALITY_PRESETS[quality];
  const post = perf.postTier !== 'off';

  return (
    <div className="relative w-full h-full select-none overflow-hidden bg-slate-900">
      {/* gl options are fixed at context creation, so the composer on/off switch remounts the Canvas:
          MSAA only when no composer runs (SMAA replaces it), and tone mapping lives in exactly one place. */}
      <Canvas
        key={post ? 'post' : 'plain'}
        shadows={perf.shadows}
        dpr={perf.pixelRatio}
        camera={{ position: [0, 30, -100], fov: 65, near: 0.5, far: 14000 }}
        gl={{
          antialias: !post,
          powerPreference: 'high-performance',
          toneMapping: post ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping,
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
        <AudioBridge />
      </Canvas>
    </div>
  );
}
