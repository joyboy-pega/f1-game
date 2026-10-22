'use client';

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { devStats, statsRequested } from '@/lib/game/devStats';
import { useGameStore } from '@/lib/game/store';

const PUBLISH_EVERY_S = 1;

/** Publishes renderer + sim timing to window.__BUDDH_STATS__ (see lib/game/devStats.ts). Renders nothing. */
export function DevStats() {
  const gl = useThree((s) => s.gl);
  const acc = useRef({ elapsed: 0, frames: 0, frameMs: 0, calls: 0, tris: 0 });

  useEffect(() => {
    if (!statsRequested()) return;
    devStats.enabled = true;
    devStats.canvasMounts++;
    const onLost = () => devStats.contextLosses++;
    gl.domElement.addEventListener('webglcontextlost', onLost);
    window.__BUDDH_DEV__ = { setQuality: (q) => useGameStore.getState().setSettings({ quality: q }) };
    // renderer.render() resets the counters on every call, and the composer renders several passes per frame.
    // Turn autoReset off and reset once per frame ourselves so the totals cover the whole frame.
    gl.info.autoReset = false;
    gl.info.reset();
    return () => {
      gl.info.autoReset = true;
      devStats.enabled = false;
      gl.domElement.removeEventListener('webglcontextlost', onLost);
      delete window.__BUDDH_STATS__;
      delete window.__BUDDH_DEV__;
    };
  }, [gl]);

  // Very early priority: at the start of frame N the counters still hold frame N-1 in full.
  useFrame((_, delta) => {
    if (!devStats.enabled) return;
    const a = acc.current;
    a.calls += gl.info.render.calls;
    a.tris += gl.info.render.triangles;
    gl.info.reset();
    a.frames++;
    a.frameMs += delta * 1000;
    a.elapsed += delta;
    if (a.elapsed < PUBLISH_EVERY_S) return;
    window.__BUDDH_STATS__ = {
      drawCalls: Math.round(a.calls / a.frames),
      triangles: Math.round(a.tris / a.frames),
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
      programs: gl.info.programs?.length ?? 0,
      simMsAvg: devStats.simFrames ? devStats.simMsSum / devStats.simFrames : 0,
      frameMsAvg: a.frameMs / a.frames,
      dpr: gl.getPixelRatio(),
      quality: useGameStore.getState().quality,
      frames: a.frames,
      canvasMounts: devStats.canvasMounts,
      contextLosses: devStats.contextLosses,
    };
    a.elapsed = a.frames = a.frameMs = a.calls = a.tris = 0;
    devStats.simMsSum = 0;
    devStats.simFrames = 0;
  }, -1000);

  return null;
}
