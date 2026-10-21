'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DRIVER_ROSTER, DRS_CONFIG, HW, N, PIT_LANE, drsDetectionIdx } from '@/lib/game/constants';
import { gridSlotIndex } from '@/lib/game/sim/race';
import { boxIndexFor } from '@/lib/game/sim/pit';
import { useLighting } from '@/lib/game/visuals/lighting';
import {
  getFence,
  getGrassPlain,
  getGrassStripes,
  getGravel,
  getKerb,
  getPitBox,
  getRoadTextures,
  getTarmac,
  getWetRough,
} from '@/lib/game/visuals/textures';
import {
  GeoBuilder,
  frameAt,
  kerbInside,
  kerbOutside,
  maskRuns,
  sideIdx,
  sideProfile,
  smoothstep,
  sweep,
  type RGBA,
  type SweepPoint,
} from '@/lib/game/visuals/trackData';

// Distances from the centreline (world units). They mirror the physics bands in lib/game/physics.ts:
// asphalt < HW+6, soft verge to HW+40, gravel beyond, solid wall at HW+82.
const KERB_W = 14;
const VERGE_END = HW + 40;
const WALL = HW + 82;
const WALL_LOW = 9;
const WALL_TOP = 14.5;
const FENCE_TOP = 27;

const GREY: RGBA = [0.52, 0.54, 0.57, 1];
const WHITE: RGBA = [0.9, 0.9, 0.88, 1];
const SIDES: (1 | -1)[] = [-1, 1];

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (parts.length === 0) return null;
  return parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
}

function buildRoad() {
  return sweep({
    from: 0,
    count: N,
    vScale: 512,
    profile: [
      { o: -HW, y: 0.08, u: 0 },
      { o: HW, y: 0.08, u: 1 },
    ],
  });
}

function buildKerbs() {
  const parts: THREE.BufferGeometry[] = [];
  const add = (side: 1 | -1, mask: Float32Array) => {
    for (const [from, count] of maskRuns(mask, 0.5, 3)) {
      parts.push(
        sweep({
          from,
          count,
          vScale: 40,
          profile: sideProfile(side, [
            { d: HW, y: 0.09, u: 0 },
            { d: HW + 1.5, y: 0.19, u: 0.12 },
            { d: HW + KERB_W - 3, y: 0.17, u: 0.8 },
            { d: HW + KERB_W, y: 0.06, u: 1 },
          ]),
          flip: side < 0,
        })
      );
    }
  };
  for (const side of SIDES) {
    add(side, kerbInside[sideIdx(side)]);
    add(side, kerbOutside[sideIdx(side)]);
  }
  return merge(parts);
}

function buildBand(d0: number, d1: number, y: number, tile: number) {
  const parts = SIDES.map((side) =>
    sweep({
      from: 0,
      count: N,
      vScale: tile,
      profile: sideProfile(side, [
        { d: d0, y, u: 0 },
        { d: d1, y, u: (d1 - d0) / tile },
      ]),
      flip: side < 0,
    })
  );
  return merge(parts)!;
}

/** Barrier/fence runs per side. On the pit side the wall stops at the pit exit and resumes after the entry. */
function wallRuns(side: 1 | -1): [number, number][] {
  if (side !== PIT_LANE.side) return [[0, N]];
  const from = PIT_LANE.exitIdx + 10;
  return [[from, (PIT_LANE.entryIdx - 4 - from + N) % N]];
}

function buildWall() {
  const parts: THREE.BufferGeometry[] = [];
  for (const side of SIDES) {
    for (const [from, count] of wallRuns(side)) {
      parts.push(
        sweep({
          from,
          count,
          vScale: 64,
          colorSize: 3,
          profile: sideProfile(side, [
            { d: WALL, y: 0.2, u: 0, col: GREY },
            { d: WALL, y: WALL_LOW, u: 0.1, col: GREY },
            { d: WALL, y: WALL_LOW, u: 0.1, col: WHITE },
            { d: WALL, y: WALL_TOP, u: 0.2, col: WHITE },
          ]),
          flip: side < 0,
        })
      );
    }
  }
  return merge(parts)!;
}

function buildFence() {
  const parts: THREE.BufferGeometry[] = [];
  for (const side of SIDES) {
    for (const [from, count] of wallRuns(side)) {
      parts.push(
        sweep({
          from,
          count,
          vScale: 14,
          profile: sideProfile(side, [
            { d: WALL, y: WALL_TOP, u: 0 },
            { d: WALL, y: FENCE_TOP, u: (FENCE_TOP - WALL_TOP) / 14 },
          ]),
          flip: side < 0,
        })
      );
    }
  }
  return merge(parts)!;
}

// ---- pit lane ----------------------------------------------------------------------------------
const PIT_FROM = PIT_LANE.entryIdx;
const PIT_COUNT = (PIT_LANE.exitIdx - PIT_LANE.entryIdx + N) % N;
const PIT_TAPER = 26;
const pitT = (i: number) => {
  const k = (i - PIT_FROM + N) % N;
  return smoothstep(0, PIT_TAPER, k) * (1 - smoothstep(PIT_COUNT - PIT_TAPER, PIT_COUNT, k));
};
const SIDE = PIT_LANE.side;

function buildPitLane() {
  const hw = PIT_LANE.laneHalfWidth;
  const inner = PIT_LANE.laneOffset - hw;
  const outer = PIT_LANE.laneOffset + hw;
  const profile: SweepPoint[] = [
    { o: (i) => SIDE * (HW + (inner - HW) * pitT(i)), y: 0.07, u: 0 },
    { o: (i) => SIDE * (HW + (outer - HW) * pitT(i)), y: 0.07, u: (2 * hw) / 128 },
  ];
  return sweep({ from: PIT_FROM, count: PIT_COUNT, vScale: 128, profile, flip: SIDE < 0 });
}

function buildPitWall() {
  const from = PIT_FROM + PIT_TAPER;
  const count = PIT_COUNT - 2 * PIT_TAPER;
  const d = PIT_LANE.wallOffset;
  return sweep({
    from,
    count,
    vScale: 64,
    profile: sideProfile(SIDE, [
      { d, y: 0.1, u: 0, col: GREY },
      { d, y: 6, u: 0.1, col: GREY },
      { d, y: 6, u: 0.1, col: WHITE },
      { d, y: 9, u: 0.15, col: WHITE },
    ]),
    flip: SIDE < 0,
  });
}

/** Team-coloured pit boxes (fill + white outline) and the garage building behind the pit lane. */
function buildPit() {
  const fills = new GeoBuilder(3);
  const outlines = new GeoBuilder(3);
  const garages = new GeoBuilder(3);
  const BOXES = 12;
  const boxLat = SIDE * (PIT_LANE.laneOffset + 9);
  const garageLat = SIDE * (PIT_LANE.garageOffset + 34);

  for (let id = 0; id < BOXES; id++) {
    const [x, z, tx, tz, nx, nz] = frameAt(boxIndexFor(id));
    const team = DRIVER_ROSTER[id % DRIVER_ROSTER.length].livery;
    const col = new THREE.Color(team.body);
    const c: RGBA = [col.r, col.g, col.b, 1];

    const cx = x + nx * boxLat;
    const cz = z + nz * boxLat;
    const hl = 24; // half length along the track
    const hwid = 12; // half width
    const P = (a: number, b: number, y: number): [number, number, number] => [cx + tx * a + nx * b, y, cz + tz * a + nz * b];
    fills.quad(P(-hl, -hwid, 0.085), P(hl, -hwid, 0.085), P(hl, hwid, 0.085), P(-hl, hwid, 0.085), [c[0] * 0.55, c[1] * 0.55, c[2] * 0.55, 1]);
    outlines.quad(P(-hl, -hwid, 0.095), P(hl, -hwid, 0.095), P(hl, hwid, 0.095), P(-hl, hwid, 0.095));

    // garage
    const gx = x + nx * garageLat;
    const gz = z + nz * garageLat;
    const yaw = Math.atan2(tx, tz);
    garages.box(gx, 26, gz, 70, 52, 150, yaw, [0.17, 0.19, 0.23, 1]);
    // coloured garage door on the pit-lane face
    const faceX = x + nx * (garageLat - SIDE * 35.4);
    const faceZ = z + nz * (garageLat - SIDE * 35.4);
    garages.box(faceX, 17, faceZ, 1.2, 34, 116, yaw, [c[0], c[1], c[2], 1]);
    // hospitality level and roof slab leaning over the pit lane
    const upX = x + nx * (garageLat - SIDE * 6);
    const upZ = z + nz * (garageLat - SIDE * 6);
    garages.box(upX, 62, upZ, 66, 22, 146, yaw, [0.82, 0.85, 0.88, 1]);
    garages.box(x + nx * (garageLat - SIDE * 14), 75, z + nz * (garageLat - SIDE * 14), 90, 3, 154, yaw, [0.1, 0.11, 0.13, 1]);
  }
  return { fills: fills.build(), outlines: outlines.build(), garages: garages.build() };
}

/** Painted markings: grid boxes, chequered start line, DRS detection / activation lines. */
function buildMarkings() {
  const white = new GeoBuilder(4);
  const dark = new GeoBuilder(4);
  const coloured = new GeoBuilder(4);
  const Y = 0.11;

  const strip = (b: GeoBuilder, idx: number, a0: number, a1: number, o0: number, o1: number, col: RGBA) => {
    const [x, z, tx, tz, nx, nz] = frameAt(idx);
    const P = (a: number, o: number): [number, number, number] => [x + tx * a + nx * o, Y, z + tz * a + nz * o];
    b.quad(P(a0, o0), P(a1, o0), P(a1, o1), P(a0, o1), col);
  };

  // Grid boxes (positions match GameWorld.setup: alternating +-0.42 HW, staggered every 4 indices)
  for (let slot = 0; slot < 12; slot++) {
    const idx = gridSlotIndex(slot);
    const lat = (slot % 2 === 0 ? -1 : 1) * HW * 0.42;
    const L = 46;
    const W = 27;
    const t = 1.1;
    const fwd = 8;
    strip(white, idx, fwd - L / 2, fwd + L / 2, lat - W / 2, lat - W / 2 + t, WHITE);
    strip(white, idx, fwd - L / 2, fwd + L / 2, lat + W / 2 - t, lat + W / 2, WHITE);
    strip(white, idx, fwd - L / 2, fwd - L / 2 + t, lat - W / 2, lat + W / 2, WHITE);
  }

  // Chequered start/finish line
  const cell = 5;
  const cells = Math.floor((2 * HW) / cell);
  for (let r = 0; r < 2; r++) {
    for (let k = 0; k < cells; k++) {
      const isWhite = (k + r) % 2 === 0;
      strip(isWhite ? white : dark, 0, r * cell - cell, r * cell, -HW + k * cell, -HW + (k + 1) * cell, isWhite ? [0.95, 0.95, 0.95, 1] : [0.05, 0.05, 0.06, 1]);
    }
  }

  // DRS detection (blue) and activation (green) lines
  for (const zone of DRS_CONFIG.zones) {
    strip(coloured, drsDetectionIdx(zone), -2, 2, -HW, HW, [0.15, 0.5, 1, 0.9]);
    strip(coloured, zone.start, -2, 2, -HW, HW, [0.1, 0.9, 0.35, 0.9]);
  }
  return { white: white.build(), dark: dark.build(), coloured: coloured.build() };
}

export function Track() {
  const L = useLighting();
  const snow = L.snow;
  const wet = L.wetness;

  const g = useMemo(() => {
    const pit = buildPit();
    const marks = buildMarkings();
    return {
      road: buildRoad(),
      kerbs: buildKerbs(),
      verge: buildBand(HW + KERB_W - 2, VERGE_END, 0.04, 64),
      gravel: buildBand(VERGE_END, WALL - 1, 0.05, 64),
      wall: buildWall(),
      fence: buildFence(),
      pitLane: buildPitLane(),
      pitWall: buildPitWall(),
      pit,
      marks,
    };
  }, []);

  const tex = useMemo(() => {
    const road = getRoadTextures();
    const ground = getGrassPlain(snow).clone();
    ground.repeat.set(200, 200);
    ground.needsUpdate = true;
    return {
      road,
      wetRough: getWetRough(),
      kerb: getKerb(),
      tarmac: getTarmac(),
      grass: getGrassStripes(snow),
      gravel: getGravel(snow),
      fence: getFence(),
      pitBox: getPitBox(),
      ground,
    };
  }, [snow]);

  const roadRough = wet > 0.05 ? tex.wetRough : tex.road.rough;
  const roadTint = new THREE.Color().setScalar(1 - wet * 0.38);
  const pitTint = new THREE.Color().setScalar(1 - wet * 0.3);

  return (
    <group name="track">
      <mesh geometry={g.road} receiveShadow>
        <meshStandardMaterial map={tex.road.map} roughnessMap={roadRough} roughness={1 - wet * 0.55} metalness={0.05} color={roadTint} envMapIntensity={0.4 + wet * 1.2} />
      </mesh>

      {g.kerbs && (
        <mesh geometry={g.kerbs} receiveShadow>
          <meshStandardMaterial map={tex.kerb} roughness={0.6 - wet * 0.25} side={THREE.DoubleSide} />
        </mesh>
      )}

      <mesh geometry={g.verge} receiveShadow>
        <meshStandardMaterial map={tex.grass} roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={g.gravel} receiveShadow>
        <meshStandardMaterial map={tex.gravel} roughness={1} side={THREE.DoubleSide} />
      </mesh>

      <mesh geometry={g.wall} receiveShadow castShadow>
        <meshStandardMaterial vertexColors roughness={0.55} metalness={0.35} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={g.fence}>
        <meshStandardMaterial map={tex.fence} color="#9aa6b3" transparent alphaTest={0.35} side={THREE.DoubleSide} roughness={0.7} metalness={0.4} />
      </mesh>

      {/* pit lane */}
      <mesh geometry={g.pitLane} receiveShadow>
        <meshStandardMaterial map={tex.tarmac.map} roughnessMap={tex.tarmac.rough} roughness={1 - wet * 0.5} color={pitTint} />
      </mesh>
      <mesh geometry={g.pitWall} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={g.pit.fills} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.9} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
      <mesh geometry={g.pit.outlines}>
        <meshBasicMaterial map={tex.pitBox} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-3} />
      </mesh>
      <mesh geometry={g.pit.garages} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.7} metalness={0.2} />
      </mesh>

      {/* painted markings */}
      <mesh geometry={g.marks.white} receiveShadow>
        <meshStandardMaterial vertexColors transparent roughness={0.7} polygonOffset polygonOffsetFactor={-4} />
      </mesh>
      <mesh geometry={g.marks.dark} receiveShadow>
        <meshStandardMaterial vertexColors transparent roughness={0.7} polygonOffset polygonOffsetFactor={-4} />
      </mesh>
      <mesh geometry={g.marks.coloured}>
        <meshBasicMaterial vertexColors transparent depthWrite={false} polygonOffset polygonOffsetFactor={-5} />
      </mesh>

      {/* ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow>
        <planeGeometry args={[36000, 36000]} />
        <meshStandardMaterial map={tex.ground} roughness={1} color={snow ? '#ffffff' : '#9fb08f'} />
      </mesh>
    </group>
  );
}
