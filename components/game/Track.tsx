'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import {
  N,
  HW,
  trackSplinePoints,
  normals,
  WeatherType,
  DRS_CONFIG,
} from '@/lib/game/constants';

interface TrackProps {
  weather: WeatherType;
}

export function Track({ weather }: TrackProps) {
  // Road & Gravel procedural textures
  const { roadTexture, gravelTexture } = useMemo(() => {
    // Road Texture
    const roadCanvas = document.createElement('canvas');
    roadCanvas.width = 512;
    roadCanvas.height = 512;
    const rctx = roadCanvas.getContext('2d');
    if (rctx) {
      rctx.fillStyle = '#22252a';
      rctx.fillRect(0, 0, 512, 512);

      // Noise
      rctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
      for (let i = 0; i < 4000; i++) {
        rctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
      }

      // Racing line rubber wear
      const rubberGrad = rctx.createLinearGradient(0, 0, 512, 0);
      rubberGrad.addColorStop(0.18, 'rgba(15, 17, 20, 0.0)');
      rubberGrad.addColorStop(0.32, 'rgba(12, 14, 18, 0.45)');
      rubberGrad.addColorStop(0.48, 'rgba(15, 17, 20, 0.0)');
      rubberGrad.addColorStop(0.68, 'rgba(12, 14, 18, 0.45)');
      rubberGrad.addColorStop(0.82, 'rgba(15, 17, 20, 0.0)');
      rctx.fillStyle = rubberGrad;
      rctx.fillRect(0, 0, 512, 512);

      // Outer Edge White Lines
      rctx.fillStyle = '#f8fafc';
      rctx.fillRect(18, 0, 10, 512);
      rctx.fillRect(484, 0, 10, 512);

      // Center Dashes
      rctx.fillStyle = '#ffffff';
      for (let y = 30; y < 512; y += 90) {
        rctx.fillRect(252, y, 8, 48);
      }
    }
    const rTex = new THREE.CanvasTexture(roadCanvas);
    rTex.wrapS = THREE.ClampToEdgeWrapping;
    rTex.wrapT = THREE.RepeatWrapping;
    rTex.repeat.set(1, 140);

    // Gravel Texture
    const gravelCanvas = document.createElement('canvas');
    gravelCanvas.width = 256;
    gravelCanvas.height = 256;
    const gctx = gravelCanvas.getContext('2d');
    if (gctx) {
      gctx.fillStyle = '#bda87a';
      gctx.fillRect(0, 0, 256, 256);
      gctx.fillStyle = 'rgba(70, 50, 25, 0.16)';
      for (let i = 0; i < 3000; i++) {
        gctx.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
      }
    }
    const gTex = new THREE.CanvasTexture(gravelCanvas);
    gTex.wrapS = THREE.RepeatWrapping;
    gTex.wrapT = THREE.RepeatWrapping;
    gTex.repeat.set(1, 120);

    return { roadTexture: rTex, gravelTexture: gTex };
  }, []);

  // 1. Asphalt Road Geometry
  const roadGeometry = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 2 * 3);
    const uvs = new Float32Array(N * 2 * 2);
    const indices = new Uint32Array(N * 6);

    for (let i = 0; i < N; i++) {
      const p = trackSplinePoints[i];
      const nx = normals[i][0];
      const ny = normals[i][1];
      const lx = p[0] - nx * HW;
      const lz = p[1] - ny * HW;
      const rx = p[0] + nx * HW;
      const rz = p[1] + ny * HW;
      const idx = i * 2;

      pos[idx * 3] = lx;
      pos[idx * 3 + 1] = 0.08;
      pos[idx * 3 + 2] = lz;

      pos[(idx + 1) * 3] = rx;
      pos[(idx + 1) * 3 + 1] = 0.08;
      pos[(idx + 1) * 3 + 2] = rz;

      const v = (i / N) * 140;
      uvs[idx * 2] = 0;
      uvs[idx * 2 + 1] = v;
      uvs[(idx + 1) * 2] = 1;
      uvs[(idx + 1) * 2 + 1] = v;

      const j = (i + 1) % N;
      const i0 = i * 2;
      const i1 = i * 2 + 1;
      const j0 = j * 2;
      const j1 = j * 2 + 1;
      const tri = i * 6;

      indices[tri] = i0;
      indices[tri + 1] = i1;
      indices[tri + 2] = j0;
      indices[tri + 3] = j0;
      indices[tri + 4] = i1;
      indices[tri + 5] = j1;
    }

    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geom.setIndex(new THREE.BufferAttribute(indices, 1));
    geom.computeVertexNormals();
    return geom;
  }, []);

  // 2. Alternating Red & White Curbs
  const curbsGeometry = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 4 * 3);
    const colors = new Float32Array(N * 4 * 3);
    const indices = new Uint32Array(N * 12);
    const curbWidth = 14;

    for (let i = 0; i < N; i++) {
      const p = trackSplinePoints[i];
      const nx = normals[i][0];
      const ny = normals[i][1];

      const lOutX = p[0] - nx * (HW + curbWidth);
      const lOutZ = p[1] - ny * (HW + curbWidth);
      const lInX = p[0] - nx * HW;
      const lInZ = p[1] - ny * HW;

      const rInX = p[0] + nx * HW;
      const rInZ = p[1] + ny * HW;
      const rOutX = p[0] + nx * (HW + curbWidth);
      const rOutZ = p[1] + ny * (HW + curbWidth);

      const base = i * 4;
      pos[base * 3] = lOutX;
      pos[base * 3 + 1] = 0.12;
      pos[base * 3 + 2] = lOutZ;

      pos[(base + 1) * 3] = lInX;
      pos[(base + 1) * 3 + 1] = 0.12;
      pos[(base + 1) * 3 + 2] = lInZ;

      pos[(base + 2) * 3] = rInX;
      pos[(base + 2) * 3 + 1] = 0.12;
      pos[(base + 2) * 3 + 2] = rInZ;

      pos[(base + 3) * 3] = rOutX;
      pos[(base + 3) * 3 + 1] = 0.12;
      pos[(base + 3) * 3 + 2] = rOutZ;

      const isRed = Math.floor(i / 3) % 2 === 0;
      const cr = isRed ? 0.88 : 0.98;
      const cg = isRed ? 0.08 : 0.98;
      const cb = isRed ? 0.08 : 0.98;

      for (let v = 0; v < 4; v++) {
        colors[(base + v) * 3] = cr;
        colors[(base + v) * 3 + 1] = cg;
        colors[(base + v) * 3 + 2] = cb;
      }

      const j = (i + 1) % N;
      const jBase = j * 4;
      const tri = i * 12;

      // Left curb quad
      indices[tri] = base;
      indices[tri + 1] = base + 1;
      indices[tri + 2] = jBase;
      indices[tri + 3] = jBase;
      indices[tri + 4] = base + 1;
      indices[tri + 5] = jBase + 1;

      // Right curb quad
      indices[tri + 6] = base + 2;
      indices[tri + 7] = base + 3;
      indices[tri + 8] = jBase + 2;
      indices[tri + 9] = jBase + 2;
      indices[tri + 10] = base + 3;
      indices[tri + 11] = jBase + 3;
    }

    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geom.setIndex(new THREE.BufferAttribute(indices, 1));
    geom.computeVertexNormals();
    return geom;
  }, []);

  // 3. Gravel Runoff Geometry
  const gravelGeometry = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 4 * 3);
    const uvs = new Float32Array(N * 4 * 2);
    const indices = new Uint32Array(N * 12);
    const curbW = 14;
    const runW = 48;

    for (let i = 0; i < N; i++) {
      const p = trackSplinePoints[i];
      const nx = normals[i][0];
      const ny = normals[i][1];

      const lOutX = p[0] - nx * (HW + curbW + runW);
      const lOutZ = p[1] - ny * (HW + curbW + runW);
      const lInX = p[0] - nx * (HW + curbW);
      const lInZ = p[1] - ny * (HW + curbW);

      const rInX = p[0] + nx * (HW + curbW);
      const rInZ = p[1] + ny * (HW + curbW);
      const rOutX = p[0] + nx * (HW + curbW + runW);
      const rOutZ = p[1] + ny * (HW + curbW + runW);

      const base = i * 4;
      pos[base * 3] = lOutX;
      pos[base * 3 + 1] = 0.05;
      pos[base * 3 + 2] = lOutZ;

      pos[(base + 1) * 3] = lInX;
      pos[(base + 1) * 3 + 1] = 0.06;
      pos[(base + 1) * 3 + 2] = lInZ;

      pos[(base + 2) * 3] = rInX;
      pos[(base + 2) * 3 + 1] = 0.06;
      pos[(base + 2) * 3 + 2] = rInZ;

      pos[(base + 3) * 3] = rOutX;
      pos[(base + 3) * 3 + 1] = 0.05;
      pos[(base + 3) * 3 + 2] = rOutZ;

      const v = (i / N) * 120;
      uvs[base * 2] = 0;
      uvs[base * 2 + 1] = v;
      uvs[(base + 1) * 2] = 1;
      uvs[(base + 1) * 2 + 1] = v;
      uvs[(base + 2) * 2] = 0;
      uvs[(base + 2) * 2 + 1] = v;
      uvs[(base + 3) * 2] = 1;
      uvs[(base + 3) * 2 + 1] = v;

      const j = (i + 1) % N;
      const jBase = j * 4;
      const tri = i * 12;

      indices[tri] = base;
      indices[tri + 1] = base + 1;
      indices[tri + 2] = jBase;
      indices[tri + 3] = jBase;
      indices[tri + 4] = base + 1;
      indices[tri + 5] = jBase + 1;

      indices[tri + 6] = base + 2;
      indices[tri + 7] = base + 3;
      indices[tri + 8] = jBase + 2;
      indices[tri + 9] = jBase + 2;
      indices[tri + 10] = base + 3;
      indices[tri + 11] = jBase + 3;
    }

    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geom.setIndex(new THREE.BufferAttribute(indices, 1));
    geom.computeVertexNormals();
    return geom;
  }, []);

  // 4. Guard Rails & Catch Fences Geometry
  const { railGeometry, fenceGeometry } = useMemo(() => {
    const railH = 14.5;
    const fenceH = 26.0;
    const railOffset = HW + 82;

    const rGeom = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 4 * 3);
    const indices = new Uint32Array(N * 12);

    const fGeom = new THREE.BufferGeometry();
    const fPos = new Float32Array(N * 4 * 3);
    const fIndices = new Uint32Array(N * 12);

    for (let i = 0; i < N; i++) {
      const p = trackSplinePoints[i];
      const nx = normals[i][0];
      const ny = normals[i][1];

      const lx = p[0] - nx * railOffset;
      const lz = p[1] - ny * railOffset;
      const rx = p[0] + nx * railOffset;
      const rz = p[1] + ny * railOffset;

      const base = i * 4;

      pos[base * 3] = lx;
      pos[base * 3 + 1] = 0.4;
      pos[base * 3 + 2] = lz;

      pos[(base + 1) * 3] = lx;
      pos[(base + 1) * 3 + 1] = railH;
      pos[(base + 1) * 3 + 2] = lz;

      pos[(base + 2) * 3] = rx;
      pos[(base + 2) * 3 + 1] = 0.4;
      pos[(base + 2) * 3 + 2] = rz;

      pos[(base + 3) * 3] = rx;
      pos[(base + 3) * 3 + 1] = railH;
      pos[(base + 3) * 3 + 2] = rz;

      fPos[base * 3] = lx;
      fPos[base * 3 + 1] = railH;
      fPos[base * 3 + 2] = lz;

      fPos[(base + 1) * 3] = lx;
      fPos[(base + 1) * 3 + 1] = fenceH;
      fPos[(base + 1) * 3 + 2] = lz;

      fPos[(base + 2) * 3] = rx;
      fPos[(base + 2) * 3 + 1] = railH;
      fPos[(base + 2) * 3 + 2] = rz;

      fPos[(base + 3) * 3] = rx;
      fPos[(base + 3) * 3 + 1] = fenceH;
      fPos[(base + 3) * 3 + 2] = rz;

      const j = (i + 1) % N;
      const jBase = j * 4;
      const tri = i * 12;

      indices[tri] = base;
      indices[tri + 1] = base + 1;
      indices[tri + 2] = jBase;
      indices[tri + 3] = jBase;
      indices[tri + 4] = base + 1;
      indices[tri + 5] = jBase + 1;

      indices[tri + 6] = base + 2;
      indices[tri + 7] = jBase + 2;
      indices[tri + 8] = base + 3;
      indices[tri + 9] = jBase + 2;
      indices[tri + 10] = jBase + 3;
      indices[tri + 11] = base + 3;

      fIndices[tri] = base;
      fIndices[tri + 1] = base + 1;
      fIndices[tri + 2] = jBase;
      fIndices[tri + 3] = jBase;
      fIndices[tri + 4] = base + 1;
      fIndices[tri + 5] = jBase + 1;

      fIndices[tri + 6] = base + 2;
      fIndices[tri + 7] = jBase + 2;
      fIndices[tri + 8] = base + 3;
      fIndices[tri + 9] = jBase + 2;
      fIndices[tri + 10] = jBase + 3;
      fIndices[tri + 11] = base + 3;
    }

    rGeom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    rGeom.setIndex(new THREE.BufferAttribute(indices, 1));
    rGeom.computeVertexNormals();

    fGeom.setAttribute('position', new THREE.BufferAttribute(fPos, 3));
    fGeom.setIndex(new THREE.BufferAttribute(fIndices, 1));

    return { railGeometry: rGeom, fenceGeometry: fGeom };
  }, []);

  const roadRoughness = weather === 'rain' ? 0.22 : weather === 'cloudy' ? 0.78 : 0.82;
  const terrainColor = weather === 'snow' ? 0xdce7f2 : weather === 'rain' ? 0x182416 : 0x2e4726;

  return (
    <group name="track">
      {/* Asphalt Road Ribbon */}
      <mesh geometry={roadGeometry} receiveShadow>
        <meshStandardMaterial map={roadTexture} roughness={roadRoughness} metalness={0.12} />
      </mesh>

      {/* 3D FIA Curbs */}
      <mesh geometry={curbsGeometry} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.65} />
      </mesh>

      {/* Gravel Runoffs */}
      <mesh geometry={gravelGeometry} receiveShadow>
        <meshStandardMaterial map={gravelTexture} roughness={0.95} metalness={0.05} />
      </mesh>

      {/* Armco Guard Rails */}
      <mesh geometry={railGeometry} castShadow receiveShadow>
        <meshStandardMaterial color={0xcdd6df} roughness={0.35} metalness={0.78} />
      </mesh>

      {/* Catch Fences */}
      <mesh geometry={fenceGeometry}>
        <meshBasicMaterial color={0x64748b} wireframe transparent opacity={0.35} />
      </mesh>

      {/* Giant Ground Terrain Plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow>
        <planeGeometry args={[36000, 36000]} />
        <meshStandardMaterial color={terrainColor} roughness={0.92} />
      </mesh>
    </group>
  );
}
