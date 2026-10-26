import { describe, expect, it } from 'vitest';
import { track } from '../track';
import { createTerrainSampler, buildTerrain } from './terrain';

describe('Terrain system (PLAN-v3 §7 G1)', () => {
  it('creates terrain sampler with flattened track corridor (-0.3m) within wall distance', () => {
    const rt = track.current;
    const sampler = createTerrainSampler(rt);

    // Test point right at start/finish line centerline
    const x0 = rt.px[0];
    const z0 = rt.py[0];
    const roadH0 = rt.pz[0];
    const s0 = sampler.sample(x0, z0);

    expect(s0.dist).toBeCloseTo(0, 0);
    expect(s0.nearestIdx).toBe(0);
    // Terrain within wall distance is flattened to road height - 0.3 m (3.0 world units)
    expect(s0.height).toBeCloseTo(roadH0 - 3.0, 1);

    // Test point near the wall boundary (halfWidth + 80 units)
    const hw0 = rt.halfWidth[0];
    const nx0 = rt.nx[0];
    const ny0 = rt.ny[0]; // world Z in our coordinates
    const nearWallX = x0 + nx0 * (hw0 + 75);
    const nearWallZ = z0 + ny0 * (hw0 + 75);
    const sWall = sampler.sample(nearWallX, nearWallZ);

    expect(sWall.dist).toBeLessThanOrEqual(hw0 + 82);
    expect(sWall.height).toBeCloseTo(roadH0 - 3.0, 1);

    // Test point outside the corridor (~2000 units along normal, near another sector ~700 units away)
    const farX = x0 + nx0 * 2000;
    const farZ = z0 + ny0 * 2000;
    const sFar = sampler.sample(farX, farZ);

    expect(sFar.dist).toBeGreaterThan(600);
    expect(Number.isFinite(sFar.height)).toBe(true);
    expect(isNaN(sFar.height)).toBe(false);
  });

  it('builds 4 quadrant chunks + 1 mountain horizon ring within budget (<= 6 draws, <= 150k tris)', () => {
    const rt = track.current;
    const { chunks, mountainRing } = buildTerrain(rt, false);

    // 4 quadrant chunks
    expect(chunks.length).toBe(4);

    let totalTris = 0;

    for (let c = 0; c < chunks.length; c++) {
      const chunk = chunks[c];
      const pos = chunk.geometry.getAttribute('position');
      const norm = chunk.geometry.getAttribute('normal');
      const col = chunk.geometry.getAttribute('color');
      const uv = chunk.geometry.getAttribute('uv');
      const uv2 = chunk.geometry.getAttribute('uv2');
      const idx = chunk.geometry.getIndex();

      expect(pos).toBeDefined();
      expect(norm).toBeDefined();
      expect(col).toBeDefined();
      expect(uv).toBeDefined();
      expect(uv2).toBeDefined();
      expect(idx).toBeDefined();

      const tris = idx!.count / 3;
      totalTris += tris;

      // Verify normals are normalized and valid numbers
      for (let i = 0; i < Math.min(pos.count, 20); i++) {
        const nx = norm.getX(i);
        const ny = norm.getY(i);
        const nz = norm.getZ(i);
        const len = Math.hypot(nx, ny, nz);
        expect(len).toBeCloseTo(1.0, 2);
        expect(Number.isFinite(pos.getY(i))).toBe(true);
      }

      // Verify colors are in valid [0, 1] range
      for (let i = 0; i < Math.min(col.count, 20); i++) {
        expect(col.getX(i)).toBeGreaterThanOrEqual(0);
        expect(col.getX(i)).toBeLessThanOrEqual(1);
        expect(col.getY(i)).toBeGreaterThanOrEqual(0);
        expect(col.getY(i)).toBeLessThanOrEqual(1);
        expect(col.getZ(i)).toBeGreaterThanOrEqual(0);
        expect(col.getZ(i)).toBeLessThanOrEqual(1);
      }

      // Bounding sphere must be computed for frustum culling
      expect(chunk.geometry.boundingSphere).not.toBeNull();
      expect(chunk.geometry.boundingSphere!.radius).toBeGreaterThan(100);
    }

    // Mountain ring
    const ringIdx = mountainRing.getIndex();
    expect(ringIdx).toBeDefined();
    const ringTris = ringIdx!.count / 3;
    totalTris += ringTris;

    // Budget acceptance: <= 6 draws (4 chunks + 1 ring = 5 draws), <= 150k tris total
    const drawCalls = chunks.length + 1;
    expect(drawCalls).toBeLessThanOrEqual(6);
    expect(totalTris).toBeLessThanOrEqual(150000);
    expect(totalTris).toBeGreaterThan(10000); // Has adequate geometry detail
  });

  it('generates valid terrain with snow palette', () => {
    const rt = track.current;
    const { chunks, mountainRing } = buildTerrain(rt, true);

    expect(chunks.length).toBe(4);
    const col = chunks[0].geometry.getAttribute('color');
    // Snow colors should have high luminance (r, g, b > 0.4)
    for (let i = 0; i < Math.min(col.count, 20); i++) {
      expect(col.getX(i)).toBeGreaterThan(0.4);
      expect(col.getY(i)).toBeGreaterThan(0.4);
      expect(col.getZ(i)).toBeGreaterThan(0.4);
    }
  });
});
