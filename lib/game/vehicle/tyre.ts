import { CAR, GRAVITY } from './params';

/**
 * Tyre force model (PLAN-v3 §5.2.2-3): simplified Pacejka Magic Formula
 *   F = D·sin(C·atan(B·x − E·(B·x − atan(B·x))))
 * with D = μ·Fz. Pure functions, SI units, no allocation. The numbers are starting points that V2 tunes against the probe table
 * (§11.1); they are not measured tyre data.
 */

export interface MagicFormula {
  B: number;
  C: number;
  E: number;
}

/** B from the wanted peak position x_peak: for E = 0 the peak is where C·atan(B·x) = π/2, i.e. B = tan(π/(2C)) / x_peak. */
export function stiffnessFor(C: number, xPeak: number): number {
  return Math.tan(Math.PI / (2 * C)) / xPeak;
}

export interface TyreParams {
  /** Peak friction coefficient at the nominal load, dry, optimum temperature, new. Tuned in V2 (starting value). */
  mu0: number;
  /** Nominal vertical load per tyre (N): a quarter of the dry weight. */
  fz0: number;
  /** Load sensitivity: μ ∝ (Fz/Fz0)^(-k). §5.2.2 suggests a mild 0.1; V2 tunes (more load -> relatively less grip). */
  loadSensitivity: number;
  lateral: MagicFormula;
  longitudinal: MagicFormula;
  /** Slip angle (rad) and slip ratio at the force peak. */
  peakSlipAngle: number;
  peakSlipRatio: number;
}

const LAT_C = 1.9; // §5.2.2 starting value
const LON_C = 1.65; // §5.2.2 starting value
const PEAK_ALPHA = (7 * Math.PI) / 180; // §5.2.2: ~7° lateral peak
const PEAK_KAPPA = 0.1; // §5.2.2: ~10 % longitudinal slip peak

export const TYRE: TyreParams = {
  mu0: 2.0,
  fz0: (CAR.massKg * GRAVITY) / 4,
  loadSensitivity: 0.2,
  lateral: { B: stiffnessFor(LAT_C, PEAK_ALPHA), C: LAT_C, E: 0 },
  longitudinal: { B: stiffnessFor(LON_C, PEAK_KAPPA), C: LON_C, E: 0 },
  peakSlipAngle: PEAK_ALPHA,
  peakSlipRatio: PEAK_KAPPA,
};

/** Normalised Magic Formula curve, peak value 1 (unit D). */
export function magic(x: number, m: MagicFormula): number {
  const bx = m.B * x;
  return Math.sin(m.C * Math.atan(bx - m.E * (bx - Math.atan(bx))));
}

/**
 * Peak friction coefficient at vertical load `fz` (N). `grip` is the product of the existing tyre factors (temperature window,
 * wear, compound base grip, wetness; see sim/tyres.ts), 1 = ideal.
 */
export function tyreMu(p: TyreParams, fz: number, grip = 1): number {
  const load = Math.max(0.05, fz / p.fz0);
  return p.mu0 * Math.pow(load, -p.loadSensitivity) * grip;
}

/** Pure lateral force (N) for slip angle `alpha` (rad, sign = force direction) at load `fz`. */
export function lateralForce(p: TyreParams, alpha: number, fz: number, grip = 1): number {
  return tyreMu(p, fz, grip) * fz * magic(alpha, p.lateral);
}

/** Pure longitudinal force (N) for slip ratio `kappa` (positive = driving, negative = braking). */
export function longitudinalForce(p: TyreParams, kappa: number, fz: number, grip = 1): number {
  return tyreMu(p, fz, grip) * fz * magic(kappa, p.longitudinal);
}

/**
 * Friction ellipse (§5.2.3): with a longitudinal force `fx` in use, the lateral capacity `fy` shrinks by sqrt(1 - (fx/fxMax)²).
 * Returns the scaled lateral force; fx beyond the limit leaves no lateral grip.
 */
export function ellipseLateral(fy: number, fx: number, fxMax: number): number {
  const u = fxMax > 0 ? fx / fxMax : 1;
  const s = 1 - u * u;
  return s > 0 ? fy * Math.sqrt(s) : 0;
}

export function rollingResistance(totalVerticalLoadN: number): number {
  return CAR.rollingResistance * totalVerticalLoadN;
}

/** Peak (limit) longitudinal / lateral force available at load `fz`: μ·Fz, before the slip curve's own shape. */
export function peakForce(p: TyreParams, fz: number, grip = 1): number {
  return tyreMu(p, fz, grip) * fz;
}
