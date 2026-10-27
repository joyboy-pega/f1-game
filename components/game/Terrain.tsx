'use client';

import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { track } from '@/lib/game/track';
import { useLighting } from '@/lib/game/visuals/lighting';
import { getGrassPlain, getMacroNoise } from '@/lib/game/visuals/textures';
import { buildTerrain, type TerrainData } from '@/lib/game/visuals/terrain';

export function Terrain() {
  const L = useLighting();
  const snow = L.snow;
  const trackId = track.current.meta.id;

  const data: TerrainData = useMemo(() => {
    return buildTerrain(track.current, snow);
  }, [trackId, snow]);

  // Clean up WebGL geometry buffers when track or snow changes
  useEffect(() => {
    return () => {
      data.chunks.forEach((c) => c.geometry.dispose());
      data.mountainRing.dispose();
    };
  }, [data]);

  const textures = useMemo(() => {
    const grass = getGrassPlain(snow).clone();
    grass.wrapS = THREE.RepeatWrapping;
    grass.wrapT = THREE.RepeatWrapping;
    grass.repeat.set(4, 4);
    grass.needsUpdate = true;

    const macro = getMacroNoise();
    return { grass, macro };
  }, [snow]);

  useEffect(() => {
    return () => {
      textures.grass.dispose();
    };
  }, [textures]);

  return (
    <group name="terrain">
      {/* 4 quadrant terrain chunks: frustum-culled per chunk, total <= 4 draw calls */}
      {data.chunks.map((chunk, idx) => (
        <mesh key={idx} geometry={chunk.geometry} receiveShadow>
          <meshStandardMaterial
            vertexColors
            map={textures.grass}
            lightMap={textures.macro}
            lightMapIntensity={0.65}
            roughness={0.94}
            metalness={0.02}
          />
        </mesh>
      ))}

      {/* 1 far horizon mountain ring: replaces sphere hills, 1 draw call */}
      <mesh geometry={data.mountainRing}>
        <meshStandardMaterial
          vertexColors
          roughness={1.0}
          fog={true}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}
