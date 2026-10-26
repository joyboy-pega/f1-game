import * as THREE from 'three';
import { box, loft, mergeParts, type Station } from './geom';

export interface RoadsterGeometries {
  body: THREE.BufferGeometry; // livery-coloured aerodynamic panels & ducktail
  trim: THREE.BufferGeometry; // carbon splitter, side skirts, diffuser & yoke/dash
  glass: THREE.BufferGeometry; // panoramic targa fastback glass canopy
  lamps: THREE.BufferGeometry; // sharp front LED slit headlights
  tailLight: THREE.BufferGeometry; // continuous full-width rear LED blade lightbar
  yoke: THREE.BufferGeometry; // steerable aerospace yoke wheel
}

let cache: RoadsterGeometries | null = null;

/**
 * Next-generation Tesla Roadster procedural model.
 * Fits within the shared car footprint (z: -1.55..+1.95, x: +-0.94) so physics,
 * cameras, and wheel placement align seamlessly with the simulation world.
 */
export function getRoadsterGeometries(): RoadsterGeometries {
  if (cache) return cache;

  // ---------------------------------------------------------------------------
  // 1. Aerodynamic Main Body Tub
  // Low pointed electric nose, sculpted hood, front fender arches, side air coves,
  // muscular rear haunches, and integrated Kamm-tail ducktail spoiler.
  // ---------------------------------------------------------------------------
  const tub: Station[] = [
    // Front pointed nose tip (grille-free electric aero cone)
    { z: 1.94, cy: 0.22, w: 0.36, h: 0.045, n: 2.4, bw: 0.9 },
    // Front chin widening smoothly
    { z: 1.74, cy: 0.27, w: 0.62, h: 0.08, n: 2.6, bw: 0.92, tw: 0.94 },
    // Front wheel front edge & hood base
    { z: 1.42, cy: 0.35, w: 0.80, h: 0.15, n: 2.8, bw: 0.88, tw: 0.90 },
    // Front wheel arch apex (high athletic front fenders over wheels)
    { z: 1.05, cy: 0.40, w: 0.87, h: 0.18, n: 3.0, bw: 0.86, tw: 0.88 },
    // Flank air cove behind front wheels (sculpted door air extractor channel)
    { z: 0.62, cy: 0.41, w: 0.82, h: 0.19, n: 2.8, bw: 0.88, tw: 0.84 },
    // Door mid-section (tucked waistline)
    { z: 0.10, cy: 0.42, w: 0.83, h: 0.20, n: 2.8, bw: 0.88, tw: 0.85 },
    // Muscular rear haunches opening up
    { z: -0.48, cy: 0.43, w: 0.89, h: 0.21, n: 2.9, bw: 0.88, tw: 0.88 },
    // Rear wheel arch apex (broad muscular stance over wide rear tires)
    { z: -1.00, cy: 0.44, w: 0.94, h: 0.22, n: 3.0, bw: 0.88, tw: 0.88 },
    // Rear quarter deck taper
    { z: -1.35, cy: 0.45, w: 0.86, h: 0.20, n: 2.9, bw: 0.90, tw: 0.92 },
    // Rear Kamm tail with upturned integrated aero lip
    { z: -1.54, cy: 0.46, w: 0.75, h: 0.17, n: 2.8, bw: 0.92, tw: 0.96 },
  ];

  // ---------------------------------------------------------------------------
  // 2. Panoramic Glass Canopy (Windshield, Targa Roof & Fastback Hatch)
  // Seamless teardrop greenhouse tapering backward into the rear deck.
  // ---------------------------------------------------------------------------
  const canopy: Station[] = [
    // Base of raked windshield (cowl)
    { z: 0.80, cy: 0.58, w: 0.50, h: 0.04, n: 2.4, tw: 0.86 },
    // Mid windshield rake
    { z: 0.48, cy: 0.68, w: 0.58, h: 0.12, n: 2.5, tw: 0.82 },
    // Windshield header / targa front apex
    { z: 0.12, cy: 0.75, w: 0.60, h: 0.14, n: 2.6, tw: 0.78 },
    // Panoramic glass roof section
    { z: -0.28, cy: 0.74, w: 0.58, h: 0.14, n: 2.6, tw: 0.76 },
    // Fastback rear glass slope
    { z: -0.68, cy: 0.69, w: 0.53, h: 0.12, n: 2.5, tw: 0.78 },
    // Rear glass meeting the rear decklid
    { z: -1.12, cy: 0.60, w: 0.45, h: 0.05, n: 2.4, tw: 0.82 },
  ];

  const patch = (p: 'body' | 'accent' | 'dark' | 'white') => ({ kind: 'patch', patch: p }) as const;

  // ---------------------------------------------------------------------------
  // 3. Bodywork Parts (Liveried Body Panels & Accent Elements)
  // ---------------------------------------------------------------------------
  const bodyParts = [
    // Main aerodynamic sculpted body shell
    { geo: loft(tub, 18), uv: patch('body') },

    // Left & right sleek body-color roof cantrails / A-pillars framing the panoramic glass
    { geo: box(0.045, 0.038, 1.62, [0.47, 0.71, -0.1], [0.07, 0.03, -0.04]), uv: patch('body') },
    { geo: box(0.045, 0.038, 1.62, [-0.47, 0.71, -0.1], [0.07, -0.03, 0.04]), uv: patch('body') },

    // Rear targa bridge / roof arch
    { geo: box(0.94, 0.038, 0.15, [0, 0.79, -0.28]), uv: patch('body') },

    // Integrated ducktail rear deck spoiler lip in accent color
    { geo: box(1.30, 0.038, 0.22, [0, 0.645, -1.46], [0.12, 0, 0]), uv: patch('accent') },

    // Front hood aerodynamic center crease / air extractor accent
    { geo: box(0.36, 0.012, 0.58, [0, 0.495, 1.34], [0.10, 0, 0]), uv: patch('accent') },

    // Front fender crown aero strakes
    { geo: box(0.025, 0.018, 0.42, [0.72, 0.55, 1.15], [0.08, 0, 0]), uv: patch('accent') },
    { geo: box(0.025, 0.018, 0.42, [-0.72, 0.55, 1.15], [0.08, 0, 0]), uv: patch('accent') },
  ];

  // ---------------------------------------------------------------------------
  // 4. Carbon Fiber Aero & Interior Trim
  // Front splitter, side skirts, multi-staged rear diffuser, camera stalks, dash
  // ---------------------------------------------------------------------------
  const trimParts = [
    // Front carbon splitter
    { geo: box(1.36, 0.022, 0.32, [0, 0.155, 1.82]) },
    { geo: box(0.024, 0.06, 0.20, [0.68, 0.18, 1.82]) },
    { geo: box(0.024, 0.06, 0.20, [-0.68, 0.18, 1.82]) },

    // Side aero rocker panels / skirts
    { geo: box(0.036, 0.032, 1.66, [0.83, 0.18, 0.05]) },
    { geo: box(0.036, 0.032, 1.66, [-0.83, 0.18, 0.05]) },

    // Rear multi-staged aerodynamic diffuser undertray
    { geo: box(1.24, 0.028, 0.38, [0, 0.17, -1.42], [-0.14, 0, 0]) },
    // 4 vertical diffuser strakes
    { geo: box(0.016, 0.08, 0.34, [-0.42, 0.17, -1.42], [-0.14, 0, 0]) },
    { geo: box(0.016, 0.08, 0.34, [-0.14, 0.17, -1.42], [-0.14, 0, 0]) },
    { geo: box(0.016, 0.08, 0.34, [0.14, 0.17, -1.42], [-0.14, 0, 0]) },
    { geo: box(0.016, 0.08, 0.34, [0.42, 0.17, -1.42], [-0.14, 0, 0]) },

    // Minimalist aero side camera stalks (Roadster digital mirrors)
    { geo: box(0.12, 0.022, 0.06, [0.66, 0.62, 0.52], [0, 0.12, 0.10]) },
    { geo: box(0.12, 0.022, 0.06, [-0.66, 0.62, 0.52], [0, -0.12, -0.10]) },

    // Interior minimalist dashboard
    { geo: box(0.92, 0.055, 0.22, [0, 0.56, 0.30]) },
    // Center Tesla tablet touchscreen display
    { geo: box(0.16, 0.22, 0.014, [0, 0.50, 0.22], [0.32, 0, 0]) },
  ];

  // ---------------------------------------------------------------------------
  // 5. Signature Headlights (Predator Slit LED Strips & Angle Eyebrows)
  // ---------------------------------------------------------------------------
  const lampParts = [
    // Left & right main LED projector strips
    { geo: box(0.18, 0.024, 0.15, [0.55, 0.33, 1.64], [0.15, -0.32, 0.12]) },
    { geo: box(0.18, 0.024, 0.15, [-0.55, 0.33, 1.64], [0.15, 0.32, -0.12]) },
    // Left & right LED DRL eyebrow sweeps
    { geo: box(0.14, 0.012, 0.17, [0.60, 0.35, 1.58], [0.12, -0.28, 0.14]) },
    { geo: box(0.14, 0.012, 0.17, [-0.60, 0.35, 1.58], [0.12, 0.28, -0.14]) },
  ];

  // ---------------------------------------------------------------------------
  // 6. Signature Tail Light (Full-width continuous LED blade & CHMSL)
  // ---------------------------------------------------------------------------
  const tailLightParts = [
    // Continuous full-width rear blade LED bar
    { geo: box(1.34, 0.024, 0.04, [0, 0.53, -1.545]) },
    // Outer downward edge accent ticks
    { geo: box(0.024, 0.08, 0.04, [0.67, 0.49, -1.545]) },
    { geo: box(0.024, 0.08, 0.04, [-0.67, 0.49, -1.545]) },
    // High-mount third brake light (CHMSL) atop the rear deck
    { geo: box(0.28, 0.014, 0.02, [0, 0.61, -1.15]) },
  ];

  // ---------------------------------------------------------------------------
  // 7. Futuristic Tesla Aerospace Yoke Steering Wheel
  // Twin hand-grips, bottom flat bar, minimalist center hub
  // ---------------------------------------------------------------------------
  const yokeParts = [
    { geo: box(0.12, 0.038, 0.02, [0, 0, 0]) }, // center hub
    { geo: box(0.024, 0.11, 0.02, [-0.07, 0.01, 0]) }, // left hand grip
    { geo: box(0.024, 0.11, 0.02, [0.07, 0.01, 0]) }, // right hand grip
    { geo: box(0.15, 0.022, 0.02, [0, -0.045, 0]) }, // bottom grip connecting bar
  ];

  cache = {
    body: mergeParts(bodyParts),
    trim: mergeParts(trimParts),
    glass: loft(canopy, 16),
    lamps: mergeParts(lampParts),
    tailLight: mergeParts(tailLightParts),
    yoke: mergeParts(yokeParts),
  };

  return cache;
}
