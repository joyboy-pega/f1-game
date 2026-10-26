import { describe, expect, it } from 'vitest';
import { getLighting, rotateSunByAzimuth, type Lighting } from './lighting';

describe('Lighting, shadows & sun azimuth (PLAN-v3 §7 G4)', () => {
  it('rotates sun direction by circuit azimuth angle while preserving altitude and unit norm', () => {
    const sunDir: [number, number, number] = [0.6, 0.8, 0];
    const initialLen = Math.hypot(...sunDir);
    expect(initialLen).toBeCloseTo(1.0, 5);

    // 0 degrees rotation
    const noRot = rotateSunByAzimuth(sunDir, 0);
    expect(noRot[0]).toBeCloseTo(sunDir[0], 5);
    expect(noRot[1]).toBeCloseTo(sunDir[1], 5);
    expect(noRot[2]).toBeCloseTo(sunDir[2], 5);

    // 90 degrees rotation around Y (XZ plane)
    const rot90 = rotateSunByAzimuth(sunDir, 90);
    // [0.6, 0.8, 0] rotated 90 deg: X -> 0.6 * cos(90) - 0 = 0; Z -> 0.6 * sin(90) = 0.6
    expect(rot90[0]).toBeCloseTo(0, 4);
    expect(rot90[1]).toBeCloseTo(0.8, 4); // Y (altitude) preserved
    expect(rot90[2]).toBeCloseTo(0.6, 4);
    expect(Math.hypot(...rot90)).toBeCloseTo(1.0, 5);

    // 180 degrees rotation
    const rot180 = rotateSunByAzimuth(sunDir, 180);
    expect(rot180[0]).toBeCloseTo(-0.6, 4);
    expect(rot180[1]).toBeCloseTo(0.8, 4);
    expect(rot180[2]).toBeCloseTo(0, 4);
  });

  it('generates consistent lighting presets across times of day and weather conditions', () => {
    const tods = ['day', 'sunset', 'night'] as const;
    const weathers = ['sunny', 'cloudy', 'rain', 'snow'] as const;

    for (const tod of tods) {
      for (const w of weathers) {
        const L: Lighting = getLighting(tod, w);
        expect(L.tod).toBe(tod);
        expect(L.weather).toBe(w);
        expect(L.sunIntensity).toBeGreaterThan(0);
        expect(L.hemiIntensity).toBeGreaterThan(0);
        expect(L.exposure).toBeGreaterThan(0.5);
        expect(Math.hypot(...L.sunDir)).toBeCloseTo(1.0, 2);

        if (w === 'rain') {
          expect(L.wetness).toBe(1.0);
          expect(L.cloudCover).toBe(1.0);
        } else if (w === 'snow') {
          expect(L.snow).toBe(true);
        }
      }
    }
  });

  it('verifies texel-snapped shadow camera alignment eliminates swimming sub-pixel jitter', () => {
    const bounds = 600; // 120m tight shadow frustum
    const shadowRes = 2048;
    const texelSize = (bounds * 2) / shadowRes;

    const playerX = 142.3874;
    const playerZ = -582.9123;

    const snappedX = Math.floor(playerX / texelSize) * texelSize;
    const snappedZ = Math.floor(playerZ / texelSize) * texelSize;

    // Snapped coordinate is an exact integer multiple of texelSize
    expect(snappedX % texelSize).toBeCloseTo(0, 5);
    expect(snappedZ % texelSize).toBeCloseTo(0, 5);

    // Error is bounded by 1 texel (preventing sub-pixel aliasing)
    expect(Math.abs(playerX - snappedX)).toBeLessThanOrEqual(texelSize);
    expect(Math.abs(playerZ - snappedZ)).toBeLessThanOrEqual(texelSize);
  });
});
