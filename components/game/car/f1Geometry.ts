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
 * 2026-Regulations Formula 1 Car Procedural Generator.
 * Features:
 *  - Accurate 2026 nimble-car aero (narrower 1800mm front wing, active-aero Z/X-mode flaps,
 *    no beam wing, twin swan-neck rear pylons, floor fences, deep undercut sidepods).
 *  - Watertight visual joints: wheel hub uprights/brake ducts, suspension clevis mounts,
 *    halo fairings, T-cam pod, twin-stay aero mirrors, and multi-grip F1 steering wheel.
 *  - Optimized polygon distribution & creased normals for smooth bodywork and crisp aero edges.
 */

const RING: UvMode = { kind: 'ring' };
const SIDE: UvMode = { kind: 'side' };
const BODY: UvMode = { kind: 'patch', patch: 'body' };
const ACCENT: UvMode = { kind: 'patch', patch: 'accent' };
const DARK: UvMode = { kind: 'patch', patch: 'dark' };

type Pt = [number, number];

/** Section helper from bottom (yb) and top (yt) heights rather than centre/half-height. */
function S(z: number, yb: number, yt: number, w: number, extra: Partial<Station> = {}): Station {
  return { z, cy: (yb + yt) / 2, h: (yt - yb) / 2, w, n: 2.5, bw: 0.84, ...extra };
}

/** Wing planform: list of [x, y, z] leading-edge points sharing chord/pitch. */
function planform(pts: [number, number, number][], chord: number, pitch: number): WingStation[] {
  return pts.map(([x, y, z]) => ({ x, y, z, chord, pitch }));
}

/** Variable-chord/pitch wing planform for 3D twisted elements. */
function twistedPlanform(pts: [number, number, number, number, number][]): WingStation[] {
  return pts.map(([x, y, z, chord, pitch]) => ({ x, y, z, chord, pitch }));
}

export interface F1Geometries {
  body: THREE.BufferGeometry;
  carbon: THREE.BufferGeometry;
  flap: THREE.BufferGeometry;
  steeringWheel: THREE.BufferGeometry;
  brakeLight: THREE.BufferGeometry;
  /** DRS / Active-Aero rear flap hinge position in car space */
  flapPivot: [number, number, number];
}

function buildBody(): THREE.BufferGeometry {
  const parts: { geo: THREE.BufferGeometry; uv: UvMode }[] = [];
  const add = (geo: THREE.BufferGeometry, uv: UvMode, angle = 42) =>
    parts.push({ geo: crease(geo, angle), uv });

  // 1. 2026 FUSELAGE & MONOCOQUE
  // Elevated 2026 nose tip -> sculpted bulkhead -> cockpit tub -> gearbox taper
  add(
    loft(
      [
        S(1.88, 0.215, 0.265, 0.038, { n: 2.2, bw: 0.92 }),
        S(1.72, 0.205, 0.295, 0.068, { n: 2.3, bw: 0.9 }),
        S(1.48, 0.19, 0.35, 0.105, { n: 2.4, bw: 0.88 }),
        S(1.2, 0.155, 0.425, 0.15, { n: 2.6, bw: 0.86 }),
        S(0.92, 0.125, 0.495, 0.195, { n: 2.8, bw: 0.85 }),
        S(0.62, 0.11, 0.545, 0.245, { n: 2.8, bw: 0.84 }),
        S(0.32, 0.105, 0.56, 0.275, { n: 2.7, bw: 0.84 }),
        S(0.0, 0.105, 0.565, 0.28, { n: 2.6, bw: 0.84 }),
        S(-0.32, 0.105, 0.55, 0.255, { n: 2.5, bw: 0.82 }),
        S(-0.68, 0.105, 0.49, 0.19, { n: 2.4, bw: 0.8 }),
        S(-1.02, 0.11, 0.41, 0.12, { n: 2.3, bw: 0.78 }),
        S(-1.35, 0.125, 0.33, 0.065, { n: 2.2, bw: 0.75 }),
      ],
      18,
    ),
    RING,
    48,
  );

  // 2. ROLL HOOP, AIRBOX & ENGINE COVER SPINE (with 2026 cooling cannon shelf)
  add(
    loft(
      [
        S(-0.06, 0.52, 0.77, 0.125, { n: 2.4, bw: 0.95 }),
        S(-0.18, 0.5, 0.865, 0.155, { n: 2.6, bw: 0.95 }),
        S(-0.38, 0.47, 0.845, 0.16, { n: 2.6, bw: 0.92 }),
        S(-0.65, 0.41, 0.745, 0.145, { n: 2.5, bw: 0.9 }),
        S(-0.92, 0.34, 0.62, 0.115, { n: 2.4, bw: 0.88 }),
        S(-1.18, 0.28, 0.48, 0.08, { n: 2.3, bw: 0.85 }),
        S(-1.44, 0.25, 0.37, 0.042, { n: 2.1, bw: 0.82 }),
      ],
      16,
    ),
    RING,
    48,
  );

  // 3. 2026 DEEP-UNDERCUT SIDEPODS (High-lip overbite + extreme coke-bottle)
  for (const s of [-1, 1]) {
    add(
      loft(
        [
          // Forward high-lip overbite
          S(0.46, 0.29, 0.475, 0.135, { cx: s * 0.36, n: 2.8, bw: 0.75 }),
          // Main inlet face & deep undercut belly
          S(0.32, 0.16, 0.495, 0.185, { cx: s * 0.4, n: 2.6, bw: 0.58 }),
          // Maximum shoulder width with downwash water-slide contour
          S(0.05, 0.125, 0.51, 0.215, { cx: s * 0.435, n: 2.4, bw: 0.54 }),
          S(-0.28, 0.12, 0.485, 0.205, { cx: s * 0.42, n: 2.3, bw: 0.56 }),
          // Coke-bottle sweep inward + downwash ramp
          S(-0.62, 0.12, 0.43, 0.175, { cx: s * 0.355, n: 2.3, bw: 0.64 }),
          S(-0.96, 0.125, 0.365, 0.125, { cx: s * 0.265, n: 2.2, bw: 0.72 }),
          // Tight gearbox merge so no open seam exists at the rear
          S(-1.28, 0.135, 0.31, 0.07, { cx: s * 0.15, n: 2.1, bw: 0.8 }),
        ],
        16,
      ),
      SIDE,
      48,
    );
  }

  // 4. 2026 SCULPTED SHARK FIN (Bridges airbox spine cleanly to rear wing pylon)
  add(
    sideProfile(
      [
        [-0.32, 0.85],
        [-0.55, 0.83],
        [-1.08, 0.68],
        [-1.32, 0.56],
        [-1.38, 0.41],
        [-0.32, 0.68],
      ],
      0.018,
      0,
      0.003,
    ),
    ACCENT,
    35,
  );

  // 5. COCKPIT COAMING & FIA HEADREST COLLAR (Flush overlap into monocoque)
  const outer = rrectShape(0.41, 0.68, 0.16);
  const hole = rrectShape(0.275, 0.53, 0.11);
  outer.holes.push(new THREE.Path(hole.getPoints(8)));
  // Bottom sits below the tub roof (0.565) so the rim grows out of the monocoque; at 0.59 it
  // hovered above it as a separate ring.
  const coaming = planProfile(outer, 0.06, 0.535, 0.008);
  coaming.translate(0, 0, 0.155);
  add(coaming, BODY, 45);

  // Driver Helmet + Aero Crown Spoiler
  add(ellipsoid(0.088, 0.096, 0.106, [0, 0.635, 0.09], 14, 10), ACCENT, 55);
  add(box(0.09, 0.025, 0.06, [0, 0.695, 0.025]), ACCENT, 35);

  // 6. AERO MIRRORS (Housing with recessed glass cavity)
  for (const s of [-1, 1]) {
    add(
      wingElement(
        planform(
          [
            [s * 0.36, 0.63, 0.33],
            [s * 0.45, 0.632, 0.315],
          ],
          0.065,
          4,
        ),
        0.042,
        0.06,
      ),
      BODY,
      40,
    );
  }

  // 7. 2026 FRONT WING ENDPLATES & FOOTPLATES (1800mm narrower span: x = ±0.865)
  for (const s of [-1, 1]) {
    // Curved vertical endplate
    add(
      sideProfile(
        [
          [1.92, 0.055],
          [1.92, 0.135],
          [1.81, 0.285],
          [1.56, 0.315],
          [1.48, 0.25],
          [1.52, 0.055],
        ],
        0.018,
        s * 0.855,
        0.004,
      ),
      BODY,
      35,
    );
    // Outwash diveplane canard on outside of endplate
    add(
      wingElement(
        planform(
          [
            [s * 0.862, 0.19, 1.74],
            [s * 0.905, 0.205, 1.66],
          ],
          0.14,
          16,
        ),
        0.035,
        0.05,
      ),
      ACCENT,
      35,
    );
  }

  // 8. 2026 ACTIVE-AERO UPPER FRONT WING FLAPS (2 movable upper elements)
  const frontFlaps = [
    wingElement(
      twistedPlanform([
        [-0.845, 0.185, 1.63, 0.18, 16],
        [-0.56, 0.16, 1.71, 0.195, 18],
        [-0.18, 0.145, 1.77, 0.2, 14],
        [0.18, 0.145, 1.77, 0.2, 14],
        [0.56, 0.16, 1.71, 0.195, 18],
        [0.845, 0.185, 1.63, 0.18, 16],
      ]),
      0.032,
      0.075,
    ),
    wingElement(
      twistedPlanform([
        [-0.845, 0.24, 1.54, 0.16, 25],
        [-0.55, 0.215, 1.62, 0.175, 27],
        [-0.18, 0.195, 1.68, 0.17, 22],
        [0.18, 0.195, 1.68, 0.17, 22],
        [0.55, 0.215, 1.62, 0.175, 27],
        [0.845, 0.24, 1.54, 0.16, 25],
      ]),
      0.03,
      0.07,
    ),
  ];
  for (const f of frontFlaps) add(f, ACCENT, 40);

  // 9. 2026 REAR WING ENDPLATES (Integrated flow-transition shoulders)
  for (const s of [-1, 1]) {
    add(
      sideProfile(
        [
          [-1.16, 0.76],
          [-1.17, 0.98],
          [-1.54, 0.98],
          [-1.56, 0.84],
          [-1.5, 0.6],
          [-1.32, 0.6],
        ],
        0.018,
        s * 0.535,
        0.004,
      ),
      BODY,
      35,
    );
  }

  return mergeParts(parts);
}

function buildCarbon(): THREE.BufferGeometry {
  const parts: { geo: THREE.BufferGeometry; uv: UvMode }[] = [];
  const add = (geo: THREE.BufferGeometry, angle = 40) =>
    parts.push({ geo: crease(geo, angle), uv: DARK });

  // 1. 2026 VENTURI FLOOR, T-TRAY BIB & REAR DIFFUSER
  const floorPts: Pt[] = [
    [-0.14, 1.12], // T-tray splitter tip
    [0.14, 1.12],
    [0.24, 0.88],
    [0.58, 0.56], // 2026 narrower 1900mm floor corner
    [0.61, 0.35],
    [0.61, -0.52],
    [0.54, -0.82], // Tyre boat-tail cut
    [0.44, -1.04],
    [-0.44, -1.04],
    [-0.54, -0.82],
    [-0.61, -0.52],
    [-0.61, 0.35],
    [-0.58, 0.56],
    [-0.24, 0.88],
  ];
  add(planProfile(floorPts, 0.026, 0.095, 0.004), 35);

  // T-tray stay & plank keel
  add(strut([0, 0.095, 1.06], [0, 0.175, 1.02], 0.009, 5));
  add(box(0.28, 0.015, 1.85, [0, 0.068, 0.05]));

  // 2026 In-washing Floor Fences (3 strakes per side at Venturi inlet)
  for (const s of [-1, 1]) {
    for (const [xOff, zLead] of [
      [0.36, 0.58],
      [0.45, 0.54],
      [0.54, 0.5],
    ]) {
      add(
        sideProfile(
          [
            [zLead, 0.065],
            [zLead - 0.04, 0.165],
            [0.22, 0.15],
            [0.2, 0.065],
          ],
          0.008,
          s * xOff,
          0,
        ),
      );
    }
    // 2026 sculpted floor edge wing + vortex scroll
    add(
      sideProfile(
        [
          [0.36, 0.085],
          [0.28, 0.145],
          [-0.25, 0.155],
          [-0.68, 0.135],
          [-0.82, 0.085],
        ],
        0.016,
        s * 0.612,
        0.002,
      ),
    );
  }

  // Diffuser tunnel roof + 6 vertical Venturi strakes + rear crash structure
  add(
    sideProfile(
      [
        [-0.92, 0.075],
        [-1.49, 0.285],
        [-1.49, 0.32],
        [-0.92, 0.115],
      ],
      0.84,
      0,
      0.003,
    ),
  );
  for (const x of [-0.36, -0.23, -0.1, 0.1, 0.23, 0.36]) {
    add(
      sideProfile(
        [
          [-0.96, 0.055],
          [-1.49, 0.215],
          [-1.49, 0.3],
          [-0.96, 0.11],
        ],
        0.008,
        x,
        0,
      ),
    );
  }
  // Rear impact structure (houses brake light cleanly)
  add(
    loft(
      [
        S(-1.25, 0.14, 0.32, 0.068, { n: 2.2, bw: 0.9 }),
        S(-1.51, 0.19, 0.31, 0.052, { n: 2.1, bw: 0.92 }),
      ],
      10,
    ),
  );

  // 2. 2026 FRONT WING MAINPLANE, FOOTPLATES & TWIN SWAN-NECK PYLONS
  add(
    wingElement(
      twistedPlanform([
        [-0.855, 0.105, 1.73, 0.26, 2],
        [-0.56, 0.085, 1.83, 0.28, 4],
        [-0.18, 0.075, 1.91, 0.29, 3],
        [0.18, 0.075, 1.91, 0.29, 3],
        [0.56, 0.085, 1.83, 0.28, 4],
        [0.855, 0.105, 1.73, 0.26, 2],
      ]),
      0.06,
      0.085,
    ),
  );

  // Front wing footplate tunnels & Twin Nose Pylons (Joint: Nose -> Mainplane)
  for (const s of [-1, 1]) {
    add(box(0.08, 0.016, 0.38, [s * 0.835, 0.062, 1.71]));
    add(
      sideProfile(
        [
          [1.62, 0.23],
          [1.82, 0.22],
          [1.85, 0.08],
          [1.68, 0.08],
        ],
        0.022,
        s * 0.062,
        0.003,
      ),
    );
    // Active aero actuator pods on front wing
    add(ellipsoid(0.018, 0.024, 0.095, [s * 0.42, 0.165, 1.66], 8, 6));
  }

  // 3. 2026 REAR WING ASSEMBLY (Twin Swan-Neck Pylons, Mainplane, DRS Actuator Pod)
  // Note: 2026 regs eliminate the lower beam wing in favor of twin top-mount pylons
  add(
    wingElement(
      twistedPlanform([
        [-0.53, 0.8, -1.2, 0.2, 9],
        [-0.25, 0.78, -1.205, 0.205, 8],
        [0.0, 0.775, -1.21, 0.21, 8],
        [0.25, 0.78, -1.205, 0.205, 8],
        [0.53, 0.8, -1.2, 0.2, 9],
      ]),
      0.065,
      0.095,
    ),
  );
  // Twin 2026 Swan-Neck Rear Pylons bridging Rear Impact Structure -> Mainplane -> Over-hook
  for (const s of [-1, 1]) {
    add(
      sideProfile(
        [
          [-1.26, 0.28],
          [-1.38, 0.28],
          [-1.36, 0.84],
          [-1.24, 0.86],
          [-1.22, 0.79],
        ],
        0.018,
        s * 0.075,
        0.003,
      ),
    );
  }
  // Central Z-mode / DRS hydraulic actuator pod on top of rear mainplane
  add(ellipsoid(0.022, 0.03, 0.1, [0, 0.82, -1.27], 8, 6));

  // 4. INTAKES, EXHAUST, COOLING LOUVRES & T-CAM ROLL HOOP POD
  // Tri-part Airbox inlet cavity + Sidepod vertical slit inlets
  add(ellipsoid(0.092, 0.098, 0.03, [0, 0.65, -0.07], 10, 8));
  for (const s of [-1, 1]) {
    add(ellipsoid(0.082, 0.055, 0.025, [s * 0.365, 0.365, 0.445], 8, 6));
    // Sidepod cooling gill panel
    for (let i = 0; i < 4; i++) {
      add(box(0.08, 0.008, 0.025, [s * 0.34, 0.485 - i * 0.012, -0.08 - i * 0.09]));
    }
    //Twin Mirror Stays (Joint: Monocoque + Sidepod top -> Mirror housing)
    add(strut([s * 0.235, 0.555, 0.34], [s * 0.38, 0.628, 0.325], 0.009, 5));
    add(strut([s * 0.39, 0.495, 0.29], [s * 0.41, 0.625, 0.32], 0.008, 5));
  }

  // FIA T-Cam Pod & Transponder Fin on Roll Hoop — removed: this sat almost dead ahead of the
  // T-cam viewpoint (TCAM anchor in dimensions.ts, z=-0.3) at only ~1.75-2.6 world units from the
  // eye point, so the in-game T-cam looked straight at the back of its own camera housing — a
  // black mass filling most of the frame. (The real broadcast camera is recessed inside its pod,
  // so the real TV feed never sees the housing either; modelling it here only broke our own shot.)

  // Central Turbo Exhaust Tailpipe + twin Wastegate pipes
  add(strut([0, 0.36, -1.32], [0, 0.37, -1.49], 0.042, 10));
  for (const s of [-1, 1]) add(strut([s * 0.052, 0.345, -1.34], [s * 0.052, 0.355, -1.48], 0.016, 6));

  // 5. COCKPIT INTERIOR, SEAT, DRIVER VISOR & HALO WITH FAIRINGS
  // Sunk 0.02 below the coaming rim so the opening reads as a cockpit, not a flush lid. Slightly
  // smaller than the coaming's hole (0.275 x 0.53, buildBody() above) so its wall sits just inside
  // the coaming's, not outside it: the previous 0.285 x 0.54 was larger than the hole it was meant
  // to sit in, so the two walls crossed and z-fought along the whole rim.
  const liner = planProfile(rrectShape(0.265, 0.52, 0.11), 0.045, 0.53, 0.002);
  liner.translate(0, 0, 0.155);
  add(liner);
  add(box(0.22, 0.22, 0.06, [0, 0.56, -0.045])); // Carbon seat back
  add(ellipsoid(0.076, 0.038, 0.055, [0, 0.65, 0.155], 10, 6)); // Curved Helmet Visor

  // Sculpted Titanium Halo + Root Fairing Boots. The two lower leg points (y = 0.595, was 0.54)
  // land on the coaming's new top rim (coaming spans y 0.535-0.595, see above): they used to meet
  // the coaming's old, higher bottom (0.59) flush, but coaming and halo were edited independently,
  // so the legs ended up buried inside the lowered coaming — a cluster of near-coincident surfaces
  // that z-fights into a flickering black sliver over the cockpit at any camera distance.
  const haloLegY = 0.595;
  const halo = new THREE.CatmullRomCurve3(
    [
      [-0.195, haloLegY, -0.12],
      [-0.205, 0.615, -0.04],
      [-0.188, 0.685, 0.12],
      [-0.135, 0.742, 0.31],
      [-0.055, 0.768, 0.425],
      [0, 0.772, 0.455],
      [0.055, 0.768, 0.425],
      [0.135, 0.742, 0.31],
      [0.188, 0.685, 0.12],
      [0.205, 0.615, -0.04],
      [0.195, haloLegY, -0.12],
    ].map(([x, y, z]) => new THREE.Vector3(x, y, z)),
  );
  add(new THREE.TubeGeometry(halo, 30, 0.02, 8, false), 50);
  // Central Halo V-Pillar + Fairing Boot into Chassis (also re-anchored to haloLegY)
  add(strut([0, 0.77, 0.45], [0, haloLegY - 0.02, 0.545], 0.022, 8), 50);
  add(ellipsoid(0.032, 0.025, 0.065, [0, haloLegY, 0.535], 8, 6));
  for (const s of [-1, 1]) add(ellipsoid(0.028, 0.025, 0.055, [s * 0.195, haloLegY + 0.01, -0.11], 8, 6));

  // 6. FULL SKELETON SUSPENSION, CHASSIS CLEVIS JOINTS, WHEEL HUB UPRIGHTS & BRAKE DUCTS
  const arm = (a: [number, number, number], b: [number, number, number], r = 0.0105) =>
    add(strut(a, b, r, 6), 45);
  const joint = (pos: [number, number, number], rx = 0.018, ry = 0.016, rz = 0.028) =>
    add(ellipsoid(rx, ry, rz, pos, 6, 5));

  for (const w of F1_WHEELS) {
    const s = w.left ? 1 : -1;
    const absX = Math.abs(w.x);
    const hx = s * absX * 0.815; // Inner face plane of wheel hub upright
    const hz = w.z;

    if (w.front) {
      // Front Wheel Hub Upright & Brake Duct Scoop
      add(box(0.045, 0.24, 0.16, [hx, 0.31, hz])); // Upright carrier
      add(box(0.055, 0.14, 0.11, [hx - s * 0.02, 0.33, hz + 0.04])); // Carbon brake scoop

      // Upper Wishbone (Aero-faired V-arms + Chassis clevis joints + Upright balljoint)
      const uFront: [number, number, number] = [s * 0.12, 0.435, hz + 0.15];
      const uRear: [number, number, number] = [s * 0.14, 0.425, hz - 0.15];
      const uOut: [number, number, number] = [hx, 0.415, hz];
      arm(uFront, uOut, 0.011);
      arm(uRear, uOut, 0.011);
      joint(uFront);
      joint(uRear);
      joint(uOut, 0.022, 0.02, 0.025);

      // Lower Wishbone
      const lFront: [number, number, number] = [s * 0.11, 0.195, hz + 0.16];
      const lRear: [number, number, number] = [s * 0.14, 0.195, hz - 0.18];
      const lOut: [number, number, number] = [hx, 0.21, hz];
      arm(lFront, lOut, 0.0115);
      arm(lRear, lOut, 0.0115);
      joint(lFront);
      joint(lRear);
      joint(lOut, 0.022, 0.02, 0.025);

      // Pull-rod (High chassis mount -> Low upright mount) & Track/Steering Tie-Rod
      const pullIn: [number, number, number] = [s * 0.11, 0.475, hz + 0.08];
      const pullOut: [number, number, number] = [hx, 0.225, hz + 0.02];
      arm(pullIn, pullOut, 0.009);
      joint(pullIn);

      const tieIn: [number, number, number] = [s * 0.12, 0.315, hz + 0.09];
      const tieOut: [number, number, number] = [hx, 0.31, hz + 0.07];
      arm(tieIn, tieOut, 0.0095);
    } else {
      // Rear Wheel Hub Upright & Brake Cooling Drum
      add(box(0.05, 0.26, 0.18, [hx, 0.33, hz]));
      add(box(0.06, 0.15, 0.12, [hx - s * 0.02, 0.34, hz + 0.04]));

      // Rear Upper Wishbone
      const uFront: [number, number, number] = [s * 0.11, 0.39, hz + 0.19];
      const uRear: [number, number, number] = [s * 0.09, 0.38, hz - 0.16];
      const uOut: [number, number, number] = [hx, 0.44, hz];
      arm(uFront, uOut, 0.0115);
      arm(uRear, uOut, 0.0115);
      joint(uFront);
      joint(uRear);
      joint(uOut, 0.024, 0.02, 0.026);

      // Rear Lower Wishbone + Driveshaft Half-shaft
      const lFront: [number, number, number] = [s * 0.12, 0.175, hz + 0.2];
      const lRear: [number, number, number] = [s * 0.08, 0.185, hz - 0.16];
      const lOut: [number, number, number] = [hx, 0.22, hz];
      arm(lFront, lOut, 0.012);
      arm(lRear, lOut, 0.012);
      joint(lFront);
      joint(lRear);
      joint(lOut, 0.024, 0.02, 0.026);

      // Driveshaft axle (connects gearbox to wheel center)
      arm([s * 0.09, 0.32, hz], [hx, 0.33, hz], 0.016);

      // Rear Push-rod (High gearbox mount -> Low upright mount) & Toe Link
      const pushIn: [number, number, number] = [s * 0.085, 0.455, hz + 0.12];
      const pushOut: [number, number, number] = [hx, 0.235, hz + 0.02];
      arm(pushIn, pushOut, 0.0095);
      joint(pushIn);
    }
  }

  return mergeParts(parts);
}

function buildFlap(): THREE.BufferGeometry {
  // 2026 Active-Aero Rear Flap with V-notched central Gurney & Endplate Tip Cutouts
  const flap = wingElement(
    twistedPlanform([
      [-0.515, -0.01, 0.065, 0.175, 22],
      [-0.25, 0.0, 0.07, 0.185, 20],
      [0.0, 0.004, 0.072, 0.18, 19],
      [0.25, 0.0, 0.07, 0.185, 20],
      [0.515, -0.01, 0.065, 0.175, 22],
    ]),
    0.046,
    0.075,
  );
  return mergeParts([{ geo: crease(flap, 40), uv: ACCENT }]);
}

function buildSteeringWheel(): THREE.BufferGeometry {
  const parts: { geo: THREE.BufferGeometry; uv: UvMode }[] = [];
  const add = (geo: THREE.BufferGeometry, uv: UvMode) =>
    parts.push({ geo: crease(geo, 48), uv });

  // Butterfly-style F1 Wheel Chassis (flat top, twin thumb cutaways, display housing)
  const plate = new THREE.ExtrudeGeometry(rrectShape(0.205, 0.108, 0.032), {
    depth: 0.016,
    bevelEnabled: true,
    bevelThickness: 0.005,
    bevelSize: 0.005,
    bevelSegments: 2,
    curveSegments: 5,
  });
  plate.translate(0, 0, -0.008);
  add(plate, DARK);

  // Central telemetry LCD screen bezel + Quick-release steering column hub + Shift paddles
  add(box(0.095, 0.052, 0.008, [0, 0.012, 0.01]), ACCENT);
  add(strut([0, 0, -0.008], [0, -0.025, -0.14], 0.018, 8), DARK);
  for (const s of [-1, 1]) {
    add(box(0.024, 0.098, 0.022, [s * 0.09, -0.004, 0.002]), DARK); // Ergonomic side grips
    add(box(0.042, 0.048, 0.005, [s * 0.065, 0.008, -0.022]), DARK); // Carbon shift paddles
  }

  return mergeParts(parts);
}

function buildBrakeLight(): THREE.BufferGeometry {
  const parts: { geo: THREE.BufferGeometry; uv: UvMode }[] = [];

  // Central FIA Rain/ERS LED cluster + 2026 Dual Vertical Endplate Rain Lights
  const centerLight = new THREE.ExtrudeGeometry(rrectShape(0.042, 0.095, 0.014), {
    depth: 0.012,
    bevelEnabled: false,
    curveSegments: 4,
  });
  centerLight.rotateY(Math.PI);
  centerLight.translate(0, 0.25, -1.512);
  parts.push({ geo: normalize(centerLight), uv: DARK });

  for (const s of [-1, 1]) {
    const endplateLed = box(0.012, 0.16, 0.012, [s * 0.535, 0.76, -1.515]);
    parts.push({ geo: normalize(endplateLed), uv: DARK });
  }

  return mergeParts(parts);
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
    flapPivot: [0, 0.85, -1.44],
  };
  return cached;
}

export { xform };