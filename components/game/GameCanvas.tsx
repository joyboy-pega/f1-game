'use client';

import React, { Suspense, useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
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
import { PostFX } from './fx/PostFX';
import { Ghost } from './Ghost';
import { ReplayDirector } from './replay/ReplayDirector';

/** Pre-warms the GPU shader cache for all scene materials so the cutscene doesn't hitch. */
function PrewarmScene() {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    try {
      gl.compile(scene, camera);
    } catch {
      // Ignore if webgl context is busy
    }
  }, [gl, scene, camera]);
  return null;
}

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
          <PrewarmScene />
        </Suspense>
        <GameLoop />
        <AdaptiveQuality />
        <DevStats />
        <AudioBridge />
      </Canvas>
    </div>
  );
}
