import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildTrack } from './build';
import { curvatureProfile, maxCurvatureJump, resampleClosed, ringLength, rotateRing, selfIntersections, signedArea, smoothClosed, type Pt } from './geo';
import { importCircuit } from './import';
import { decodePoints, encodePoints } from './pointsCodec';
import { buddhControlPoints } from '../tracks/buddh';
import monza from '../tracks/monza';

const GEOJSON = readFileSync(path.resolve(__dirname, '../../../scripts/tracks/data/it-1922.geojson'), 'utf8');

/** Unit square listed clockwise as drawn with y pointing down: (0,0) -> (10,0) -> (10,10) -> (0,10). */
const SQUARE: Pt[] = [[0, 0], [10, 0], [10, 10], [0, 10]];

describe('geo helpers', () => {
  it('signedArea is positive for clockwise-on-screen (y down) and negative for the reverse', () => {
    expect(signedArea(SQUARE)).toBeCloseTo(100);
    expect(signedArea([...SQUARE].reverse())).toBeCloseTo(-100);
  });

  it('handedness: Buddh (runs clockwise on its minimap) has a positive signed area, matching its meta direction', () => {
    expect(signedArea(buddhControlPoints)).toBeGreaterThan(0);
  });

  it('resampleClosed gives equal spacing and keeps point 0', () => {
    const r = resampleClosed(SQUARE, 40);
    expect(r[0]).toEqual(SQUARE[0]);
    const d = r.map((p, i) => Math.hypot(r[(i + 1) % 40][0] - p[0], r[(i + 1) % 40][1] - p[1]));
    for (const v of d) expect(v).toBeLessThanOrEqual(1.0001);
    expect(ringLength(r)).toBeGreaterThan(39); // corners cut slightly
  });

  it('smoothClosed never moves a point further than maxMove', () => {
    const noisy: Pt[] = Array.from({ length: 100 }, (_, i): Pt => [Math.cos((i / 100) * 2 * Math.PI) * 100 + (i % 2) * 3, Math.sin((i / 100) * 2 * Math.PI) * 100]);
    const s = smoothClosed(noisy, 50, 0.5, 1.5);
    s.forEach((p, i) => expect(Math.hypot(p[0] - noisy[i][0], p[1] - noisy[i][1])).toBeLessThanOrEqual(1.5 + 1e-9));
  });

  it('selfIntersections finds a figure eight and none on a simple loop', () => {
    const eight: Pt[] = Array.from({ length: 200 }, (_, i): Pt => {
      const t = (i / 200) * 2 * Math.PI;
      return [Math.sin(t) * 100, Math.sin(2 * t) * 50];
    });
    expect(selfIntersections(eight)).toBeGreaterThan(0);
    expect(selfIntersections(resampleClosed(SQUARE, 40))).toBe(0);
  });

  it('rotateRing moves the start index', () => {
    expect(rotateRing([1, 2, 3, 4], 2)).toEqual([3, 4, 1, 2]);
    expect(rotateRing([1, 2, 3, 4], -1)).toEqual([4, 1, 2, 3]);
  });

  it('curvature of a circle of radius R is 1/R', () => {
    const R = 200;
    const circle: Pt[] = Array.from({ length: 400 }, (_, i): Pt => [R * Math.cos((i / 400) * 2 * Math.PI), R * Math.sin((i / 400) * 2 * Math.PI)]);
    const k = curvatureProfile(circle);
    expect(k[10]).toBeCloseTo(1 / R, 4);
    expect(maxCurvatureJump(circle)).toBeLessThan(1e-6);
  });
});

describe('points codec', () => {
  it('round-trips through float32', () => {
    const pts: Pt[] = [[1.5, -2.25], [12345.678, 0.001], [-99999, 42]];
    const back = decodePoints(encodePoints(pts));
    back.forEach((p, i) => {
      expect(p[0]).toBeCloseTo(pts[i][0], 1);
      expect(p[1]).toBeCloseTo(pts[i][1], 2);
    });
  });
});

describe('Monza import (bacinger/f1-circuits it-1922)', () => {
  const c = importCircuit(GEOJSON);

  it('is a closed loop of the official length, 2.5 m spacing', () => {
    expect(c.lengthM).toBe(5793);
    expect(c.n).toBe(2317);
    expect(Math.abs(ringLength(c.pointsM) - 5793)).toBeLessThan(5); // plan: 5793 +- 5 m
    const first = c.pointsM[0];
    const last = c.pointsM[c.n - 1];
    expect(Math.hypot(first[0] - last[0], first[1] - last[1])).toBeLessThan(3); // one spacing across the wrap
  });

  it('has no curvature spikes and does not cross itself', () => {
    // measured 0.0209 1/m per sample; Monza's tightest corners are ~0.05 1/m. Spikes from bad geometry would be an order larger.
    expect(c.stats.maxCurvatureJump).toBeLessThan(0.03);
    expect(c.stats.selfIntersections).toBe(0);
    expect(c.stats.minSeparationM).toBeGreaterThan(30);
  });

  it('runs clockwise like the real circuit, in the same handedness as Buddh', () => {
    expect(c.direction).toBe('cw');
    expect(signedArea(c.pointsM)).toBeGreaterThan(0);
    expect(Math.sign(signedArea(c.pointsM))).toBe(Math.sign(signedArea(buddhControlPoints)));
  });

  it('starts at the requested point (index 0 = first coordinate within a few cm)', () => {
    expect(c.stats.startOffsetM).toBeLessThan(1.25); // half a spacing at worst
  });

  it('rejects input that is not a LineString feature', () => {
    expect(() => importCircuit('{"type":"FeatureCollection","features":[]}')).toThrow();
    expect(() => importCircuit(JSON.stringify({ features: [{ geometry: { type: 'Point', coordinates: [] } }] }))).toThrow();
  });
});

describe('generated tracks/monza.ts', () => {
  const rt = buildTrack(monza.meta, monza.controlPoints, monza.samplesPerPoint ?? 2);

  it('builds into a TrackRuntime of the official length within 5 m', () => {
    expect(rt.N).toBe(2317);
    expect(Math.abs(rt.length / 10 - 5793)).toBeLessThan(5);
    expect(rt.meta.id).toBe('monza');
    expect(monza.meta.direction).toBe('cw');
  });

  it('matches the importer output (float32 storage only)', () => {
    expect(monza.controlPoints).toHaveLength(2317);
    const c = importCircuit(GEOJSON);
    monza.controlPoints.forEach((p, i) => {
      if (i % 97 !== 0) return;
      expect(Math.abs(p[0] - c.pointsM[i][0] * 10)).toBeLessThan(0.05);
      expect(Math.abs(p[1] - c.pointsM[i][1] * 10)).toBeLessThan(0.05);
    });
  });

  it('keeps the point spacing uniform (~25 units) after the builder', () => {
    let min = Infinity;
    let max = 0;
    for (let i = 0; i < rt.N; i++) {
      min = Math.min(min, rt.segLen[i]);
      max = Math.max(max, rt.segLen[i]);
    }
    expect(min).toBeGreaterThan(24);
    expect(max).toBeLessThan(26);
  });
});
