import type { Assists, WeatherType } from '../gameState';
import { PROFILE_BRAKE_DECEL, getRacingLine } from './racingLine';
import { gripSpeedFactor, lineSteer, profileTarget } from './ai';
import type { WorldCar } from './types';

const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);

/** The assist brakes for a corner at this fraction of the AI's pro pace: safe, not slow. */
const ASSIST_PACE = 0.92;

/**
 * Driver assists for the human player (PLAN-v3 §5.5 V5). Applied to `car.ctrl` after input
 * is read and before physics, so they never accumulate (the world re-copies the raw input every step).
 */
export function applyAssists(car: WorldCar, assists: Assists, weather: WeatherType): void {
  const p = car.phys;
  const ctrl = car.ctrl;
  if (car.pit || p.isReversing || p.vf < 20) return;
  const v = p.vf;

  // 1. Braking assist: scan racing line safe entry envelope and apply progressive braking
  if (assists.brakingAssist && !ctrl.handbrake) {
    const target = profileTarget(p.idx, ASSIST_PACE, gripSpeedFactor(car, weather), PROFILE_BRAKE_DECEL * 0.95);
    const over = v - target;
    if (over > 4) {
      const need = clamp(over / 26, 0, 1);
      if (need > ctrl.brake) ctrl.brake = need;
      if (over > 10) ctrl.throttle = 0;
    }
  }

  // 2. Anti-lock braking system (ABS): prevent wheel lockup under heavy braking
  if (assists.abs && ctrl.brake > 0.05) {
    const maxSlip = Math.max(p.wheelSlipFront || 0, p.wheelSlipRear || 0);
    if (maxSlip > 0.12) {
      const absFactor = Math.max(0.40, 1.0 - (maxSlip - 0.12) / 0.22);
      ctrl.brake *= absFactor;
    }
  }

  // 3. Traction control (TC): limit wheel slip and lateral slip when applying power
  if (assists.tractionControl) {
    let limit = 1.0;
    const steer = Math.abs(ctrl.steer);
    // Limit throttle on high steering lock at low-to-medium speed to prevent power oversteer
    if (v < 340 && steer > 0.35) {
      limit = Math.min(limit, 1.0 - 0.55 * ((steer - 0.35) / 0.65) * (1 - v / 340));
    }
    // Limit throttle if rear wheels are spinning beyond peak traction (~10% slip)
    const rearSlip = p.wheelSlipRear || 0;
    if (rearSlip > 0.08) {
      const tcSlip = Math.max(0.15, 1.0 - (rearSlip - 0.08) / 0.20);
      limit = Math.min(limit, tcSlip);
    }
    // High lateral sliding velocity
    if (Math.abs(p.vl) > 40 && v < 380) {
      limit = Math.min(limit, 0.55);
    }
    if (ctrl.throttle > limit) {
      ctrl.throttle = Math.max(0.20, limit);
    }
  }

  // 4. Stability assist: counter-steer and cut throttle when car body slips sideways (beta divergence)
  if (assists.stabilityControl) {
    const beta = p._veh ? Math.atan2(p._veh.vy, Math.max(1, p._veh.vx)) : p.vl / Math.max(1, p.vf);
    if (Math.abs(beta) > 0.07) {
      const counter = -Math.sign(beta) * Math.min(0.45, (Math.abs(beta) - 0.07) * 2.5);
      ctrl.steer = clamp(ctrl.steer + counter, -1, 1);
      ctrl.throttle = Math.min(ctrl.throttle, 0.4);
    }
  }

  // 5. Steering assist: guide towards the racing line and filter aggressive digital steering
  if (assists.steeringAssist && car.surface.onTrack) {
    const pull = lineSteer(car, 0);
    if (!ctrl.analogSteer) {
      // Digital keyboard input: raw steer is -1, 0, or 1
      if (ctrl.steer === 0) {
        // Hands off: track the racing line directly
        ctrl.steer = pull;
      } else {
        // Driver is tapping Left/Right: blend with pull and cap excessive digital lock
        const dir = Math.sign(ctrl.steer);
        if (Math.sign(pull) === dir) {
          ctrl.steer = clamp(pull * 1.1 + dir * 0.1, -0.85, 0.85);
        } else {
          ctrl.steer = clamp(pull * 0.5 + dir * 0.35, -0.6, 0.6);
        }
      }
    } else {
      // Analog controller / wheel input
      if (ctrl.steer === 0) {
        ctrl.steer = clamp(pull * 0.85, -0.75, 0.75);
      } else {
        const driverWeight = clamp(Math.abs(ctrl.steer), 0, 1);
        const gain = 0.55 * (1 - 0.5 * driverWeight);
        const lateralErr = Math.abs(car.lateral - getRacingLine().offset[p.idx]);
        const w = lateralErr > 45 ? 0.4 : 1.0;
        ctrl.steer = clamp(ctrl.steer + clamp(pull, -0.4, 0.4) * gain * w, -1, 1);
      }
    }
  }
}
