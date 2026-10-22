import { describe, expect, it } from 'vitest';
import { ensureTrack, getTrack, indexAtM, isTrackLoaded, setActiveTrack, track, trackCache, trackCatalog, trackOutline } from './index';
import { registerLazyTrackForTests } from './registry';

describe('Buddh TrackRuntime', () => {
  const rt = getTrack('buddh');

  it('has the spline size and arc length the game has always had', () => {
    expect(rt.N).toBe(1920);
    expect(rt.px).toHaveLength(1920);
    expect(rt.cumulativeS).toHaveLength(1921);
    expect(rt.length).toBeCloseTo(46110.92, 1); // 4611.1 m at UNITS_PER_M = 10 (the S6 probe's 4739 m uses 0.10278 m/unit)
    expect(rt.length / 10).toBeCloseTo(rt.meta.lengthM, 0);
    expect(rt.length).toBe(rt.cumulativeS[rt.N]);
  });

  it('converts the metre metadata back to exactly the old spline indices', () => {
    expect(rt.sectorIdx).toEqual([280, 1130]);
    expect(rt.pit.entryIdx).toBe(1790);
    expect(rt.pit.exitIdx).toBe(100);
    expect(rt.pit.boxStartIdx).toBe(1815);
    expect(rt.pit.boxEndIdx).toBe(1905);
    expect(rt.pit.side).toBe(1);
    expect(rt.pit.speedLimitKmh).toBe(80);
    expect(rt.drs.map((z) => [z.id, z.detectIdx, z.start, z.end, z.wraps])).toEqual([
      [1, 1720, 1760, 80, true],
      [2, 290, 330, 710, false],
    ]);
  });

  it('has unit tangents, perpendicular unit normals and a closed, monotonic arc length', () => {
    for (let i = 0; i < rt.N; i += 37) {
      expect(Math.hypot(rt.tx[i], rt.ty[i])).toBeCloseTo(1, 12);
      expect(rt.tx[i] * rt.nx[i] + rt.ty[i] * rt.ny[i]).toBeCloseTo(0, 12);
    }
    for (let i = 0; i < rt.N; i++) expect(rt.cumulativeS[i + 1]).toBeGreaterThan(rt.cumulativeS[i]);
  });

  it('is flat with constant width until T2', () => {
    expect(rt.pz.every((v) => v === 0)).toBe(true);
    expect(rt.halfWidth[0]).toBe(rt.halfWidth[rt.N - 1]);
  });
});

describe('indexAtM', () => {
  const rt = getTrack('buddh');
  it('returns the nearest index, including both ends', () => {
    expect(indexAtM(rt.cumulativeS, rt.N, 0)).toBe(0);
    const i = 1000;
    expect(indexAtM(rt.cumulativeS, rt.N, rt.cumulativeS[i] / 10)).toBe(i);
    // 0.3 m is well under half a point spacing (1.2 m): still the same index
    expect(indexAtM(rt.cumulativeS, rt.N, rt.cumulativeS[i] / 10 + 0.3)).toBe(i);
  });
});

describe('active track', () => {
  it('defaults to buddh and rejects unknown ids', () => {
    expect(track.current.meta.id).toBe('buddh');
    expect(() => setActiveTrack('nowhere')).toThrow();
    expect(track.current.meta.id).toBe('buddh');
  });

  it('trackCache builds once per track id', () => {
    let builds = 0;
    const get = trackCache((rt) => ({ n: rt.N, builds: ++builds }));
    expect(get()).toBe(get());
    expect(builds).toBe(1);
  });
});

describe('catalog and lazy loading', () => {
  it('lists Buddh with lobby facts without building anything', () => {
    const b = trackCatalog().find((t) => t.id === 'buddh')!;
    expect(b.name).toBe('Buddh Circuit');
    expect(b.lengthM).toBe(5125);
    expect(b.turns).toBe(16);
  });

  it('ensureTrack resolves bundled tracks immediately and loads a lazy module once', async () => {
    expect(await ensureTrack('buddh')).toBe(getTrack('buddh'));
    let loads = 0;
    const buddh = getTrack('buddh');
    registerLazyTrackForTests({ id: 'lazytest', name: 'Lazy', country: 'X', lengthM: 1 }, async () => {
      loads++;
      return { meta: { ...buddh.meta, id: 'lazytest', name: 'Lazy' }, controlPoints: Array.from({ length: 32 }, (_, i) => [Math.cos(i / 5) * 1000, Math.sin(i / 5) * 1000] as [number, number]) };
    });
    expect(isTrackLoaded('lazytest')).toBe(false);
    expect(() => getTrack('lazytest')).toThrow();
    const rt = await ensureTrack('lazytest');
    await ensureTrack('lazytest');
    expect(loads).toBe(1);
    expect(isTrackLoaded('lazytest')).toBe(true);
    expect(rt.meta.id).toBe('lazytest');
    expect(setActiveTrack('lazytest').meta.id).toBe('lazytest');
    setActiveTrack('buddh');
    expect(track.current.meta.id).toBe('buddh');
    await expect(ensureTrack('nope')).rejects.toThrow();
  });
});

describe('trackOutline', () => {
  it('makes a closed path inside the box with the start marker on it', () => {
    const o = trackOutline(getTrack('buddh'), 220, 140, 10);
    expect(o.d.startsWith('M')).toBe(true);
    expect(o.d.endsWith('Z')).toBe(true);
    const nums = o.d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    for (let i = 0; i < nums.length; i += 2) {
      expect(nums[i]).toBeGreaterThanOrEqual(9.9);
      expect(nums[i]).toBeLessThanOrEqual(210.1);
      expect(nums[i + 1]).toBeGreaterThanOrEqual(9.9);
      expect(nums[i + 1]).toBeLessThanOrEqual(130.1);
    }
    expect(o.start.x).toBeGreaterThan(0);
  });
});
