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

/** Street car: same footprint, squarer wheel set. */
export const STREET_WHEELS: WheelSpec[] = [
  { x: 0.8, y: 0.33, z: 1.0, radius: 0.33, width: 0.27, front: true, left: true },
  { x: -0.8, y: 0.33, z: 1.0, radius: 0.33, width: 0.27, front: true, left: false },
  { x: 0.8, y: 0.34, z: -0.98, radius: 0.34, width: 0.32, front: false, left: true },
  { x: -0.8, y: 0.34, z: -0.98, radius: 0.34, width: 0.32, front: false, left: false },
];

// --- Camera anchors (car-local, unscaled) ---------------------------------
/** Driver eye point, just behind/above the helmet visor, under the halo's front arch. */
export const COCKPIT_EYE: [number, number, number] = [0, 0.74, 0.12];
/** Nose / bonnet camera: on top of the nose cone, looking forward. */
export const NOSE_CAM: [number, number, number] = [0, 0.52, 1.5];
/** T-cam: on top of the airbox. */
export const TCAM: [number, number, number] = [0, 1.02, -0.3];

/** Street car equivalents (supercar cabin is lower and further back). */
export const STREET_COCKPIT_EYE: [number, number, number] = [0.2, 0.62, -0.05];
export const STREET_NOSE_CAM: [number, number, number] = [0, 0.5, 1.45];
export const STREET_TCAM: [number, number, number] = [0, 0.84, -0.25];

export const CAR_HEIGHT = 1.05;
