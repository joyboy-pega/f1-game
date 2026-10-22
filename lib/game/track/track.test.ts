import { describe, expect, it } from 'vitest';
import { getTrack, indexAtM, setActiveTrack, track, trackCache } from './index';

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
