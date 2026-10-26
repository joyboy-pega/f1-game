import { describe, expect, it } from 'vitest';
import { track } from '../track';
import { getRacingLine } from '../sim/racingLine';
import { getRunoffStripes, getRoadTextures, getWetRough } from './textures';
import { sweep, type RGBA } from './trackData';

describe('Track surface quality & rubbering (PLAN-v3 §7 G2)', () => {
  it('generates painted asphalt runoff textures with deceleration stripes', () => {
    const dryRunoff = getRunoffStripes(false);
    expect(dryRunoff.map).toBeDefined();
    expect(dryRunoff.rough).toBeDefined();

    const snowRunoff = getRunoffStripes(true);
    expect(snowRunoff.map).toBeDefined();
    expect(snowRunoff.rough).toBeDefined();
  });

  it('generates road geometry with rubbered racing line vertex color groove', () => {
    const rt = track.current;
    const N = rt.N;
    const rl = getRacingLine();
    const offsets = rl.offset;

    const rubberCol = (oVal: (i: number) => number) => {
      return (i: number): RGBA => {
        const o = oVal(i);
        const lineO = offsets[i] ?? 0;
        const d = Math.abs(o - lineO);
        const t = Math.min(1, d / 18);
        const k = 0.68 + 0.32 * t;
        return [k, k, k, 1];
      };
    };

    const roadGeo = sweep({
      from: 0,
      count: Math.min(N, 100),
      vScale: 512,
      profile: [
        { o: (i) => -rt.halfWidth[i], y: 0.08, u: 0, col: rubberCol((i) => -rt.halfWidth[i]) },
        { o: (i) => -rt.halfWidth[i] * 0.5, y: 0.08, u: 0.25, col: rubberCol((i) => -rt.halfWidth[i] * 0.5) },
        { o: (i) => 0, y: 0.08, u: 0.5, col: rubberCol(() => 0) },
        { o: (i) => rt.halfWidth[i] * 0.5, y: 0.08, u: 0.75, col: rubberCol((i) => rt.halfWidth[i] * 0.5) },
        { o: (i) => rt.halfWidth[i], y: 0.08, u: 1, col: rubberCol((i) => rt.halfWidth[i]) },
      ],
    });

    const col = roadGeo.getAttribute('color');
    expect(col).toBeDefined();
    expect(col.count).toBeGreaterThan(0);

    // Verify rubbered vertices are darker (< 0.8) and outside vertices are lighter (> 0.9)
    let minBrightness = 1.0;
    let maxBrightness = 0.0;
    for (let i = 0; i < col.count; i++) {
      const b = col.getX(i);
      if (b < minBrightness) minBrightness = b;
      if (b > maxBrightness) maxBrightness = b;
    }

    expect(minBrightness).toBeLessThanOrEqual(0.75); // Dark rubber groove
    expect(maxBrightness).toBeGreaterThanOrEqual(0.95); // Clean outer edge
  });

  it('provides puddle mask roughness for wet asphalt', () => {
    const wetRough = getWetRough();
    expect(wetRough).toBeDefined();
    const dryRoad = getRoadTextures(false);
    expect(dryRoad.map).toBeDefined();
    expect(dryRoad.rough).toBeDefined();
  });
});
