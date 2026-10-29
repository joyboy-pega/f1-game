import * as THREE from 'three';
import { track, type TrackRuntime } from '../track';
import { getTrackVisuals } from './trackData';

/**
 * Procedural Value Noise and FBM for realistic terrain heightfields (PLAN-v3 §7 G1).
 * Fast, continuous, deterministic, zero allocation during sampling.
 */
function hash(x: number, z: number): number {
  const sin = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return sin - Math.floor(sin);
}

function vnoise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3.0 - 2.0 * fx);
  const uz = fz * fz * (3.0 - 2.0 * fz);

  const h00 = hash(ix, iz);
  const h10 = hash(ix + 1, iz);
  const h01 = hash(ix, iz + 1);
  const h11 = hash(ix + 1, iz + 1);

  const nx0 = h00 + (h10 - h00) * ux;
  const nx1 = h01 + (h11 - h01) * ux;
  return nx0 + (nx1 - nx0) * uz;
}

function fbm(x: number, z: number): number {
  let total = 0;
  let amp = 0.5;
  let freq = 1.0;
  for (let i = 0; i < 4; i++) {
    total += amp * vnoise(x * freq, z * freq);
    freq *= 2.02;
    amp *= 0.5;
  }
  return total;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export interface TerrainSampler {
  sample(x: number, z: number): { height: number; dist: number; nearestIdx: number };
}

/**
 * Creates a spatial sampler for terrain height.
 * - Enforces a flattened corridor 0.3 m (3.0 units) below the lowest road edge nearby.
 * - Smoothly blends into procedural rolling terrain beyond the walls.
 * - Rises into distant natural ridges on the outer periphery.
 *
 * `reach` is the terrain mesh's cell diagonal. The mesh is only this sampler's values at its
 * vertices, linearly interpolated across triangles ~35-40 m wide, so a road point can lie inside a
 * triangle whose vertices are up to `reach` away. Every such vertex must therefore be (a) inside
 * the flattened zone and (b) below every road edge within `reach` of it — covering grade, camber
 * (the low edge of a banked road is below the centreline) and crossovers (Suzuka's bridge). With
 * only the old nearest-sample, vertex-local rule, grass rose through the asphalt on 2-8% of road
 * points on every circuit (up to +23 m under Suzuka's crossover).
 */
export function createTerrainSampler(rt: TrackRuntime = track.current, reach = 0): TerrainSampler {
  const N = rt.N;
  const CELL = 500;
  const WALL = 82; // wall sits at halfWidth + 82 units; the verge ribbon runs out to it
  // Lowest point of each cross-section out to the walls (camber tilts one edge down).
  const edgeLow = new Float32Array(N);
  for (let i = 0; i < N; i++) edgeLow[i] = rt.pz[i] - Math.abs(rt.camber?.[i] ?? 0) * (rt.halfWidth[i] + WALL);
  const searchCells = Math.max(3, Math.ceil((reach + 400) / CELL) + 1);
  const grid = new Map<string, number[]>();

  // Build spatial lookup for centerline samples
  for (let i = 0; i < N; i += 2) {
    const key = `${Math.floor(rt.px[i] / CELL)},${Math.floor(rt.py[i] / CELL)}`;
    const a = grid.get(key);
    if (a) a.push(i);
    else grid.set(key, [i]);
  }

  const { minX, maxX, minY, maxY } = rt.bounds;
  const cx = (minX + maxX) / 2;
  const cz = (minY + maxY) / 2;
  const maxRadius = Math.max(maxX - minX, maxY - minY) * 0.75 + 10000;

  return {
    sample(x: number, z: number) {
      const cellX = Math.floor(x / CELL);
      const cellZ = Math.floor(z / CELL);

      let bestDist = 1e9;
      let bestIdx = 0;

      for (let dx = -searchCells; dx <= searchCells; dx++) {
        for (let dz = -searchCells; dz <= searchCells; dz++) {
          const arr = grid.get(`${cellX + dx},${cellZ + dz}`);
          if (!arr) continue;
          for (const i of arr) {
            const d = Math.hypot(rt.px[i] - x, rt.py[i] - z);
            if (d < bestDist) {
              bestDist = d;
              bestIdx = i;
            }
          }
        }
      }

      const roadH = rt.pz[bestIdx];
      const hw = rt.halfWidth[bestIdx];
      const wallDist = hw + WALL;
      const flatDist = wallDist + reach;

      // Corridor height: 0.3 m (3.0 units) under the lowest road edge any triangle through this
      // vertex could span (see the doc comment). Only computed near the road.
      let corridorH = roadH - 3.0;
      if (bestDist <= flatDist + 380) {
        let low = edgeLow[bestIdx];
        for (let dx = -searchCells; dx <= searchCells; dx++) {
          for (let dz = -searchCells; dz <= searchCells; dz++) {
            const arr = grid.get(`${cellX + dx},${cellZ + dz}`);
            if (!arr) continue;
            for (const i of arr) {
              if (edgeLow[i] >= low) continue;
              if (Math.hypot(rt.px[i] - x, rt.py[i] - z) <= reach + rt.halfWidth[i] + WALL) low = edgeLow[i];
            }
          }
        }
        corridorH = low - 3.0;
      }

      // Natural landscape elevation
      // Broad rolling hills (~1 km wavelength) + medium swells (~300 m wavelength)
      const broad = (fbm(x * 0.00006, z * 0.00006) - 0.5) * 160.0;
      const detail = (vnoise(x * 0.0002, z * 0.0002) - 0.5) * 45.0;

      // Distant ridge elevation rising near outer perimeter
      const distFromCenter = Math.hypot(x - cx, z - cz);
      const ridgeFactor = smoothstep(maxRadius * 0.55, maxRadius * 1.1, distFromCenter);
      const ridgeNoise = fbm(x * 0.00012 + 10, z * 0.00012 + 10);
      const ridgeH = ridgeFactor * (180.0 + ridgeNoise * 260.0);

      const naturalH = roadH + broad + detail + ridgeH;

      // Flat out to flatDist (wall + one mesh cell), then a smooth cubic blend to natural landscape.
      if (bestDist <= flatDist) {
        return { height: corridorH, dist: bestDist, nearestIdx: bestIdx };
      }

      const blendEnd = flatDist + 380;
      if (bestDist >= blendEnd) {
        return { height: naturalH, dist: bestDist, nearestIdx: bestIdx };
      }

      const t = smoothstep(flatDist, blendEnd, bestDist);
      const h = corridorH * (1 - t) + naturalH * t;
      return { height: h, dist: bestDist, nearestIdx: bestIdx };
    },
  };
}

export interface TerrainChunkData {
  geometry: THREE.BufferGeometry;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface TerrainData {
  chunks: TerrainChunkData[];
  mountainRing: THREE.BufferGeometry;
}

/**
 * Builds 4 quadrant terrain chunks + 1 distant mountain horizon ring (PLAN-v3 §7 G1).
 * Total draw calls: 5 (<= 6 draws budget).
 * Total triangles: ~29k (<= 150k tris budget).
 */
export function buildTerrain(rt: TrackRuntime = track.current, snow = false): TerrainData {
  const bounds = getTrackVisuals().bounds;

  // Margin around track: 15,000 world units = 1.5 km
  const MARGIN = 15000;
  const x0 = bounds.minX - MARGIN;
  const x1 = bounds.maxX + MARGIN;
  const z0 = bounds.minZ - MARGIN;
  const z1 = bounds.maxZ + MARGIN;
  const midX = (x0 + x1) / 2;
  const midZ = (z0 + z1) / 2;

  // 4 quadrant regions [minX, maxX, minZ, maxZ]
  const quadrants: [number, number, number, number][] = [
    [x0, midX, z0, midZ], // SW
    [midX, x1, z0, midZ], // SE
    [x0, midX, midZ, z1], // NW
    [midX, x1, midZ, z1], // NE
  ];

  // Grid resolution per quadrant: 60x60 quads = 61x61 vertices (3,721 vertices, 7,200 tris)
  const SEGS = 60;
  const chunks: TerrainChunkData[] = [];
  const sampler = createTerrainSampler(rt, Math.hypot((x1 - x0) / 2 / SEGS, (z1 - z0) / 2 / SEGS));

  for (const [qMinX, qMaxX, qMinZ, qMaxZ] of quadrants) {
    const geo = new THREE.BufferGeometry();
    const vertCount = (SEGS + 1) * (SEGS + 1);
    const triCount = SEGS * SEGS * 2;

    const positions = new Float32Array(vertCount * 3);
    const normals = new Float32Array(vertCount * 3);
    const colors = new Float32Array(vertCount * 3);
    const uvs = new Float32Array(vertCount * 2);
    const uv2s = new Float32Array(vertCount * 2);
    const indices = new Uint32Array(triCount * 3);

    const stepX = (qMaxX - qMinX) / SEGS;
    const stepZ = (qMaxZ - qMinZ) / SEGS;

    // Fill vertices
    let vIdx = 0;
    for (let iz = 0; iz <= SEGS; iz++) {
      const z = qMinZ + iz * stepZ;
      for (let ix = 0; ix <= SEGS; ix++) {
        const x = qMinX + ix * stepX;
        const s = sampler.sample(x, z);

        positions[vIdx * 3] = x;
        positions[vIdx * 3 + 1] = s.height;
        positions[vIdx * 3 + 2] = z;

        // Normal estimation using central differences
        const hL = sampler.sample(x - stepX * 0.5, z).height;
        const hR = sampler.sample(x + stepX * 0.5, z).height;
        const hD = sampler.sample(x, z - stepZ * 0.5).height;
        const hU = sampler.sample(x, z + stepZ * 0.5).height;

        let nx = (hL - hR) / stepX;
        let ny = 1.0;
        let nz = (hD - hU) / stepZ;
        const invLen = 1.0 / Math.hypot(nx, ny, nz);
        nx *= invLen;
        ny *= invLen;
        nz *= invLen;

        normals[vIdx * 3] = nx;
        normals[vIdx * 3 + 1] = ny;
        normals[vIdx * 3 + 2] = nz;

        // Detail UV (tiling every 120 units = 12 m)
        uvs[vIdx * 2] = x / 120.0;
        uvs[vIdx * 2 + 1] = z / 120.0;

        // UV2 for macro-variation noise texture spanning entire terrain [0..1]
        uv2s[vIdx * 2] = (x - x0) / (x1 - x0);
        uv2s[vIdx * 2 + 1] = (z - z0) / (z1 - z0);

        // Vertex color based on slope and snow weather
        const slope = Math.max(0, 1.0 - ny); // 0 = flat, 1 = sheer cliff

        if (snow) {
          // Snow palette: pristine white on flats, rock/scree on steep faces
          if (slope < 0.25) {
            colors[vIdx * 3] = 0.94;
            colors[vIdx * 3 + 1] = 0.96;
            colors[vIdx * 3 + 2] = 1.0;
          } else {
            const t = Math.min(1, (slope - 0.25) / 0.4);
            colors[vIdx * 3] = 0.94 * (1 - t) + 0.45 * t;
            colors[vIdx * 3 + 1] = 0.96 * (1 - t) + 0.45 * t;
            colors[vIdx * 3 + 2] = 1.0 * (1 - t) + 0.48 * t;
          }
        } else {
          // Natural landscape palette:
          // Flat/rolling: lush meadow grass (#5f7d49 -> [0.37, 0.49, 0.29])
          // Medium slope (verges/embankments): dried grass/earth (#706b4f -> [0.44, 0.42, 0.31])
          // Steep cliff: rock (#5e5954 -> [0.37, 0.35, 0.33])
          if (slope < 0.14) {
            colors[vIdx * 3] = 0.38;
            colors[vIdx * 3 + 1] = 0.50;
            colors[vIdx * 3 + 2] = 0.29;
          } else if (slope < 0.38) {
            const t = (slope - 0.14) / 0.24;
            colors[vIdx * 3] = 0.38 * (1 - t) + 0.45 * t;
            colors[vIdx * 3 + 1] = 0.50 * (1 - t) + 0.43 * t;
            colors[vIdx * 3 + 2] = 0.29 * (1 - t) + 0.32 * t;
          } else {
            const t = Math.min(1, (slope - 0.38) / 0.35);
            colors[vIdx * 3] = 0.45 * (1 - t) + 0.37 * t;
            colors[vIdx * 3 + 1] = 0.43 * (1 - t) + 0.35 * t;
            colors[vIdx * 3 + 2] = 0.32 * (1 - t) + 0.33 * t;
          }
        }

        vIdx++;
      }
    }

    // Fill indices (two triangles per quad)
    let iIdx = 0;
    const stride = SEGS + 1;
    for (let iz = 0; iz < SEGS; iz++) {
      for (let ix = 0; ix < SEGS; ix++) {
        const a = iz * stride + ix;
        const b = a + 1;
        const c = (iz + 1) * stride + ix;
        const d = c + 1;

        indices[iIdx++] = a;
        indices[iIdx++] = c;
        indices[iIdx++] = b;

        indices[iIdx++] = b;
        indices[iIdx++] = c;
        indices[iIdx++] = d;
      }
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setAttribute('uv2', new THREE.BufferAttribute(uv2s, 2));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeBoundingSphere();

    chunks.push({
      geometry: geo,
      minX: qMinX,
      maxX: qMaxX,
      minZ: qMinZ,
      maxZ: qMaxZ,
    });
  }

  // ---- Distant mountain horizon ring ----
  // Replaces the 60 instanced sphere hills with a continuous scenic mountain silhouette (1 draw call, 128 tris)
  const mountainRing = buildMountainHorizonRing(bounds.cx, bounds.cz, Math.max(x1 - x0, z1 - z0) * 0.58, snow);

  return { chunks, mountainRing };
}

/**
 * Builds a low-poly circular mountain chain on the horizon.
 * 64 angular segments, undulating peaks rising up to +350..+750 units.
 */
function buildMountainHorizonRing(cx: number, cz: number, radius: number, snow: boolean): THREE.BufferGeometry {
  const SEGS = 64;
  const vertCount = (SEGS + 1) * 2;
  const triCount = SEGS * 2;

  const positions = new Float32Array(vertCount * 3);
  const colors = new Float32Array(vertCount * 3);
  const indices = new Uint32Array(triCount * 3);

  let vIdx = 0;
  for (let i = 0; i <= SEGS; i++) {
    const angle = (i / SEGS) * Math.PI * 2;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    // Varied mountain crests using trigonometric harmonics
    const crestPeak =
      Math.sin(angle * 3) * 160 +
      Math.cos(angle * 7) * 120 +
      Math.sin(angle * 13) * 80 +
      Math.cos(angle * 23) * 45;
    const peakHeight = 420.0 + crestPeak;

    const rBase = radius * 0.95;
    const rPeak = radius * 1.05;

    // Bottom vertex (at ground baseline)
    positions[vIdx * 3] = cx + cosA * rBase;
    positions[vIdx * 3 + 1] = -50.0;
    positions[vIdx * 3 + 2] = cz + sinA * rBase;

    // Base color (blends with ground)
    if (snow) {
      colors[vIdx * 3] = 0.88;
      colors[vIdx * 3 + 1] = 0.91;
      colors[vIdx * 3 + 2] = 0.96;
    } else {
      colors[vIdx * 3] = 0.28;
      colors[vIdx * 3 + 1] = 0.35;
      colors[vIdx * 3 + 2] = 0.26;
    }
    vIdx++;

    // Top vertex (mountain peak silhouette)
    positions[vIdx * 3] = cx + cosA * rPeak;
    positions[vIdx * 3 + 1] = peakHeight;
    positions[vIdx * 3 + 2] = cz + sinA * rPeak;

    // Peak color (rocky haze or snow-capped ridge)
    if (snow) {
      colors[vIdx * 3] = 0.96;
      colors[vIdx * 3 + 1] = 0.98;
      colors[vIdx * 3 + 2] = 1.0;
    } else {
      colors[vIdx * 3] = 0.46;
      colors[vIdx * 3 + 1] = 0.44;
      colors[vIdx * 3 + 2] = 0.48;
    }
    vIdx++;
  }

  let iIdx = 0;
  for (let i = 0; i < SEGS; i++) {
    const b0 = i * 2;
    const t0 = b0 + 1;
    const b1 = (i + 1) * 2;
    const t1 = b1 + 1;

    indices[iIdx++] = b0;
    indices[iIdx++] = t0;
    indices[iIdx++] = b1;

    indices[iIdx++] = b1;
    indices[iIdx++] = t0;
    indices[iIdx++] = t1;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}
