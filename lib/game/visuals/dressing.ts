import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { track, type TrackRuntime } from '../track';
import { surfaceHeight } from '../track/surface';
import {
  GeoBuilder,
  getTrackVisuals,
  frameAt,
  maskRuns,
  rng,
  sideProfile,
  sweep,
  wrapIdx,
  type RGBA,
} from './trackData';

const GREY: RGBA = [0.45, 0.47, 0.5, 1];
const DARK_STEEL: RGBA = [0.18, 0.20, 0.24, 1];
const PADDOCK_WHITE: RGBA = [0.88, 0.90, 0.92, 1];
const PADDOCK_GLASS: RGBA = [0.12, 0.18, 0.25, 0.9];

/**
 * Builds brake marker boards (300m / 200m / 100m) before every major braking zone (PLAN-v3 §7 G3).
 * Returns a single merged BufferGeometry.
 */
export function buildBrakeBoards(rt: TrackRuntime = track.current): THREE.BufferGeometry | null {
  const corners = getTrackVisuals().corners;
  const N = rt.N;
  const builder = new GeoBuilder(4); // x, y, z, u, v
  const totalLength = rt.length;

  // For each corner with significant curvature
  for (const c of corners) {
    if (c.peak < 0.02) continue; // Skip very gentle bends

    const startIdx = wrapIdx(c.start);
    const startS = rt.cumulativeS[startIdx];
    const side = (-c.inside) as 1 | -1; // Place on the outside of approaching straight

    // 300m, 200m, 100m before the corner start (10 units = 1 m)
    const distances = [3000, 2000, 1000];
    const uvCells = [0, 1, 2]; // 300, 200, 100 in getBrakeBoards atlas

    distances.forEach((dist, dIdx) => {
      let targetS = startS - dist;
      if (targetS < 0) targetS += totalLength;

      // Find spline index matching targetS
      let idx = 0;
      for (let i = 0; i < N; i++) {
        if (rt.cumulativeS[i] >= targetS) {
          idx = i;
          break;
        }
      }

      const hw = rt.halfWidth[idx];
      const lat = side * (hw + 18);
      const [cx, cz, tx, tz, nx, nz] = frameAt(idx);
      const groundY = surfaceHeight(idx, lat);

      const boardW = 10; // 1.0 m wide
      const boardH = 15; // 1.5 m high
      const baseOff = 2.5; // 0.25 m above ground

      // Board face normal along tangent (facing oncoming cars)
      const u0 = uvCells[dIdx] / 3;
      const u1 = (uvCells[dIdx] + 1) / 3;

      const p0: [number, number, number] = [
        cx + nx * (lat - side * (boardW / 2)),
        groundY + baseOff,
        cz + nz * (lat - side * (boardW / 2)),
      ];
      const p1: [number, number, number] = [
        cx + nx * (lat + side * (boardW / 2)),
        groundY + baseOff,
        cz + nz * (lat + side * (boardW / 2)),
      ];
      const p2: [number, number, number] = [
        cx + nx * (lat + side * (boardW / 2)),
        groundY + baseOff + boardH,
        cz + nz * (lat + side * (boardW / 2)),
      ];
      const p3: [number, number, number] = [
        cx + nx * (lat - side * (boardW / 2)),
        groundY + baseOff + boardH,
        cz + nz * (lat - side * (boardW / 2)),
      ];

      builder.quad(p0, p1, p2, p3, [1, 1, 1, 1], [u0, 0, u1, 1]);

      // Metal mounting post
      const postX = cx + nx * lat;
      const postZ = cz + nz * lat;
      const yaw = Math.atan2(tx, tz);
      builder.box(postX, groundY + (baseOff + boardH) / 2, postZ, 0.8, baseOff + boardH, 0.8, yaw, DARK_STEEL);
    });
  }

  return builder.build();
}

/**
 * Builds tyre wall barriers (TecPro style) on corner outsides (PLAN-v3 §7 G3).
 */
export function buildTyreWalls(rt: TrackRuntime = track.current): THREE.BufferGeometry | null {
  const { kerbOutside } = getTrackVisuals();
  const parts: THREE.BufferGeometry[] = [];

  for (const side of [-1, 1] as const) {
    const mask = kerbOutside[side > 0 ? 1 : 0];
    for (const [from, count] of maskRuns(mask, 0.4, 4)) {
      // Barrier sits along the run-off perimeter just inside the wall
      parts.push(
        sweep({
          from,
          count,
          vScale: 64,
          profile: sideProfile(side, [
            { d: (i) => rt.halfWidth[i] + 74, y: 0.1, u: 0 },
            { d: (i) => rt.halfWidth[i] + 74, y: 12, u: 0.5 },
            { d: (i) => rt.halfWidth[i] + 81, y: 12, u: 0.7 },
            { d: (i) => rt.halfWidth[i] + 81, y: 0.1, u: 1.0 },
          ]),
          flip: side < 0,
        })
      );
    }
  }

  return parts.length === 0 ? null : parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
}

/**
 * Builds sponsor billboard banners along barriers and run-offs (PLAN-v3 §7 G3).
 */
export function buildSponsorBoards(rt: TrackRuntime = track.current): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  const N = rt.N;
  const PIT_LANE = rt.pit;

  // Main straight sponsor run (opposite pit lane)
  const oppPitSide = (-PIT_LANE.side) as 1 | -1;
  const startIdx = wrapIdx(PIT_LANE.boxStartIdx - 30);
  const count = wrapIdx(PIT_LANE.boxEndIdx + 30 - startIdx);

  if (count > 20) {
    parts.push(
      sweep({
        from: startIdx,
        count,
        vScale: 80, // Tiling across the 8 sponsor brands in getSponsorAtlas()
        profile: sideProfile(oppPitSide, [
          { d: (i) => rt.halfWidth[i] + 81.8, y: 2.0, u: 1 },
          { d: (i) => rt.halfWidth[i] + 81.8, y: 18.0, u: 0 },
        ]),
        flip: oppPitSide < 0,
      })
    );
  }

  // Also add sponsor boards on major corner outsides
  const { kerbOutside } = getTrackVisuals();
  for (const side of [-1, 1] as const) {
    const mask = kerbOutside[side > 0 ? 1 : 0];
    for (const [from, runCount] of maskRuns(mask, 0.5, 6)) {
      parts.push(
        sweep({
          from,
          count: runCount,
          vScale: 80,
          profile: sideProfile(side, [
            { d: (i) => rt.halfWidth[i] + 81.8, y: 2.5, u: 1 },
            { d: (i) => rt.halfWidth[i] + 81.8, y: 18.5, u: 0 },
          ]),
          flip: side < 0,
        })
      );
    }
  }

  return parts.length === 0 ? null : parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
}

export interface MarshalPostData {
  posts: THREE.BufferGeometry | null;
  lightPanels: THREE.BufferGeometry | null;
}

/**
 * Builds marshal observation posts and FIA digital LED light panels every ~300m (PLAN-v3 §7 G3).
 */
export function buildMarshalPosts(rt: TrackRuntime = track.current): MarshalPostData {
  const N = rt.N;
  const postBuilder = new GeoBuilder(3);
  const panelBuilder = new GeoBuilder(3);

  // Spacing ~300 m (~3000 world units)
  const stepIdx = Math.max(16, Math.round(N / (rt.length / 3000)));

  for (let i = 0; i < N; i += stepIdx) {
    // Alternate sides where possible, avoiding pit lane
    let side: 1 | -1 = (Math.floor(i / stepIdx) % 2 === 0 ? 1 : -1) as 1 | -1;
    if (side === rt.pit.side && i >= rt.pit.entryIdx - 20 && i <= rt.pit.exitIdx + 20) {
      side = (-rt.pit.side) as 1 | -1;
    }

    const hw = rt.halfWidth[i];
    const lat = side * (hw + 90);
    const [cx, cz, tx, tz] = frameAt(i);
    const groundY = surfaceHeight(i, lat);
    const yaw = Math.atan2(tx, tz);

    // Marshal cabin platform (elevated 1.4 m)
    const platY = groundY + 14;
    // 4 legs
    postBuilder.box(cx - 3, groundY + 7, cz - 3, 0.8, 14, 0.8, yaw, DARK_STEEL);
    postBuilder.box(cx + 3, groundY + 7, cz - 3, 0.8, 14, 0.8, yaw, DARK_STEEL);
    postBuilder.box(cx - 3, groundY + 7, cz + 3, 0.8, 14, 0.8, yaw, DARK_STEEL);
    postBuilder.box(cx + 3, groundY + 7, cz + 3, 0.8, 14, 0.8, yaw, DARK_STEEL);

    // Platform floor
    postBuilder.box(cx, platY, cz, 16, 1.2, 16, yaw, [0.4, 0.42, 0.45, 1]);

    // Safety railings
    postBuilder.box(cx, platY + 6, cz + 7.5, 15, 11, 0.8, yaw, GREY);
    postBuilder.box(cx, platY + 6, cz - 7.5, 15, 11, 0.8, yaw, GREY);
    postBuilder.box(cx - 7.5, platY + 6, cz, 0.8, 11, 15, yaw, GREY);

    // Roof canopy
    postBuilder.box(cx, platY + 22, cz, 20, 1.0, 20, yaw, [0.2, 0.45, 0.75, 1]); // Blue marshal roof

    // Digital LED light panel on the track-facing side of the post
    const panelLat = side * (hw + 83);
    const [px, pz] = [cx - tx * 4, cz - tz * 4];
    const panelY = groundY + 16;
    panelBuilder.box(px, panelY, pz, 1.2, 8, 14, yaw, [0.05, 0.05, 0.05, 1]); // Panel housing
    // Active LED screen surface (green racing status by default)
    panelBuilder.box(px - tx * 0.7, panelY, pz - tz * 0.7, 0.4, 7, 12.5, yaw, [0.1, 0.9, 0.2, 1]);
  }

  return {
    posts: postBuilder.build(),
    lightPanels: panelBuilder.build(),
  };
}

/**
 * Generates cross-billboard tree geometry (two intersecting quads) and instanced transforms.
 */
export function buildTreeSystem(rt: TrackRuntime = track.current, density = 1.0) {
  // Cross-billboard geometry: two intersecting vertical planes (28 units wide, 42 units high = 2.8m x 4.2m)
  const W = 28;
  const H = 42;

  const q1 = new THREE.PlaneGeometry(W, H);
  q1.translate(0, H / 2, 0);

  const q2 = new THREE.PlaneGeometry(W, H);
  q2.rotateY(Math.PI / 2);
  q2.translate(0, H / 2, 0);

  const crossGeo = mergeGeometries([q1, q2], false);

  // Instance transforms distributed around the circuit
  const rand = rng(55);
  const matrices: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();
  const N = rt.N;

  // Place trees along track periphery outside the barriers
  for (let i = 0; i < N; i += 6) {
    if (rand() > density * 0.75) continue;

    for (const side of [-1, 1] as const) {
      // Avoid pit lane inner side
      if (side === rt.pit.side && i >= rt.pit.entryIdx - 20 && i <= rt.pit.exitIdx + 20) continue;

      const hw = rt.halfWidth[i];
      // Trees sit well outside the wall (120 to 500 units away)
      const dist = hw + 120 + rand() * 320;
      const [x, z] = frameAt(i);
      const [cx, cz, tx, tz, nx, nz] = frameAt(i);
      const treeX = cx + nx * (side * dist) + (rand() - 0.5) * 40;
      const treeZ = cz + nz * (side * dist) + (rand() - 0.5) * 40;
      const groundY = surfaceHeight(i, side * dist);

      const scale = 0.85 + rand() * 0.45;
      dummy.position.set(treeX, groundY, treeZ);
      dummy.rotation.set(0, rand() * Math.PI * 2, 0);
      dummy.scale.set(scale, scale * (0.95 + rand() * 0.2), scale);
      dummy.updateMatrix();

      matrices.push(dummy.matrix.clone());
    }
  }

  return { geometry: crossGeo, matrices };
}

/**
 * Builds paddock buildings & team hospitality motorhomes behind the pit garages (PLAN-v3 §7 G3).
 */
export function buildPaddockBuildings(rt: TrackRuntime = track.current): THREE.BufferGeometry | null {
  const PIT_LANE = rt.pit;
  const SIDE = PIT_LANE.side;
  const builder = new GeoBuilder(3);
  const N = rt.N;

  const startIdx = PIT_LANE.boxStartIdx;
  const endIdx = PIT_LANE.boxEndIdx;
  const span = wrapIdx(endIdx - startIdx);
  const suites = 8;
  const step = Math.floor(span / suites);

  for (let s = 0; s < suites; s++) {
    const idx = wrapIdx(startIdx + s * step);
    const [cx, cz, tx, tz, nx, nz] = frameAt(idx);
    const lat = SIDE * (PIT_LANE.garageOffset + 120); // Behind the garages
    const groundY = surfaceHeight(idx, lat);
    const yaw = Math.atan2(tx, tz);

    const bX = cx + nx * lat;
    const bZ = cz + nz * lat;

    // Team hospitality building (2 levels)
    // Level 1: Sleek white composite
    builder.box(bX, groundY + 16, bZ, 75, 32, 90, yaw, PADDOCK_WHITE);
    // Level 2: Glass pavilion with roof terrace
    builder.box(bX, groundY + 42, bZ, 65, 20, 80, yaw, PADDOCK_GLASS);
    // Terrace overhang
    builder.box(bX, groundY + 54, bZ, 72, 3, 86, yaw, DARK_STEEL);
  }

  return builder.build();
}
