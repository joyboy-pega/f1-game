'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HW, TW } from '@/lib/game/constants';
import { track } from '@/lib/game/track';
import { surfaceHeight } from '@/lib/game/track/surface';
import { QUALITY_PRESETS } from '@/lib/game/performance';
import { useGameStore } from '@/lib/game/store';
import { useLighting } from '@/lib/game/visuals/lighting';
import {
  getBanner,
  getBrakeBoards,
  getCrowdSprite,
  getGlow,
  getSponsorAtlas,
  getTreeTexture,
  getTyreWall,
} from '@/lib/game/visuals/textures';
import {
  buildBrakeBoards,
  buildMarshalPosts,
  buildPaddockBuildings,
  buildSponsorBoards,
  buildTreeSystem,
  buildTyreWalls,
} from '@/lib/game/visuals/dressing';
import {
  GeoBuilder,
  getTrackVisuals,
  frameAt,
  rng,
  sideProfile,
  sweep,
  wrapIdx,
  type RGBA,
} from '@/lib/game/visuals/trackData';

const WALL = HW + 82;
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

/** Shortest wrapped distance (in spline indices, 0..N/2) between index `a` and the closed span [from, from+count). */
function wrappedGapToSpan(N: number, a: number, from: number, count: number): number {
  const wa = wrapIdx(a);
  const wf = wrapIdx(from);
  const we = wrapIdx(from + count);
  // Inside the span: gap 0.
  if (wf <= we ? wa >= wf && wa <= we : wa >= wf || wa <= we) return 0;
  const d1 = Math.abs(wa - wf);
  const d2 = Math.abs(wa - we);
  return Math.min(d1, N - d1, d2, N - d2);
}

/** Where the grandstands go: the whole main straight opposite the pits, plus outside key corners. */
export function standPlan(): Stand[] {
  const T = track.current;
  const corners = getTrackVisuals().corners;
  const wallAt = (idx: number) => (T.halfWidth ? T.halfWidth[idx] : HW) + 82;
  const pitStand: Stand = { from: T.pit.boxStartIdx, count: 190, side: (-T.pit.side) as 1 | -1, d0: wallAt(T.pit.boxStartIdx) + 28 };
  const out: Stand[] = [pitStand];
  if (!corners || corners.length === 0) return out;
  // Minimum gap (spline indices) a corner stand must keep from the pit straight's stand, or the two
  // end up flush against each other — on Buddh, Turn 1's stand started just 3 indices after the pit
  // stand's wrapped end, both on the same side: one continuous-looking grandstand rendered as two
  // separate 6-tier structures, doubled crowd instances and all ("duplicate crowd").
  const MIN_GAP = 60;
  const pick = (apexIdx: number, span: number) => {
    const c = corners.reduce((best, k) => (Math.abs(wrapIdx(k.apex) - apexIdx) < Math.abs(wrapIdx(best.apex) - apexIdx) ? k : best), corners[0]);
    if (!c) return;
    const from = wrapIdx(c.apex) - Math.floor(span / 2);
    const side = (-c.inside) as 1 | -1;
    if (side === pitStand.side && wrappedGapToSpan(T.N, from, pitStand.from, pitStand.count) < MIN_GAP) return;
    if (side === pitStand.side && wrappedGapToSpan(T.N, from + span, pitStand.from, pitStand.count) < MIN_GAP) return;
    out.push({ from, count: span, side, d0: wallAt(wrapIdx(from)) + 30 });
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
          const baseY = surfaceHeight(f, s.side * d);
          dummy.position.set(x, baseY + t * TIER_H + TIER_H + 2.2, z);
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

function CrowdMesh({ crowd, sprite }: { crowd: Crowd; sprite: THREE.Texture }) {
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
      <planeGeometry args={[2.2, 3.8]} />
      <meshBasicMaterial map={sprite} transparent alphaTest={0.4} side={THREE.DoubleSide} toneMapped={false} />
    </instancedMesh>
  );
}

function TreeMesh({ geometry, matrices, texture }: { geometry: THREE.BufferGeometry; matrices: THREE.Matrix4[]; texture: THREE.Texture }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [matrices]);
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, matrices.length]}>
      <meshStandardMaterial map={texture} transparent alphaTest={0.45} roughness={0.9} side={THREE.DoubleSide} />
    </instancedMesh>
  );
}

/** Free the geometry, material(s) and instance buffers of instanced meshes we built by hand. */
function disposeInstanced(...meshes: THREE.InstancedMesh[]) {
  for (const m of meshes) {
    m.geometry.dispose();
    (Array.isArray(m.material) ? m.material : [m.material]).forEach((mat) => mat.dispose());
    m.dispose();
  }
}

export function TrackProps() {
  const T = track.current;
  const N = T.N;
  const PIT_LANE = T.pit;
  const PIT_SIDE = PIT_LANE.side;
  const TRACK_BOUNDS = getTrackVisuals().bounds;
  // Geometry is rebuilt if the active track changes (the Canvas also remounts per session).
  const trackId = T.meta.id;
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
    const y = surfaceHeight(0, 0);
    return { x, y, z, rotY: Math.atan2(tx, tz) };
  }, [trackId]);
  const gantryTex = useMemo(() => {
    const mainTitle = T.meta.name ? T.meta.name.toUpperCase() : 'GRAND PRIX';
    const subTitle = T.meta.country ? `${T.meta.country.toUpperCase()} GRAND PRIX` : 'SIMULART TRACKS';
    return getBanner(`gantry_${trackId}`, mainTitle, subTitle, 1024, 192, '#0a0d12', '#ffffff', '#c8ff2e');
  }, [trackId, T.meta.name, T.meta.country]);

  const plan = useMemo(standPlan, [trackId]);
  const standGeo = useMemo(() => buildStands(plan), [plan]);
  const crowd = useMemo(() => buildCrowd(plan, Math.max(0.35, density)), [plan, density]);
  const crowdSprite = useMemo(() => getCrowdSprite(), []);

  // ---- G3 trackside dressing: brake markers, tyre walls, sponsors, marshals, trees, paddock ----
  const brakeBoards = useMemo(() => buildBrakeBoards(T), [trackId]);
  const brakeTex = useMemo(() => getBrakeBoards(), []);
  const tyreWalls = useMemo(() => buildTyreWalls(T), [trackId]);
  const tyreTex = useMemo(() => getTyreWall(), []);
  const sponsors = useMemo(() => buildSponsorBoards(T), [trackId]);
  const sponsorTex = useMemo(() => getSponsorAtlas(), []);
  const marshals = useMemo(() => buildMarshalPosts(T), [trackId]);
  const paddock = useMemo(() => buildPaddockBuildings(T), [trackId]);
  const trees = useMemo(() => buildTreeSystem(T, density), [trackId, density]);
  const treeTex = useMemo(() => getTreeTexture(L.snow), [L.snow]);

  // Clean up dressing geometries on unmount / track switch
  const bannerGeo = useMemo(() => new THREE.PlaneGeometry(96, 12), []);

  // ---- banners along the catch fence on the main straight ----
  const banners = useMemo(() => {
    const specs: [string, string, string, number, 1 | -1][] = [
      ['b0', 'FORMULA V', 'WORLD CHAMPIONSHIP', 1840, -PIT_SIDE as 1 | -1],
      ['b1', 'ARIGATOO', 'CLUB · FOR FUN', 1900, -PIT_SIDE as 1 | -1],
      ['b2', 'BUDDH GP', '5.125 KM · 16 TURNS', 30, -PIT_SIDE as 1 | -1],
      ['b3', 'DRS ZONE', 'MAIN STRAIGHT', 1760, -PIT_SIDE as 1 | -1],
    ];
    return specs.map(([key, text, sub, idx, side]) => {
      const wallDist = (T.halfWidth ? T.halfWidth[idx] : HW) + 82;
      const [x, z, tx, tz] = place(idx, side * (wallDist - 0.3));
      const y = surfaceHeight(idx, side * (wallDist - 0.3)) + 20.5;
      const tex = getBanner(key, text, sub, 1024, 256, '#0b0f16', '#ffffff', '#e10600');
      return { key, tex, x, y, z, yaw: Math.atan2(tx, tz) + (side > 0 ? Math.PI / 2 : -Math.PI / 2) };
    });
  }, [trackId]);

  // ---- floodlight towers (night) ----
  const towers = useMemo(() => {
    const poles = new GeoBuilder(3);
    const heads = new GeoBuilder(3);
    const pools: THREE.Matrix4[] = [];
    const dummy = new THREE.Object3D();
    for (let i = 0; i < N; i += 48) {
      for (const side of [1, -1] as const) {
        if (side === PIT_SIDE && (i >= PIT_LANE.entryIdx - 30 || i <= PIT_LANE.exitIdx + 30)) continue;
        const hw = T.halfWidth ? T.halfWidth[i] : HW;
        const wallDist = hw + 82;
        const [x, z, tx, tz] = place(i, side * (wallDist + 12));
        const yaw = Math.atan2(tx, tz);
        const groundY = surfaceHeight(i, side * (wallDist + 12));
        poles.box(x, groundY + 40, z, 2.6, 80, 2.6, yaw, [0.25, 0.27, 0.3, 1]);
        heads.box(x, groundY + 82, z, 14, 5, 3, yaw, [1, 0.95, 0.8, 1]);
        // light pool on the asphalt, pulled toward the track
        const hwMid = T.halfWidth ? T.halfWidth[(i + 6) % N] : HW;
        const [px, pz] = place(i + 6, side * (hwMid * 0.35));
        const py = surfaceHeight(i + 6, side * (hwMid * 0.35)) + 0.13;
        dummy.position.set(px, py, pz);
        dummy.rotation.set(-Math.PI / 2, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        pools.push(dummy.matrix.clone());
      }
    }
    return { poles: poles.build(), heads: heads.build(), pools };
  }, [trackId]);

  useEffect(() => {
    return () => {
      standGeo?.dispose();
      brakeBoards?.dispose();
      tyreWalls?.dispose();
      sponsors?.dispose();
      marshals.posts?.dispose();
      marshals.lightPanels?.dispose();
      paddock?.dispose();
      trees.geometry?.dispose();
      towers.poles?.dispose();
      towers.heads?.dispose();
      bannerGeo?.dispose();
    };
  }, [standGeo, brakeBoards, tyreWalls, sponsors, marshals, paddock, trees, towers, bannerGeo]);

  const poolRef = useRef<THREE.InstancedMesh>(null);
  const glow = useMemo(() => getGlow(), []);
  useEffect(() => {
    const mesh = poolRef.current;
    if (!mesh) return;
    towers.pools.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [towers]);

  const night = L.nightFactor;

  return (
    <group name="track-props">
      {/* start / finish gantry */}
      <group position={[gantry.x, gantry.y, gantry.z]} rotation={[0, gantry.rotY, 0]}>
        <mesh position={[0, 34, 0]} castShadow>
          <boxGeometry args={[(T.halfWidth ? T.halfWidth[0] * 2 : TW) + 44, 5, 6]} />
          <meshStandardMaterial color={0x1b222d} roughness={0.5} metalness={0.6} />
        </mesh>
        {[-(T.halfWidth ? T.halfWidth[0] : HW) - 20, (T.halfWidth ? T.halfWidth[0] : HW) + 20].map((x, i) => (
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
        <CrowdMesh key={i} crowd={c} sprite={crowdSprite} />
      ))}

      {/* G3 dressing: trees removed per request */}

      {/* G3 dressing: brake marker boards */}
      {brakeBoards && (
        <mesh geometry={brakeBoards} receiveShadow>
          <meshStandardMaterial map={brakeTex} roughness={0.7} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* G3 dressing: tyre wall barriers */}
      {tyreWalls && (
        <mesh geometry={tyreWalls} receiveShadow>
          <meshStandardMaterial map={tyreTex} roughness={0.9} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* G3 dressing: sponsor boards */}
      {sponsors && (
        <mesh geometry={sponsors} receiveShadow>
          <meshStandardMaterial map={sponsorTex} roughness={0.6} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* G3 dressing: marshal observation posts removed from track per request */}

      {/* G3 dressing: paddock & hospitality buildings */}
      {paddock && (
        <mesh geometry={paddock} receiveShadow castShadow>
          <meshStandardMaterial vertexColors roughness={0.6} metalness={0.3} />
        </mesh>
      )}

      {/* banners on the catch fence */}
      {banners.map((b) => (
        <mesh key={b.key} geometry={bannerGeo} position={[b.x, b.y, b.z]} rotation={[0, b.yaw, 0]}>
          <meshBasicMaterial map={b.tex} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      ))}

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
