// Pure emission heuristics so the FX tuning is unit-testable without WebGL.
import type { CarPhysicsState } from '../physics';

/** 0..1 how hard the rear tyres are scrubbing (drift, braking slide, launch wheelspin). */
export function rearSlip(p: CarPhysicsState, throttle: number): number {
  const drift = p.isDrifting ? p.driftIntensity : 0;
  const brake = p.wheelSlipRear * 0.85;
  // Launch / low-speed power oversteer. Only counts when properly on the throttle.
  const spin = throttle > 0.8 && p.kmh < 70 && p.kmh > 3 ? (1 - p.kmh / 70) * 0.6 : 0;
  return Math.min(1, Math.max(drift, brake, spin));
}

/** 0..1 front tyre scrub: lock-ups under braking, plus the loaded outside tyre in a drift. */
export function frontSlip(p: CarPhysicsState): number {
  const drift = p.isDrifting ? p.driftIntensity * 0.4 : 0;
  const lock = p.brakeInput > 0.55 ? p.wheelSlipFront : p.wheelSlipFront * 0.5;
  return Math.min(1, Math.max(drift, lock));
}

/** 0..1 spray strength from speed (starts ~120 km/h, saturates ~300). */
export function sprayStrength(kmh: number): number {
  return Math.min(1, Math.max(0, (kmh - 120) / 180));
}
