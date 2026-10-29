import { describe, expect, it } from 'vitest';
import { getF1Geometries } from './f1Geometry';

describe('G5: F1 Car Visuals & Geometry Budget', () => {
  it('builds all required F1 car parts with 2022+ silhouette features', () => {
    const geos = getF1Geometries();
    expect(geos.body).toBeDefined();
    expect(geos.carbon).toBeDefined();
    expect(geos.flap).toBeDefined();
    expect(geos.steeringWheel).toBeDefined();
    expect(geos.brakeLight).toBeDefined();
    // Updated with the rear-wing rework that lowered the mainplane/flap stack onto the endplates
    // (fixed a visible gap between the flap and mainplane) — see f1Geometry.ts buildBody()/getF1Geometries().
    expect(geos.flapPivot).toEqual([0, 0.85, -1.44]);
  });

  it('keeps LOD0 total triangle budget under 10k tris (§7 G5)', () => {
    const geos = getF1Geometries();
    const countTriangles = (geo: any) => {
      if (geo.index) return geo.index.count / 3;
      if (geo.attributes.position) return geo.attributes.position.count / 3;
      return 0;
    };

    const bodyTris = countTriangles(geos.body);
    const carbonTris = countTriangles(geos.carbon);
    const flapTris = countTriangles(geos.flap);
    const wheelTris = countTriangles(geos.steeringWheel);
    const brakeTris = countTriangles(geos.brakeLight);
    const totalTris = bodyTris + carbonTris + flapTris + wheelTris + brakeTris;

    console.log(`[F1Geometry] Tris: body=${bodyTris}, carbon=${carbonTris}, flap=${flapTris}, wheel=${wheelTris}, brake=${brakeTris}, total=${totalTris}`);
    expect(totalTris).toBeLessThan(10000);
    expect(totalTris).toBeGreaterThan(1500); // detailed enough for 2022 silhouette
  });
});
