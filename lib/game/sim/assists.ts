import type { Assists, WeatherType } from '../gameState';
import { PROFILE_BRAKE_DECEL, lineOffset } from './racingLine';
import { gripSpeedFactor, lineSteer, profileTarget } from './ai';
import type { WorldCar } from './types';

const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);

/** The assist brakes for a corner at this fraction of the AI's pro pace: safe, not slow. */
const ASSIST_PACE = 0.93;

/**
 * Driver assists for the human player. Applied to `car.ctrl` after input is read and before
 * physics, so they never accumulate (the world re-copies the raw input every step).
 */
export function applyAssists(car: WorldCar, assists: Assists, weather: WeatherType): void {
  const p = car.phys;
  const ctrl = car.ctrl;
  if (car.pit || p.isReversing || p.vf < 30) return;
  const v = p.vf;

  if (assists.brakingAssist && !ctrl.handbrake) {
    const target = profileTarget(p.idx, ASSIST_PACE, gripSpeedFactor(car, weather), PROFILE_BRAKE_DECEL * 0.95);
    const over = v - target;
    if (over > 10) {
      const need = clamp(over / 45, 0, 1);
      if (need > ctrl.brake) ctrl.brake = need;
      if (over > 18) ctrl.throttle = 0;
    }
  }

  if (assists.steeringAssist && car.surface.onTrack && !p.isDrifting) {
    const pull = lineSteer(car, 0);
    // Gentle: a fraction of what the AI would do, fading out when the driver steers firmly.
    const driverWeight = clamp(Math.abs(ctrl.steer), 0, 1);
    const gain = 0.5 * (1 - 0.7 * driverWeight);
    const lateralErr = Math.abs(car.lateral - lineOffset[p.idx]);
    const w = lateralErr > 40 ? 0.5 : 1; // far from the line: the line is no longer a sensible target
    ctrl.steer = clamp(ctrl.steer + clamp(pull, -0.4, 0.4) * gain * w, -1, 1);
  }

  if (assists.tractionControl) {
    let limit = 1;
    const steer = Math.abs(ctrl.steer);
    if (v < 320 && steer > 0.45) limit = Math.min(limit, 1 - 0.45 * ((steer - 0.45) / 0.55) * (1 - v / 320));
    if (Math.abs(p.vl) > 55 && v < 380) limit = Math.min(limit, 0.65);
    if (p.wheelSlipRear > 0.5) limit = Math.min(limit, 0.7);
    if (ctrl.throttle > limit) ctrl.throttle = Math.max(0.3, limit);
  }
}
