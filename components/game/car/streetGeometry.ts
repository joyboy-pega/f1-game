import * as THREE from 'three';
import { box, ellipsoid, loft, mergeParts, type Station } from './geom';

export interface StreetGeometries {
  body: THREE.BufferGeometry; // livery-coloured panels
  trim: THREE.BufferGeometry; // dark carbon: splitter, diffuser, mirrors, sills
  glass: THREE.BufferGeometry;
  lamps: THREE.BufferGeometry;
  tailLight: THREE.BufferGeometry;
}

let cache: StreetGeometries | null = null;

/**
 * Low-slung road supercar in the same footprint as the F1 car (z -1.5..+1.95, x +-0.9) so physics,
 * cameras and collisions don't care which model is shown. Built once and shared.
 */
export function getStreetGeometries(): StreetGeometries {
  if (cache) return cache;

  // Main tub: raised haunches cover the wheels like a road car; narrow low nose, tapered tail
  const tub: Station[] = [
    { z: 1.88, cy: 0.27, w: 0.5, h: 0.05, n: 2.6 },
    { z: 1.6, cy: 0.34, w: 0.78, h: 0.12, n: 2.8, bw: 0.9 },
    { z: 1.1, cy: 0.44, w: 0.92, h: 0.22, n: 3, bw: 0.9 },
    { z: 0.5, cy: 0.45, w: 0.93, h: 0.22, n: 3, bw: 0.9 },
    { z: -0.1, cy: 0.46, w: 0.94, h: 0.22, n: 3, bw: 0.9 },
    { z: -0.75, cy: 0.47, w: 0.95, h: 0.23, n: 3, bw: 0.9 },
    { z: -1.2, cy: 0.45, w: 0.88, h: 0.21, n: 3, bw: 0.9 },
    { z: -1.5, cy: 0.4, w: 0.7, h: 0.16, n: 2.8, bw: 0.92 },
  ];

  // Greenhouse: glass canopy with a thin roof panel on top
  const canopy: Station[] = [
    { z: 0.7, cy: 0.68, w: 0.5, h: 0.05, n: 2.4 },
    { z: 0.45, cy: 0.74, w: 0.6, h: 0.14, n: 2.6, tw: 0.82 },
    { z: -0.1, cy: 0.8, w: 0.62, h: 0.17, n: 2.6, tw: 0.8 },
    { z: -0.6, cy: 0.78, w: 0.6, h: 0.16, n: 2.6, tw: 0.78 },
    { z: -1.05, cy: 0.68, w: 0.5, h: 0.06, n: 2.4 },
  ];
  const roof: Station[] = [
    { z: 0.3, cy: 0.965, w: 0.44, h: 0.02, n: 2.4 },
    { z: -0.1, cy: 0.985, w: 0.47, h: 0.022, n: 2.4 },
    { z: -0.62, cy: 0.96, w: 0.44, h: 0.02, n: 2.4 },
  ];

  const patch = (p: 'body' | 'accent' | 'dark' | 'white') => ({ kind: 'patch', patch: p }) as const;

  const bodyParts = [
    { geo: loft(tub, 16), uv: patch('body') },
    { geo: loft(roof, 12), uv: patch('body') },
    // rear wing on pylons: plane + endplates in the accent colour
    { geo: box(1.4, 0.035, 0.3, [0, 0.98, -1.42]), uv: patch('accent') },
    { geo: box(0.03, 0.15, 0.34, [0.71, 0.93, -1.42]), uv: patch('accent') },
    { geo: box(0.03, 0.15, 0.34, [-0.71, 0.93, -1.42]), uv: patch('accent') },
  ];

  const trimParts = [
    { geo: box(1.3, 0.025, 0.34, [0, 0.19, 1.8]) }, // front splitter
    { geo: box(1.15, 0.04, 0.26, [0, 0.19, -1.5]) }, // rear diffuser
    { geo: box(0.05, 0.22, 0.1, [0.3, 0.84, -1.38]) }, // wing pylons
    { geo: box(0.05, 0.22, 0.1, [-0.3, 0.84, -1.38]) },
    { geo: box(0.1, 0.06, 0.14, [0.7, 0.8, 0.45]) }, // mirrors
    { geo: box(0.1, 0.06, 0.14, [-0.7, 0.8, 0.45]) },
    { geo: box(0.03, 0.04, 1.6, [0.82, 0.25, -0.1]) }, // side sills
    { geo: box(0.03, 0.04, 1.6, [-0.82, 0.25, -0.1]) },
    { geo: box(0.4, 0.012, 0.7, [0, 0.665, 1.2]) }, // hood vent
  ];

  const lampParts = [1, -1].map((sx) => ({ geo: ellipsoid(0.13, 0.04, 0.11, [sx * 0.56, 0.4, 1.6], 10, 6) }));

  cache = {
    body: mergeParts(bodyParts),
    trim: mergeParts(trimParts),
    glass: loft(canopy, 14),
    lamps: mergeParts(lampParts),
    tailLight: box(1.3, 0.05, 0.05, [0, 0.52, -1.51]),
  };
  return cache;
}
