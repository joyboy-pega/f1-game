'use client';

import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DRIVER_ROSTER } from '@/lib/game/constants';
import { track } from '@/lib/game/track';
import { surfaceHeight } from '@/lib/game/track/surface';
import { gridSlotIndex } from '@/lib/game/sim/race';
import { boxIndexFor } from '@/lib/game/sim/pit';
import { getRacingLine } from '@/lib/game/sim/racingLine';
import { useLighting } from '@/lib/game/visuals/lighting';
import { Terrain } from './Terrain';
import {
  getFence,
  getGrassPlain,
  getGrassStripes,
  getGravel,
  getKerb,
  getPitBox,
  getRoadTextures,
  getRunoffStripes,
  getTarmac,
  getWetRough,
} from '@/lib/game/visuals/textures';
import {
  GeoBuilder,
  ev,
  frameAt,
  getTrackVisuals,
  maskRuns,
  sideIdx,
  sideProfile,
  smoothstep,
  sweep,
  type Fn,
  type RGBA,
  type SweepPoint,
} from '@/lib/game/visuals/trackData';

// Distances from the centreline (world units). They mirror the physics bands in lib/game/physics.ts:
// asphalt < halfWidth+6, soft verge to halfWidth+40, gravel beyond, solid wall at halfWidth+82.
const KERB_W = 14;
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
  const rt = track.current;
  const N = rt.N;
  const rl = getRacingLine();
  const offsets = rl.offset;

  const rubberCol = (oVal: (i: number) => number) => {
    return (i: number): RGBA => {
      const o = oVal(i);
      const lineO = offsets[i] ?? 0;
      const d = Math.abs(o - lineO);
      // Darkens the groove where tyres lay down rubber (PLAN-v3 §7 G2)
      const t = Math.min(1, d / 18);
      const k = 0.68 + 0.32 * t;
      return [k, k, k, 1];
    };
  };

  return sweep({
    from: 0,
    count: N,
    vScale: 512,
    profile: [
      { o: (i) => -rt.halfWidth[i], y: 0.08, u: 0, col: rubberCol((i) => -rt.halfWidth[i]) },
      { o: (i) => -rt.halfWidth[i] * 0.5, y: 0.08, u: 0.25, col: rubberCol((i) => -rt.halfWidth[i] * 0.5) },
      { o: (i) => 0, y: 0.08, u: 0.5, col: rubberCol(() => 0) },
      { o: (i) => rt.halfWidth[i] * 0.5, y: 0.08, u: 0.75, col: rubberCol((i) => rt.halfWidth[i] * 0.5) },
      { o: (i) => rt.halfWidth[i], y: 0.08, u: 1, col: rubberCol((i) => rt.halfWidth[i]) },
    ],
  });
}

/** Painted asphalt run-off areas with deceleration stripes outside high-speed corners (PLAN-v3 §7 G2). */
function buildRunoff() {
  const rt = track.current;
  const parts: THREE.BufferGeometry[] = [];
  const { runoffOutside } = getTrackVisuals();

  for (const side of SIDES) {
    const mask = runoffOutside[sideIdx(side)];
    for (const [from, count] of maskRuns(mask, 0.35, 4)) {
      parts.push(
        sweep({
          from,
          count,
          vScale: 48,
          profile: sideProfile(side, [
            { d: (i) => rt.halfWidth[i] + KERB_W, y: 0.06, u: 0 },
            { d: (i) => rt.halfWidth[i] + 48, y: 0.05, u: 1 },
          ]),
          flip: side < 0,
        })
      );
    }
  }
  return merge(parts);
}

function buildKerbs() {
  const rt = track.current;
  const parts: THREE.BufferGeometry[] = [];
  const add = (side: 1 | -1, mask: Float32Array) => {
    for (const [from, count] of maskRuns(mask, 0.5, 3)) {
      parts.push(
        sweep({
          from,
          count,
          vScale: 40,
          profile: sideProfile(side, [
            { d: (i) => rt.halfWidth[i], y: 0.09, u: 0 },
            { d: (i) => rt.halfWidth[i] + 1.5, y: 0.19, u: 0.12 },
            { d: (i) => rt.halfWidth[i] + KERB_W - 3, y: 0.17, u: 0.8 },
            { d: (i) => rt.halfWidth[i] + KERB_W, y: 0.06, u: 1 },
          ]),
          flip: side < 0,
        })
      );
    }
  };
  for (const side of SIDES) {
    const { kerbInside, kerbOutside } = getTrackVisuals();
    add(side, kerbInside[sideIdx(side)]);
    add(side, kerbOutside[sideIdx(side)]);
  }
  return merge(parts);
}

function buildBand(d0: Fn, d1: Fn, y: number, tile: number) {
  const N = track.current.N;
  const parts = SIDES.map((side) =>
    sweep({
      from: 0,
      count: N,
      vScale: tile,
      profile: sideProfile(side, [
        { d: d0, y, u: 0 },
        { d: d1, y, u: (i) => (ev(d1, i) - ev(d0, i)) / tile },
      ]),
      flip: side < 0,
    })
  );
  return merge(parts)!;
}

/** Barrier/fence runs per side. On the pit side the wall stops at the pit exit and resumes after the entry. */
function wallRuns(side: 1 | -1): [number, number][] {
  const { N, pit: PIT_LANE } = track.current;
  if (side !== PIT_LANE.side) return [[0, N]];
  const from = PIT_LANE.exitIdx + 10;
  return [[from, (PIT_LANE.entryIdx - 4 - from + N) % N]];
}

function buildWall() {
  const rt = track.current;
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
            { d: (i) => rt.halfWidth[i] + 82, y: 0.2, u: 0, col: GREY },
            { d: (i) => rt.halfWidth[i] + 82, y: WALL_LOW, u: 0.1, col: GREY },
            { d: (i) => rt.halfWidth[i] + 82, y: WALL_LOW, u: 0.1, col: WHITE },
            { d: (i) => rt.halfWidth[i] + 82, y: WALL_TOP, u: 0.2, col: WHITE },
          ]),
          flip: side < 0,
        })
      );
    }
  }
  return merge(parts)!;
}

function buildFence() {
  const rt = track.current;
  const parts: THREE.BufferGeometry[] = [];
  for (const side of SIDES) {
    for (const [from, count] of wallRuns(side)) {
      parts.push(
        sweep({
          from,
          count,
          vScale: 14,
          profile: sideProfile(side, [
            { d: (i) => rt.halfWidth[i] + 82, y: WALL_TOP, u: 0 },
            { d: (i) => rt.halfWidth[i] + 82, y: FENCE_TOP, u: (FENCE_TOP - WALL_TOP) / 14 },
          ]),
          flip: side < 0,
        })
      );
    }
  }
  return merge(parts)!;
}

// ---- pit lane ----------------------------------------------------------------------------------
const PIT_TAPER = 26;
/** 0..1 blend of the pit lane's lateral offset along the entry..exit stretch (tapers in and out). */
const pitT = (i: number) => {
  const { N, pit } = track.current;
  const pitCount = (pit.exitIdx - pit.entryIdx + N) % N;
  const k = (i - pit.entryIdx + N) % N;
  return smoothstep(0, PIT_TAPER, k) * (1 - smoothstep(pitCount - PIT_TAPER, pitCount, k));
};

function buildPitLane() {
  const rt = track.current;
  const PIT_LANE = rt.pit;
  const SIDE = PIT_LANE.side;
  const hw = PIT_LANE.laneHalfWidth;
  const inner = PIT_LANE.laneOffset - hw;
  const outer = PIT_LANE.laneOffset + hw;
  const profile: SweepPoint[] = [
    { o: (i) => SIDE * (rt.halfWidth[i] + (inner - rt.halfWidth[i]) * pitT(i)), y: 0.07, u: 0 },
    { o: (i) => SIDE * (rt.halfWidth[i] + (outer - rt.halfWidth[i]) * pitT(i)), y: 0.07, u: (2 * hw) / 128 },
  ];
  const N = rt.N;
  return sweep({ from: PIT_LANE.entryIdx, count: (PIT_LANE.exitIdx - PIT_LANE.entryIdx + N) % N, vScale: 128, profile, flip: SIDE < 0 });
}

function buildPitWall() {
  const PIT_LANE = track.current.pit;
  const SIDE = PIT_LANE.side;
  const N = track.current.N;
  const pitCount = (PIT_LANE.exitIdx - PIT_LANE.entryIdx + N) % N;
  const from = PIT_LANE.entryIdx + PIT_TAPER;
  const count = pitCount - 2 * PIT_TAPER;
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
  const PIT_LANE = track.current.pit;
  const SIDE = PIT_LANE.side;
  const fills = new GeoBuilder(3);
  const outlines = new GeoBuilder(3);
  const garages = new GeoBuilder(3);
  const BOXES = 12;
  const boxLat = SIDE * (PIT_LANE.laneOffset + 9);
  const garageLat = SIDE * (PIT_LANE.garageOffset + 34);

  for (let id = 0; id < BOXES; id++) {
    const idx = boxIndexFor(id);
    const [x, z, tx, tz, nx, nz] = frameAt(idx);
    const team = DRIVER_ROSTER[id % DRIVER_ROSTER.length].livery;
    const col = new THREE.Color(team.body);
    const c: RGBA = [col.r, col.g, col.b, 1];

    const cx = x + nx * boxLat;
    const cz = z + nz * boxLat;
    const baseY = surfaceHeight(idx, boxLat);
    const hl = 30; // half length along the track (6.0 m for 5.6 m car)
    const hwid = 14; // half width (2.8 m for 2.0 m car)
    const P = (a: number, b: number, y: number): [number, number, number] => [cx + tx * a + nx * b, y, cz + tz * a + nz * b];
    fills.quad(P(-hl, -hwid, baseY + 0.085), P(hl, -hwid, baseY + 0.085), P(hl, hwid, baseY + 0.085), P(-hl, hwid, baseY + 0.085), [c[0] * 0.55, c[1] * 0.55, c[2] * 0.55, 1]);
    outlines.quad(P(-hl, -hwid, baseY + 0.095), P(hl, -hwid, baseY + 0.095), P(hl, hwid, baseY + 0.095), P(-hl, hwid, baseY + 0.095));

    // garage
    const gx = x + nx * garageLat;
    const gz = z + nz * garageLat;
    const gy = surfaceHeight(idx, garageLat);
    const yaw = Math.atan2(tx, tz);
    garages.box(gx, gy + 26, gz, 70, 52, 150, yaw, [0.17, 0.19, 0.23, 1]);
    // coloured garage door on the pit-lane face
    const doorLat = garageLat - SIDE * 35.4;
    const faceX = x + nx * doorLat;
    const faceZ = z + nz * doorLat;
    const dy = surfaceHeight(idx, doorLat);
    garages.box(faceX, dy + 17, faceZ, 1.2, 34, 116, yaw, [c[0], c[1], c[2], 1]);
    // hospitality level and roof slab leaning over the pit lane
    const hospLat = garageLat - SIDE * 6;
    const upX = x + nx * hospLat;
    const upZ = z + nz * hospLat;
    const hy = surfaceHeight(idx, hospLat);
    garages.box(upX, hy + 62, upZ, 66, 22, 146, yaw, [0.82, 0.85, 0.88, 1]);
    const roofLat = garageLat - SIDE * 14;
    const ry = surfaceHeight(idx, roofLat);
    garages.box(x + nx * roofLat, ry + 75, z + nz * roofLat, 90, 3, 154, yaw, [0.1, 0.11, 0.13, 1]);
  }
  return { fills: fills.build(), outlines: outlines.build(), garages: garages.build() };
}

/** Painted markings: grid boxes, chequered start line, DRS detection / activation lines. */
function buildMarkings() {
  const rt = track.current;
  const white = new GeoBuilder(4);
  const dark = new GeoBuilder(4);
  const coloured = new GeoBuilder(4);

  const strip = (b: GeoBuilder, idx: number, a0: number, a1: number, o0: number, o1: number, col: RGBA) => {
    const [x, z, tx, tz, nx, nz] = frameAt(idx);
    const y0 = surfaceHeight(idx, o0) + 0.11;
    const y1 = surfaceHeight(idx, o1) + 0.11;
    const P = (a: number, o: number, y: number): [number, number, number] => [x + tx * a + nx * o, y, z + tz * a + nz * o];
    b.quad(P(a0, o0, y0), P(a1, o0, y0), P(a1, o1, y1), P(a0, o1, y1), col);
  };

  // Grid boxes (positions match GameWorld.setup: alternating +-0.42 halfWidth, staggered every 4 indices)
  for (let slot = 0; slot < 12; slot++) {
    const idx = gridSlotIndex(slot);
    const hw = rt.halfWidth[idx];
    const lat = (slot % 2 === 0 ? -1 : 1) * hw * 0.42;
    const L = 58;
    const W = 28;
    const t = 1.2;
    const fwd = 10;
    strip(white, idx, fwd - L / 2, fwd + L / 2, lat - W / 2, lat - W / 2 + t, WHITE);
    strip(white, idx, fwd - L / 2, fwd + L / 2, lat + W / 2 - t, lat + W / 2, WHITE);
    strip(white, idx, fwd - L / 2, fwd - L / 2 + t, lat - W / 2, lat + W / 2, WHITE);
  }

  // Chequered start/finish line
  const hw0 = rt.halfWidth[0];
  const cell = 5;
  const cells = Math.floor((2 * hw0) / cell);
  for (let r = 0; r < 2; r++) {
    for (let k = 0; k < cells; k++) {
      const isWhite = (k + r) % 2 === 0;
      strip(isWhite ? white : dark, 0, r * cell - cell, r * cell, -hw0 + k * cell, -hw0 + (k + 1) * cell, isWhite ? [0.95, 0.95, 0.95, 1] : [0.05, 0.05, 0.06, 1]);
    }
  }

  // DRS detection (blue) and activation (green) lines
  for (const zone of rt.drs) {
    const hwDetect = rt.halfWidth[zone.detectIdx];
    strip(coloured, zone.detectIdx, -2, 2, -hwDetect, hwDetect, [0.15, 0.5, 1, 0.9]);
    const hwStart = rt.halfWidth[zone.start];
    strip(coloured, zone.start, -2, 2, -hwStart, hwStart, [0.1, 0.9, 0.35, 0.9]);
  }
  return { white: white.build(), dark: dark.build(), coloured: coloured.build() };
}

export function Track() {
  const L = useLighting();
  const snow = L.snow;
  const wet = L.wetness;
  const trackId = track.current.meta.id;

  const g = useMemo(() => {
    const pit = buildPit();
    const marks = buildMarkings();
    return {
      road: buildRoad(),
      runoff: buildRunoff(),
      kerbs: buildKerbs(),
      verge: buildBand((i) => track.current.halfWidth[i] + KERB_W - 2, (i) => track.current.halfWidth[i] + 40, 0.04, 64),
      gravel: buildBand((i) => track.current.halfWidth[i] + 40, (i) => track.current.halfWidth[i] + 81, 0.05, 64),
      wall: buildWall(),
      fence: buildFence(),
      pitLane: buildPitLane(),
      pitWall: buildPitWall(),
      pit,
      marks,
    };
  }, [trackId]);

  useEffect(() => {
    return () => {
      g.road?.dispose();
      g.runoff?.dispose();
      g.kerbs?.dispose();
      g.verge?.dispose();
      g.gravel?.dispose();
      g.wall?.dispose();
      g.fence?.dispose();
      g.pitLane?.dispose();
      g.pitWall?.dispose();
      g.pit?.fills?.dispose();
      g.pit?.outlines?.dispose();
      g.pit?.garages?.dispose();
      g.marks?.white?.dispose();
      g.marks?.dark?.dispose();
      g.marks?.coloured?.dispose();
    };
  }, [g]);

  const tex = useMemo(() => {
    const road = getRoadTextures(snow);
    const runoff = getRunoffStripes(snow);
    const ground = getGrassPlain(snow).clone();
    ground.repeat.set(200, 200);
    ground.needsUpdate = true;
    return {
      road,
      runoff,
      wetRough: getWetRough(),
      kerb: getKerb(snow),
      tarmac: getTarmac(),
      grass: getGrassStripes(snow),
      gravel: getGravel(snow),
      fence: getFence(),
      pitBox: getPitBox(),
      ground,
    };
  }, [snow]);

  const roadRough = wet > 0.05 ? tex.wetRough : tex.road.rough;
  const roadTint = snow
    ? new THREE.Color(0.92, 0.95, 1.0)
    : new THREE.Color().setScalar(1 - wet * 0.42);
  const pitTint = snow
    ? new THREE.Color(0.88, 0.92, 0.98)
    : new THREE.Color().setScalar(1 - wet * 0.28);

  return (
    <group name="track">
      <mesh geometry={g.road} receiveShadow>
        <meshStandardMaterial
          vertexColors
          map={tex.road.map}
          roughnessMap={roadRough}
          roughness={Math.max(0.12, 0.92 - wet * 0.78)}
          metalness={0.06 + wet * 0.32}
          color={roadTint}
          envMapIntensity={0.4 + wet * 2.6}
        />
      </mesh>

      {/* Painted asphalt run-off with deceleration stripes (PLAN-v3 §7 G2) */}
      {g.runoff && (
        <mesh geometry={g.runoff} receiveShadow>
          <meshStandardMaterial
            map={tex.runoff.map}
            roughnessMap={tex.runoff.rough}
            roughness={0.92}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {g.kerbs && (
        <mesh geometry={g.kerbs} receiveShadow>
          <meshStandardMaterial
            map={tex.kerb}
            roughness={snow ? 0.75 : Math.max(0.18, 0.6 - wet * 0.4)}
            metalness={wet > 0.5 ? 0.18 : 0}
            side={THREE.DoubleSide}
          />
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

      {/* G1 terrain: chunked procedural heightfield with flattened corridor + distant mountain ring */}
      <Terrain />
    </group>
  );
}
