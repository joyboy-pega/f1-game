import { describe, expect, it } from 'vitest';
import { track, setActiveTrack } from './index';
import { surfaceHeight, surfaceGradeAngle, surfaceCamberAngle, wrapIndex } from './surface';

describe('3D surface queries (PLAN-v3 §4.2 T3)', () => {
  setActiveTrack('buddh');
  const rt = track.current;

  it('wrapIndex wraps correctly around boundaries', () => {
    const [i0, i1, t] = wrapIndex(0.5, rt.N);
    expect(i0).toBe(0);
    expect(i1).toBe(1);
    expect(t).toBeCloseTo(0.5);

    const [w0, w1, wt] = wrapIndex(rt.N - 0.25, rt.N);
    expect(w0).toBe(rt.N - 1);
    expect(w1).toBe(0);
    expect(wt).toBeCloseTo(0.75);
  });

  it('surfaceHeight at centerline matches pz array at integer indices', () => {
    for (const idx of [0, 100, 500, 1000, 1500, rt.N - 1]) {
      expect(surfaceHeight(idx, 0, rt)).toBeCloseTo(rt.pz[idx], 4);
    }
  });

  it('surfaceHeight interpolates smoothly between samples', () => {
    const idx = 250;
    const midHeight = surfaceHeight(idx + 0.5, 0, rt);
    const expected = (rt.pz[idx] + rt.pz[idx + 1]) * 0.5;
    expect(midHeight).toBeCloseTo(expected, 4);
  });

  it('surfaceHeight applies banking/camber offset with lateral distance', () => {
    const idx = 1200; // In banked section
    const center = surfaceHeight(idx, 0, rt);
    const inside = surfaceHeight(idx, -50, rt);
    const outside = surfaceHeight(idx, 50, rt);
    const camber = rt.camber[idx];
    expect(inside).toBeCloseTo(center - camber * 50, 4);
    expect(outside).toBeCloseTo(center + camber * 50, 4);
  });

  it('surfaceGradeAngle measures tangent pitch slope', () => {
    for (const idx of [0, 200, 600, 1400]) {
      const grade = surfaceGradeAngle(idx, rt);
      // Grade should be a realistic slope (within +/- 15 deg)
      expect(Math.abs(grade)).toBeLessThan(0.26);
    }
  });

  it('surfaceCamberAngle returns smooth camber values', () => {
    for (const idx of [0, 500, 1200, 1800]) {
      const camber = surfaceCamberAngle(idx, rt);
      expect(Math.abs(camber)).toBeLessThan(0.15); // < 8.6 degrees
    }
  });
});
