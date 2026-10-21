import * as THREE from 'three';
import {
  box,
  crease,
  ellipsoid,
  loft,
  mergeParts,
  normalize,
  planProfile,
  rrectShape,
  sideProfile,
  strut,
  wingElement,
  xform,
  applyUv,
  type Station,
  type UvMode,
  type WingStation,
} from './geom';
import { F1_WHEELS } from './dimensions';

/**
 * Modern (2022-regs) F1 car, built once at module scope and shared by every car.
 * Four merged geometries -> four draw calls (+ wheels):
 *   body    : livery-textured paint (fuselage, engine cover, sidepods, endplates, helmet...)
 *   carbon  : black carbon / metal (floor, wings, halo, suspension, cockpit...)
 *   flap    : the DRS flap, origin on its hinge line
 *   wheel   : steering wheel (rotates)
 *   light   : rear rain/brake LED
 */

const RING: UvMode = { kind: 'ring' };
const SIDE: UvMode = { kind: 'side' };
const BODY: UvMode = { kind: 'patch', patch: 'body' };
const ACCENT: UvMode = { kind: 'patch', patch: 'accent' };
const DARK: UvMode = { kind: 'patch', patch: 'dark' };

type Pt = [number, number];

/** Section from bottom/top heights rather than centre/half-height. */
function S(z: number, yb: number, yt: number, w: number, extra: Partial<Station> = {}): Station {
  return { z, cy: (yb + yt) / 2, h: (yt - yb) / 2, w, n: 2.6, bw: 0.82, ...extra };
}

/** Wing planform: list of [x, y, z] leading-edge points sharing chord/pitch. */
function planform(pts: [number, number, number][], chord: number, pitch: number): WingStation[] {
  return pts.map(([x, y, z]) => ({ x, y, z, chord, pitch }));
}

export interface F1Geometries {
  body: THREE.BufferGeometry;
  carbon: THREE.BufferGeometry;
  flap: THREE.BufferGeometry;
  steeringWheel: THREE.BufferGeometry;
  brakeLight: THREE.BufferGeometry;
  /** DRS hinge position in car space */
  flapPivot: [number, number, number];
}

function buildBody() {
  const parts: { geo: THREE.BufferGeometry; uv: UvMode }[] = [];
  const add = (geo: THREE.BufferGeometry, uv: UvMode) => parts.push({ geo, uv });

  // Fuselage: anteater nose -> monocoque -> tapering tail.
  add(
    loft(
      [
        S(1.95, 0.165, 0.235, 0.03, { n: 2.2 }),
        S(1.75, 0.16, 0.27, 0.055, { n: 2.2 }),
        S(1.45, 0.15, 0.31, 0.09),
        S(1.1, 0.12, 0.37, 0.14),
        S(0.8, 0.11, 0.45, 0.2),
        S(0.5, 0.11, 0.52, 0.25),
        S(0.15, 0.11, 0.55, 0.27),
        S(-0.2, 0.11, 0.555, 0.27),
        S(-0.55, 0.1, 0.53, 0.24),
        S(-0.95, 0.1, 0.44, 0.15),
        S(-1.3, 0.12, 0.34, 0.07),
      ],
      14,
    ),
    RING,
  );

  // Airbox + engine cover, ending in a tapered tail.
  add(
    loft(
      [
        S(-0.1, 0.47, 0.74, 0.15, { n: 2.8, bw: 1 }),
        S(-0.35, 0.46, 0.83, 0.165, { n: 2.8, bw: 1 }),
        S(-0.65, 0.4, 0.72, 0.155, { bw: 1 }),
        S(-0.95, 0.31, 0.57, 0.12, { bw: 1 }),
        S(-1.2, 0.26, 0.45, 0.085, { bw: 1 }),
        S(-1.47, 0.25, 0.37, 0.045, { bw: 1 }),
      ],
      12,
    ),
    RING,
  );

  // Sidepods with undercut + coke-bottle taper.
  for (const s of [-1, 1]) {
    add(
      loft(
        [
          S(0.38, 0.17, 0.36, 0.09, { cx: s * 0.33, bw: 0.65 }),
          S(0.2, 0.13, 0.42, 0.17, { cx: s * 0.38, bw: 0.62 }),
          S(-0.15, 0.12, 0.5, 0.2, { cx: s * 0.42, bw: 0.58 }),
          S(-0.55, 0.12, 0.47, 0.19, { cx: s * 0.41, bw: 0.6 }),
          S(-0.95, 0.12, 0.38, 0.13, { cx: s * 0.33, bw: 0.7 }),
          S(-1.3, 0.13, 0.3, 0.07, { cx: s * 0.22, bw: 0.8 }),
        ],
        12,
      ),
      SIDE,
    );
  }

  // Shark fin.
  add(sideProfile([[-0.45, 0.85], [-1.45, 0.42], [-1.45, 0.34], [-0.45, 0.7]], 0.024, 0, 0.003), BODY);

  // Cockpit coaming (ring with an opening).
  const outer = rrectShape(0.4, 0.66, 0.16);
  const hole = rrectShape(0.27, 0.52, 0.11);
  outer.holes.push(new THREE.Path(hole.getPoints(6)));
  const coaming = planProfile(outer, 0.06, 0.6, 0.006);
  coaming.translate(0, 0, 0.16);
  add(coaming, BODY);

  // Helmet in accent colour.
  add(ellipsoid(0.085, 0.092, 0.1, [0, 0.64, 0.1], 12, 9), ACCENT);

  // Mirrors.
  for (const s of [-1, 1]) add(ellipsoid(0.07, 0.04, 0.034, [s * 0.4, 0.635, 0.32], 8, 6), BODY);

  // Rear wing endplates.
  for (const s of [-1, 1]) {
    add(sideProfile([[-1.2, 0.76], [-1.22, 1.06], [-1.55, 1.06], [-1.55, 0.66], [-1.4, 0.66]], 0.02, s * 0.575, 0.004), BODY);
  }
  // Front wing endplates.
  for (const s of [-1, 1]) {
    add(sideProfile([[1.94, 0.045], [1.94, 0.11], [1.79, 0.28], [1.55, 0.3], [1.52, 0.16], [1.6, 0.045]], 0.022, s * 0.875, 0.004), BODY);
  }
  // Upper front-wing flaps carry the accent colour.
  const frontFlaps = [
    wingElement(
      planform([[-0.84, 0.215, 1.57], [-0.6, 0.185, 1.66], [-0.25, 0.165, 1.73], [0.25, 0.165, 1.73], [0.6, 0.185, 1.66], [0.84, 0.215, 1.57]], 0.21, 20),
      0.06,
      0.08,
    ),
    wingElement(
      planform([[-0.82, 0.275, 1.48], [-0.58, 0.245, 1.57], [-0.25, 0.225, 1.64], [0.25, 0.225, 1.64], [0.58, 0.245, 1.57], [0.82, 0.275, 1.48]], 0.18, 28),
      0.05,
      0.08,
    ),
  ];
  for (const f of frontFlaps) add(f, ACCENT);

  return mergeParts(parts);
}

function buildCarbon() {
  const parts: { geo: THREE.BufferGeometry; uv: UvMode }[] = [];
  const add = (geo: THREE.BufferGeometry) => parts.push({ geo, uv: DARK });

  // Floor
  const floorPts: Pt[] = [
    [-0.3, 0.92], [0.3, 0.92], [0.5, 0.66], [0.64, 0.4], [0.64, -0.55], [0.58, -0.8], [0.46, -0.96],
    [-0.46, -0.96], [-0.58, -0.8], [-0.64, -0.55], [-0.64, 0.4], [-0.5, 0.66],
  ];
  add(planProfile(floorPts, 0.028, 0.108, 0.004));
  // Floor edge wings
  for (const s of [-1, 1]) {
    add(sideProfile([[0.42, 0.1], [0.34, 0.17], [-0.2, 0.2], [-0.7, 0.165], [-0.85, 0.1]], 0.014, s * 0.635, 0));
  }
  // Diffuser ramp + strakes
  add(sideProfile([[-0.94, 0.085], [-1.48, 0.27], [-1.48, 0.31], [-0.94, 0.13]], 0.86, 0, 0.003));
  for (const x of [-0.3, -0.15, 0.15, 0.3]) add(sideProfile([[-0.98, 0.06], [-1.48, 0.2], [-1.48, 0.3], [-0.98, 0.12]], 0.008, x, 0));
  // Bargeboards / turning vanes
  for (const s of [-1, 1]) {
    add(sideProfile([[0.72, 0.11], [0.66, 0.31], [0.4, 0.35], [0.36, 0.11]], 0.012, s * 0.585, 0));
    add(sideProfile([[0.62, 0.11], [0.57, 0.27], [0.4, 0.3], [0.38, 0.11]], 0.012, s * 0.53, 0));
  }
  // Beam wing (two elements) + rear wing main plane + pylon
  add(wingElement(planform([[-0.38, 0.45, -1.28], [0, 0.45, -1.28], [0.38, 0.45, -1.28]], 0.16, 8), 0.06, 0.09));
  add(wingElement(planform([[-0.36, 0.52, -1.32], [0, 0.52, -1.32], [0.36, 0.52, -1.32]], 0.14, 16), 0.06, 0.09));
  add(wingElement(planform([[-0.56, 0.84, -1.27], [0.56, 0.84, -1.27]], 0.21, 14), 0.07, 0.1));
  add(sideProfile([[-1.3, 0.3], [-1.45, 0.3], [-1.4, 0.87], [-1.33, 0.87]], 0.05, 0, 0.003));
  // Front wing main plane + first flap
  add(wingElement(planform([[-0.86, 0.125, 1.8], [-0.6, 0.095, 1.89], [-0.25, 0.08, 1.95], [0.25, 0.08, 1.95], [0.6, 0.095, 1.89], [0.86, 0.125, 1.8]], 0.3, 4), 0.07, 0.09));
  add(wingElement(planform([[-0.85, 0.17, 1.66], [-0.6, 0.14, 1.75], [-0.25, 0.125, 1.82], [0.25, 0.125, 1.82], [0.6, 0.14, 1.75], [0.85, 0.17, 1.66]], 0.24, 12), 0.06, 0.08));
  // Nose pylons
  for (const s of [-1, 1]) add(sideProfile([[1.55, 0.215], [1.82, 0.185], [1.82, 0.1], [1.66, 0.1]], 0.03, s * 0.055, 0.003));

  // Intakes: airbox mouth and sidepod inlets
  add(ellipsoid(0.105, 0.11, 0.035, [0, 0.61, -0.1], 10, 7));
  for (const s of [-1, 1]) add(ellipsoid(0.07, 0.085, 0.03, [s * 0.33, 0.265, 0.385], 8, 6));

  // Cockpit liner, seat + driver visor
  const liner = planProfile(rrectShape(0.29, 0.54, 0.12), 0.03, 0.566, 0.002);
  liner.translate(0, 0, 0.16);
  add(liner);
  add(box(0.2, 0.2, 0.05, [0, 0.6, -0.04]));
  add(ellipsoid(0.07, 0.036, 0.04, [0, 0.655, 0.18], 8, 6));

  // Halo: U-shaped hoop + central pillar.
  const halo = new THREE.CatmullRomCurve3(
    [
      [-0.2, 0.5, -0.14], [-0.208, 0.6, -0.07], [-0.19, 0.685, 0.1], [-0.14, 0.74, 0.3], [-0.06, 0.765, 0.42],
      [0, 0.77, 0.45],
      [0.06, 0.765, 0.42], [0.14, 0.74, 0.3], [0.19, 0.685, 0.1], [0.208, 0.6, -0.07], [0.2, 0.5, -0.14],
    ].map(([x, y, z]) => new THREE.Vector3(x, y, z)),
  );
  add(new THREE.TubeGeometry(halo, 26, 0.019, 6, false));
  add(strut([0, 0.77, 0.45], [0, 0.53, 0.54], 0.022, 6));

  // Mirror stalks
  for (const s of [-1, 1]) add(strut([s * 0.24, 0.56, 0.33], [s * 0.38, 0.63, 0.32], 0.01, 4));

  // Suspension: wishbones, pushrods, tie rods.
  const arm = (a: [number, number, number], b: [number, number, number]) => add(strut(a, b, 0.0095, 4));
  for (const w of F1_WHEELS) {
    const s = w.left ? 1 : -1;
    const hx = s * (w.x < 0 ? -w.x : w.x) * 0.83; // inner face region of the tyre
    const hz = w.z;
    if (w.front) {
      arm([s * 0.15, 0.42, hz - 0.14], [hx, 0.4, hz]);
      arm([s * 0.15, 0.42, hz + 0.14], [hx, 0.4, hz]);
      arm([s * 0.15, 0.2, hz - 0.17], [hx, 0.22, hz]);
      arm([s * 0.15, 0.2, hz + 0.17], [hx, 0.22, hz]);
      arm([hx, 0.45, hz], [s * 0.1, 0.48, hz - 0.1]);
      arm([s * 0.15, 0.3, hz - 0.1], [hx, 0.3, hz + 0.1]);
    } else {
      arm([s * 0.14, 0.36, hz + 0.18], [hx, 0.46, hz]);
      arm([s * 0.14, 0.36, hz - 0.17], [hx, 0.46, hz]);
      arm([s * 0.14, 0.17, hz + 0.18], [hx, 0.25, hz]);
      arm([s * 0.14, 0.17, hz - 0.17], [hx, 0.25, hz]);
      arm([hx, 0.5, hz], [s * 0.1, 0.44, hz - 0.1]);
    }
  }

  return mergeParts(parts);
}

function buildFlap() {
  // Hinge on the flap's leading third; DRS rotates the whole piece about x.
  const flap = wingElement(planform([[-0.545, 0, 0.07], [0.545, 0, 0.07]], 0.19, 0), 0.05, 0.08);
  return mergeParts([{ geo: flap, uv: ACCENT }]);
}

function buildSteeringWheel() {
  const g = new THREE.ExtrudeGeometry(rrectShape(0.19, 0.1, 0.035), {
    depth: 0.02,
    bevelEnabled: true,
    bevelThickness: 0.006,
    bevelSize: 0.006,
    bevelSegments: 1,
    curveSegments: 3,
  });
  g.translate(0, 0, -0.01);
  return mergeParts([{ geo: crease(g, 50), uv: DARK }]);
}

function buildBrakeLight() {
  const g = new THREE.ExtrudeGeometry(rrectShape(0.13, 0.06, 0.02), {
    depth: 0.012,
    bevelEnabled: false,
    curveSegments: 3,
  });
  g.rotateY(Math.PI); // face the rear
  const out = normalize(g);
  applyUv(out, DARK);
  return out;
}

let cached: F1Geometries | null = null;

export function getF1Geometries(): F1Geometries {
  if (cached) return cached;
  cached = {
    body: buildBody(),
    carbon: buildCarbon(),
    flap: buildFlap(),
    steeringWheel: buildSteeringWheel(),
    brakeLight: buildBrakeLight(),
    flapPivot: [0, 0.99, -1.31],
  };
  return cached;
}

export { xform };
