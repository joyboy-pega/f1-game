import { AERO, AIR_DENSITY, type AeroParams } from './params';

/** Aerodynamic forces on the whole car, N. Written into a caller-owned object (R7: no allocation in the step). */
export interface AeroForces {
  downforce: number;
  drag: number;
  downFront: number;
  downRear: number;
}

export interface AeroInputs {
  /** DRS flap open. */
  drs: boolean;
  /** 0..1 slipstream strength (sim/drs.ts `draft`). */
  draft: number;
  /** 0..1 dirty-air effect from the car ahead (only matters in corners: sim sets it). */
  dirtyAir: number;
  /** Front-wing damage 0..1 (V3): scales downforce down and drag up. */
  damage?: number;
}

export function createAeroForces(): AeroForces {
  return { downforce: 0, drag: 0, downFront: 0, downRear: 0 };
}

/** ½ρv² (Pa). */
export function dynamicPressure(speed: number): number {
  return 0.5 * AIR_DENSITY * speed * speed;
}

/**
 * Downforce and drag at `speed` (m/s), §5.2.5. DRS cuts drag and (mostly rear) downforce; slipstream cuts drag; dirty air
 * cuts downforce. The front/rear split follows the aero balance; opening DRS moves the balance forward by taking the loss from the rear.
 */
export function aeroForces(speed: number, inp: AeroInputs, out: AeroForces, p: AeroParams = AERO): AeroForces {
  const q = dynamicPressure(speed);
  const damage = inp.damage ?? 0;
  let clA = p.clA * (1 - 0.25 * damage);
  let cdA = p.cdA * (1 + 0.08 * damage);
  let frontShare = p.frontBalance;
  if (inp.drs) {
    cdA *= p.drsCdAScale;
    const lost = clA * (1 - p.drsClAScale); // all of the downforce lost with DRS comes off the rear axle
    const front = clA * p.frontBalance;
    clA -= lost;
    frontShare = front / clA;
  }
  clA *= 1 - p.dirtyAirDownforceLoss * clamp01(inp.dirtyAir);
  cdA *= 1 - p.draftDragReduction * clamp01(inp.draft);
  out.downforce = q * clA;
  out.drag = q * cdA;
  out.downFront = out.downforce * frontShare;
  out.downRear = out.downforce - out.downFront;
  return out;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
