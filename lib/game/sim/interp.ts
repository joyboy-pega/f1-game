import type { WorldCar } from './types';

/** Render-time pose of a car (sim units, radians). Reused by callers so the frame loop allocates nothing (R7). */
export interface Pose {
  x: number;
  y: number;
  a: number;
}

/**
 * One fixed step never moves a car further than ~10 units (≈1 m at 400 km/h). A bigger jump is a teleport
 * (respawn, reset, replay seek) and must not be smeared across the gap.
 */
const TELEPORT_UNITS = 60;

const TWO_PI = Math.PI * 2;

/**
 * Pose to draw: the car between its pose before the last fixed step (`prevX/Y/A`) and after it (`phys`).
 * `alpha` = accumulator / FIXED_DT in [0, 1] (`world.alpha`). The angle takes the shortest arc.
 * Sim logic keeps reading `phys` directly; only rendering uses this.
 */
export function renderPose(car: WorldCar, alpha: number, out: Pose): Pose {
  const p = car.phys;
  const dx = p.x - car.prevX;
  const dy = p.y - car.prevY;
  if (dx * dx + dy * dy > TELEPORT_UNITS * TELEPORT_UNITS) {
    out.x = p.x;
    out.y = p.y;
    out.a = p.a;
    return out;
  }
  const t = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
  let da = (p.a - car.prevA) % TWO_PI;
  if (da > Math.PI) da -= TWO_PI;
  else if (da < -Math.PI) da += TWO_PI;
  out.x = car.prevX + dx * t;
  out.y = car.prevY + dy * t;
  out.a = car.prevA + da * t;
  return out;
}

/** Forget the previous pose (teleport): the next renderPose returns the current pose exactly. */
export function snapRenderPose(car: WorldCar) {
  car.prevX = car.phys.x;
  car.prevY = car.phys.y;
  car.prevA = car.phys.a;
}
