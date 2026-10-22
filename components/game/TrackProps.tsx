'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HW, N, PIT_LANE, TW } from '@/lib/game/constants';
import { QUALITY_PRESETS } from '@/lib/game/performance';
import { useGameStore } from '@/lib/game/store';
import { useLighting } from '@/lib/game/visuals/lighting';
import { getBanner, getGlow } from '@/lib/game/visuals/textures';
import {
  GeoBuilder,
  TRACK_BOUNDS,
  corners,
  frameAt,
  rng,
  sideProfile,
  sweep,
  wrapIdx,
  type RGBA,
} from '@/lib/game/visuals/trackData';

const WALL = HW + 82;
const PIT_SIDE = PIT_LANE.side;
const GREY: RGBA = [0.45, 0.47, 0.5, 1];
const DARK: RGBA = [0.12, 0.13, 0.16, 1];
const CROWD_COLORS = ['#e10600', '#1e41b0', '#ffd700', '#ffffff', '#00d2be', '#ff8700', '#e8e8e8', '#7a1fa2', '#222831', '#2ea043'];

/** World position (x, z) at fractional spline index `f`, `d` units along the +normal. */
function place(f: number, d: number): [number, number, number, number] {
  const [x, z, tx, tz, nx, nz] = frameAt(f);
  return [x + nx * d, z + nz * d, tx, tz];
}

export interface Stand {
  from: number;
  count: number;
  side: 1 | -1;
  d0: number; // distance from the centreline to the first tread
}

const TIERS = 6;
const TIER_D = 9;
const TIER_H = 5.5;

/** Where the grandstands go: the whole main straight opposite the pits, plus outside key corners. */
export function standPlan(): Stand[] {
  const out: Stand[] = [{ from: 1815, count: 190, side: (-PIT_SIDE) as 1 | -1, d0: WALL + 28 }];
  const pick = (apexIdx: number, span: number) => {
    const c = corners.reduce((best, k) => (Math.abs(wrapIdx(k.apex) - apexIdx) < Math.abs(wrapIdx(best.apex) - apexIdx) ? k : best), corners[0]);
    out.push({ from: wrapIdx(c.apex) - span / 2, count: span, side: (-c.inside) as 1 | -1, d0: WALL + 30 });
  };
  pick(122, 70); // Turn 1
  pick(755, 60); // Turn 4
  pick(1650, 70); // Parabolica
  return out;
}

function buildStands(plan: Stand[]) {
  const parts: THREE.BufferGeometry[] = [];
  for (const s of plan) {
    const pts = [];
    for (let t = 0; t < TIERS; t++) {
      const y0 = t * TIER_H;
      const d = s.d0 + t * TIER_D;
      pts.push({ d, y: y0, u: 0, col: GREY });
      pts.push({ d, y: y0 + TIER_H, u: 0.1, col: [0.36, 0.38, 0.41, 1] as RGBA });
      pts.push({ d: d + TIER_D, y: y0 + TIER_H, u: 0.2, col: [0.55, 0.57, 0.6, 1] as RGBA });
    }
    const top = s.d0 + TIERS * TIER_D;
    pts.push({ d: top, y: 0, u: 0.3, col: DARK });
    parts.push(sweep({ from: s.from, count: s.count, vScale: 64, colorSize: 3, profile: sideProfile(s.side, pts), flip: s.side < 0 }));
    // roof slab over the upper tiers
    const roofY = TIERS * TIER_H + 12;
    parts.push(
      sweep({
        from: s.from,
        count: s.count,
        vScale: 64,
        colorSize: 3,
        profile: sideProfile(s.side, [
          { d: s.d0 + 2 * TIER_D, y: roofY - 2, u: 0, col: [0.9, 0.9, 0.92, 1] },
          { d: top + 8, y: roofY + 4, u: 0.2, col: [0.9, 0.9, 0.92, 1] },
        ]),
        flip: s.side < 0,
      })
    );
  }
  return mergeGeometries(parts, false);
}

interface Crowd {
  matrices: THREE.Matrix4[];
  colors: THREE.Color[];
}

/** One crowd per stand so each InstancedMesh gets a tight bounding sphere and is frustum-culled. */
function buildCrowd(plan: Stand[], density: number): Crowd[] {
  const rand = rng(77);
  const dummy = new THREE.Object3D();
  return plan.map((s) => {
    const matrices: THREE.Matrix4[] = [];
    const colors: THREE.Color[] = [];
    for (let k = 0; k < s.count; k++) {
      for (let t = 0; t < TIERS; t++) {
        const perIdx = 4;
        for (let j = 0; j < perIdx; j++) {
          if (rand() > density) continue;
          const f = s.from + k + j / perIdx + (rand() - 0.5) * 0.05;
          const d = s.d0 + t * TIER_D + 2 + rand() * (TIER_D - 4);
          const [x, z, tx, tz] = place(f, s.side * d);
          dummy.position.set(x, t * TIER_H + TIER_H + 2.2, z);
          // face the track: plane normal along the (negated) side normal
          dummy.rotation.set(0, Math.atan2(tx, tz) + (s.side > 0 ? Math.PI / 2 : -Math.PI / 2), 0);
          dummy.scale.set(1, 0.85 + rand() * 0.4, 1);
          dummy.updateMatrix();
          matrices.push(dummy.matrix.clone());
          colors.push(new THREE.Color(CROWD_COLORS[(rand() * CROWD_COLORS.length) | 0]));
        }
      }
    }
    return { matrices, colors };
  });
}

function CrowdMesh({ crowd }: { crowd: Crowd }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    crowd.matrices.forEach((mat, i) => {
      mesh.setMatrixAt(i, mat);
      mesh.setColorAt(i, crowd.colors[i]);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [crowd]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, crowd.matrices.length]}>
      <planeGeometry args={[1.9, 3.6]} />
      <meshBasicMaterial side={THREE.DoubleSide} toneMapped={false} />
    </instancedMesh>
  );
}

export function TrackProps() {
  const L = useLighting();
  const lightsLit = useGameStore((s) => s.lightsLit);
  const quality = useGameStore((s) => s.quality);
  const density = QUALITY_PRESETS[quality].foliageDensity;
  const gantryLights = useRef<THREE.MeshStandardMaterial[]>([]);

  // ---- start gantry lights (emissive; bloom picks them up) ----
  useEffect(() => {
    gantryLights.current.forEach((mat, i) => {
      if (!mat) return;
      const on = i < lightsLit;
      mat.color.setHex(on ? 0xff2200 : 0x220000);
      mat.emissive.setHex(on ? 0xff1100 : 0x000000);
      mat.emissiveIntensity = on ? 6 : 0;
    });
  }, [lightsLit]);

  const gantry = useMemo(() => {
    const [x, z, tx, tz] = place(0, 0);
    return { x, z, rotY: Math.atan2(tx, tz) };
  }, []);
  const gantryTex = useMemo(() => getBanner('gantry', 'BUDDH GP', 'INDIAN GRAND PRIX', 1024, 192, '#0a0d12', '#ffffff', '#c8ff2e'), []);

  const plan = useMemo(standPlan, []);
  const standGeo = useMemo(() => buildStands(plan), [plan]);
  const crowd = useMemo(() => buildCrowd(plan, Math.max(0.35, density)), [plan, density]);

  // ---- banners along the catch fence on the main straight ----
  const banners = useMemo(() => {
    const specs: [string, string, string, number, 1 | -1][] = [
      ['b0', 'FORMULA V', 'WORLD CHAMPIONSHIP', 1840, -PIT_SIDE as 1 | -1],
      ['b1', 'ARIGATOO', 'CLUB · FOR FUN', 1900, -PIT_SIDE as 1 | -1],
      ['b2', 'BUDDH GP', '5.125 KM · 16 TURNS', 30, -PIT_SIDE as 1 | -1],
      ['b3', 'DRS ZONE', 'MAIN STRAIGHT', 1760, -PIT_SIDE as 1 | -1],
    ];
    return specs.map(([key, text, sub, idx, side]) => {
      const [x, z, tx, tz] = place(idx, side * (WALL - 0.3));
      const tex = getBanner(key, text, sub, 1024, 256, '#0b0f16', '#ffffff', '#e10600');
      return { key, tex, x, z, yaw: Math.atan2(tx, tz) + (side > 0 ? Math.PI / 2 : -Math.PI / 2) };
    });
  }, []);

  // ---- trees (instanced) ----
  const trees = useMemo(() => {
    const rand = rng(5);
    const count = Math.floor(320 * density);
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.6, 2.4, 14, 6), new THREE.MeshStandardMaterial({ color: 0x4a2e18, roughness: 0.95 }), count);
    const crown = new THREE.InstancedMesh(new THREE.ConeGeometry(9, 26, 7), new THREE.MeshStandardMaterial({ roughness: 0.85 }), count);
    trunk.castShadow = crown.castShadow = true;
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    let n = 0;
    for (let k = 0; k < count * 2 && n < count; k++) {
      const f = rand() * N;
      const side: 1 | -1 = rand() < 0.5 ? 1 : -1;
      const idx = wrapIdx(f);
      const d = WALL + 90 + rand() * 420;
      // keep clear of the garages and the grandstands
      const pitZone = side === PIT_SIDE && (idx >= PIT_LANE.entryIdx - 40 || idx <= PIT_LANE.exitIdx + 40);
      const standZone = plan.some((s) => side === s.side && ((idx - wrapIdx(s.from) + N) % N) < s.count + 10 && d < s.d0 + 120);
      if (pitZone || standZone) continue;
      const [x, z] = place(f, side * d);
      const sc = 0.8 + rand() * 0.9;
      dummy.position.set(x, 7 * sc, z);
      dummy.scale.setScalar(sc);
      dummy.updateMatrix();
      trunk.setMatrixAt(n, dummy.matrix);
      dummy.position.set(x, 7 * sc + 20 * sc, z);
      dummy.updateMatrix();
      crown.setMatrixAt(n, dummy.matrix);
      col.setHSL(0.27 + rand() * 0.06, 0.45, 0.17 + rand() * 0.1);
      crown.setColorAt(n, col);
      n++;
    }
    trunk.count = crown.count = n;
    return { trunk, crown };
  }, [density, plan]);

  // ---- floodlight towers (night) ----
  const towers = useMemo(() => {
    const poles = new GeoBuilder(3);
    const heads = new GeoBuilder(3);
    const pools: THREE.Matrix4[] = [];
    const dummy = new THREE.Object3D();
    for (let i = 0; i < N; i += 48) {
      for (const side of [1, -1] as const) {
        if (side === PIT_SIDE && (i >= PIT_LANE.entryIdx - 30 || i <= PIT_LANE.exitIdx + 30)) continue;
        const [x, z, tx, tz] = place(i, side * (WALL + 12));
        const yaw = Math.atan2(tx, tz);
        poles.box(x, 40, z, 2.6, 80, 2.6, yaw, [0.25, 0.27, 0.3, 1]);
        heads.box(x, 82, z, 14, 5, 3, yaw, [1, 0.95, 0.8, 1]);
        // light pool on the asphalt, pulled toward the track
        const [px, pz] = place(i + 6, side * (HW * 0.35));
        dummy.position.set(px, 0.13, pz);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        pools.push(dummy.matrix.clone());
      }
    }
    return { poles: poles.build(), heads: heads.build(), pools };
  }, []);

  const poolRef = useRef<THREE.InstancedMesh>(null);
  const glow = useMemo(() => getGlow(), []);
  useEffect(() => {
    const mesh = poolRef.current;
    if (!mesh) return;
    towers.pools.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [towers]);

  // ---- distant hills ring ----
  const hills = useMemo(() => {
    const rand = rng(99);
    const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshStandardMaterial({ color: '#6a7d62', roughness: 1, fog: true }), 60);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2 + rand() * 0.1;
      const r = 9000 + rand() * 2500;
      const w = 1200 + rand() * 1400;
      dummy.position.set(TRACK_BOUNDS.cx + Math.cos(a) * r, -w * 0.15, TRACK_BOUNDS.cz + Math.sin(a) * r);
      dummy.scale.set(w, 300 + rand() * 650, w);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    return mesh;
  }, []);

  const night = L.nightFactor;

  return (
    <group name="track-props">
      {/* start / finish gantry */}
      <group position={[gantry.x, 0, gantry.z]} rotation={[0, gantry.rotY, 0]}>
        <mesh position={[0, 34, 0]} castShadow>
          <boxGeometry args={[TW + 44, 5, 6]} />
          <meshStandardMaterial color={0x1b222d} roughness={0.5} metalness={0.6} />
        </mesh>
        {[-HW - 20, HW + 20].map((x, i) => (
          <mesh key={i} position={[x, 18, 0]} castShadow>
            <boxGeometry args={[5, 36, 5]} />
            <meshStandardMaterial color={0x1b222d} roughness={0.5} metalness={0.6} />
          </mesh>
        ))}
        <mesh position={[0, 41, 0]}>
          <boxGeometry args={[70, 8, 1]} />
          <meshBasicMaterial map={gantryTex} toneMapped={false} />
        </mesh>
        {[-2, -1, 0, 1, 2].map((l, i) => (
          <group key={i} position={[l * 11, 28, 0]}>
            <mesh>
              <boxGeometry args={[7.5, 9, 3.4]} />
              <meshStandardMaterial color={0x0c1018} roughness={0.7} />
            </mesh>
            {[0, 1].map((r) => (
              <mesh key={r} position={[0, r === 0 ? 1.8 : -1.8, 1.8]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[1.5, 1.5, 0.8, 16]} />
                <meshStandardMaterial
                  ref={(el) => {
                    if (el && r === 0) gantryLights.current[i] = el;
                  }}
                  color={0x220000}
                  roughness={0.3}
                  emissive={0x000000}
                />
              </mesh>
            ))}
          </group>
        ))}
      </group>

      {/* grandstands */}
      {standGeo && (
        <mesh geometry={standGeo} receiveShadow>
          <meshStandardMaterial vertexColors roughness={0.8} />
        </mesh>
      )}
      {crowd.map((c, i) => (
        <CrowdMesh key={i} crowd={c} />
      ))}

      {/* banners on the catch fence */}
      {banners.map((b) => (
        <mesh key={b.key} position={[b.x, 20.5, b.z]} rotation={[0, b.yaw, 0]}>
          <planeGeometry args={[96, 12]} />
          <meshBasicMaterial map={b.tex} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      ))}

      <primitive object={trees.trunk} />
      <primitive object={trees.crown} />
      <primitive object={hills} />

      {/* floodlights */}
      <mesh geometry={towers.poles}>
        <meshStandardMaterial vertexColors roughness={0.6} metalness={0.5} />
      </mesh>
      {night > 0.05 && (
        <instancedMesh ref={poolRef} args={[undefined, undefined, towers.pools.length]} renderOrder={3}>
          <planeGeometry args={[430, 430]} />
          <meshBasicMaterial map={glow} color="#ffe2a8" transparent opacity={night * 0.55} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </instancedMesh>
      )}
      <mesh geometry={towers.heads}>
        <meshStandardMaterial vertexColors emissive="#fff3d0" emissiveIntensity={night * 5} roughness={0.4} toneMapped={false} />
      </mesh>
    </group>
  );
}
