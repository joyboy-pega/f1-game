/**
 * Car-local, unscaled dimensions shared by the models and the camera workstream.
 * Local frame: +z = nose, +x = car's left, +y = up. Multiply by CAR_SCALE for world units.
 */

export interface WheelSpec {
  /** hub centre */
  x: number;
  y: number;
  z: number;
  /** tyre outer radius / total width */
  radius: number;
  width: number;
  front: boolean;
  left: boolean;
}

export const FRONT_AXLE = { z: 0.9, x: 0.82, radius: 0.32, width: 0.3 };
export const REAR_AXLE = { z: -0.98, x: 0.86, radius: 0.36, width: 0.38 };

export const F1_WHEELS: WheelSpec[] = [
  { x: FRONT_AXLE.x, y: FRONT_AXLE.radius, z: FRONT_AXLE.z, radius: FRONT_AXLE.radius, width: FRONT_AXLE.width, front: true, left: true },
  { x: -FRONT_AXLE.x, y: FRONT_AXLE.radius, z: FRONT_AXLE.z, radius: FRONT_AXLE.radius, width: FRONT_AXLE.width, front: true, left: false },
  { x: REAR_AXLE.x, y: REAR_AXLE.radius, z: REAR_AXLE.z, radius: REAR_AXLE.radius, width: REAR_AXLE.width, front: false, left: true },
  { x: -REAR_AXLE.x, y: REAR_AXLE.radius, z: REAR_AXLE.z, radius: REAR_AXLE.radius, width: REAR_AXLE.width, front: false, left: false },
];

/** Tesla Roadster wheels: wide electric hypercar stagger (20" front, 21" rear equivalent). */
export const ROADSTER_WHEELS: WheelSpec[] = [
  { x: 0.82, y: 0.33, z: 1.05, radius: 0.33, width: 0.28, front: true, left: true },
  { x: -0.82, y: 0.33, z: 1.05, radius: 0.33, width: 0.28, front: true, left: false },
  { x: 0.84, y: 0.35, z: -1.0, radius: 0.35, width: 0.34, front: false, left: true },
  { x: -0.84, y: 0.35, z: -1.0, radius: 0.35, width: 0.34, front: false, left: false },
];

/** Formula Student Pegasus #53 wheels (13" rims, wide racing slicks). */
export const PEGASUS_WHEELS: WheelSpec[] = [
  { x: 0.65, y: 0.265, z: 0.82, radius: 0.265, width: 0.21, front: true, left: true },
  { x: -0.65, y: 0.265, z: 0.82, radius: 0.265, width: 0.21, front: true, left: false },
  { x: 0.67, y: 0.285, z: -0.98, radius: 0.285, width: 0.25, front: false, left: true },
  { x: -0.67, y: 0.285, z: -0.98, radius: 0.285, width: 0.25, front: false, left: false },
];

// --- Camera anchors (car-local, unscaled) ---------------------------------
/** Driver eye point, just behind/above the helmet visor, under the halo's front arch. */
export const COCKPIT_EYE: [number, number, number] = [0, 0.74, 0.12];
/** Nose / bonnet camera: on top of the nose cone, looking forward. */
export const NOSE_CAM: [number, number, number] = [0, 0.52, 1.5];
/** T-cam: on top of the airbox. */
export const TCAM: [number, number, number] = [0, 1.02, -0.3];

/** Tesla Roadster camera anchors (low-slung sports cabin, sleek raked windshield). */
export const ROADSTER_COCKPIT_EYE: [number, number, number] = [0.22, 0.62, -0.05];
export const ROADSTER_NOSE_CAM: [number, number, number] = [0, 0.48, 1.55];
export const ROADSTER_TCAM: [number, number, number] = [0, 0.85, -0.22];

/** Pegasus #53 camera anchors */
export const PEGASUS_COCKPIT_EYE: [number, number, number] = [0, 0.82, -0.02];
export const PEGASUS_NOSE_CAM: [number, number, number] = [0, 0.44, 1.45];
export const PEGASUS_TCAM: [number, number, number] = [0, 1.28, -0.36];

export const CAR_HEIGHT = 1.05;

// Car-to-car collision circles in unscaled model units, derived from axle positions and tyre outer bounds.
export const COLLISION_OFFSETS_UNSCALED = [
  REAR_AXLE.z,
  (FRONT_AXLE.z + REAR_AXLE.z) * 0.5 + 0.1,
  FRONT_AXLE.z + 0.35,
];
export const COLLISION_RADIUS_UNSCALED = 0.72;

