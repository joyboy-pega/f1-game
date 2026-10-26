import { describe, expect, it } from 'vitest';
import { track } from '../track';
import {
  buildBrakeBoards,
  buildMarshalPosts,
  buildPaddockBuildings,
  buildSponsorBoards,
  buildTreeSystem,
  buildTyreWalls,
} from './dressing';

describe('Trackside dressing system (PLAN-v3 §7 G3)', () => {
  it('builds brake marker boards before braking zones with 300/200/100m UV mapping', () => {
    const rt = track.current;
    const geo = buildBrakeBoards(rt);
    expect(geo).not.toBeNull();

    const pos = geo!.getAttribute('position');
    const uv = geo!.getAttribute('uv');
    expect(pos.count).toBeGreaterThan(0);
    expect(uv).toBeDefined();

    // Verify UV ranges cover all three distance cells [0..1/3, 1/3..2/3, 2/3..1]
    let has300 = false;
    let has200 = false;
    let has100 = false;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i);
      if (u <= 0.34) has300 = true;
      if (u > 0.34 && u <= 0.67) has200 = true;
      if (u > 0.67) has100 = true;
    }
    expect(has300).toBe(true);
    expect(has200).toBe(true);
    expect(has100).toBe(true);
  });

  it('builds tyre walls on corner outsides', () => {
    const rt = track.current;
    const geo = buildTyreWalls(rt);
    expect(geo).not.toBeNull();
    const pos = geo!.getAttribute('position');
    expect(pos.count).toBeGreaterThan(0);
  });

  it('builds sponsor boards along barriers', () => {
    const rt = track.current;
    const geo = buildSponsorBoards(rt);
    expect(geo).not.toBeNull();
    const pos = geo!.getAttribute('position');
    expect(pos.count).toBeGreaterThan(0);
  });

  it('builds marshal posts and digital light panels every ~300m', () => {
    const rt = track.current;
    const { posts, lightPanels } = buildMarshalPosts(rt);
    expect(posts).not.toBeNull();
    expect(lightPanels).not.toBeNull();

    const postPos = posts!.getAttribute('position');
    const panelPos = lightPanels!.getAttribute('position');
    expect(postPos.count).toBeGreaterThan(0);
    expect(panelPos.count).toBeGreaterThan(0);
  });

  it('builds cross-billboard tree geometry and instanced transforms', () => {
    const rt = track.current;
    const { geometry, matrices } = buildTreeSystem(rt, 1.0);

    // Cross-billboard geometry: 2 quads = 8 vertices, 4 triangles (12 indices)
    const pos = geometry.getAttribute('position');
    const idx = geometry.getIndex();
    expect(pos.count).toBe(8);
    expect(idx!.count).toBe(12);

    // Instances generated outside walls
    expect(matrices.length).toBeGreaterThan(50);
  });

  it('builds paddock hospitality suites behind pit garages', () => {
    const rt = track.current;
    const geo = buildPaddockBuildings(rt);
    expect(geo).not.toBeNull();
    const pos = geo!.getAttribute('position');
    expect(pos.count).toBeGreaterThan(0);
  });
});
