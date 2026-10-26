import { describe, expect, it } from 'vitest';
import {
  applyDeadzoneAndCurve,
  applyTriggerDeadzone,
  calculateSpeedSensitiveLock,
  ControlsManager,
  rampScalar,
  readPedalAxis,
  stepKeyboardSteer,
} from './controls';
import { DEFAULT_INPUT_SETTINGS } from './gameState';

describe('controls math functions (PLAN-v3 §6 A3)', () => {
  describe('applyDeadzoneAndCurve', () => {
    it('returns 0 for values within the deadzone', () => {
      expect(applyDeadzoneAndCurve(0, 0.08, 1.4)).toBe(0);
      expect(applyDeadzoneAndCurve(0.05, 0.08, 1.4)).toBe(0);
      expect(applyDeadzoneAndCurve(-0.07, 0.08, 1.4)).toBe(0);
    });

    it('returns full 1 or -1 at maximum stick deflection', () => {
      expect(applyDeadzoneAndCurve(1.0, 0.08, 1.4)).toBeCloseTo(1.0, 4);
      expect(applyDeadzoneAndCurve(-1.0, 0.08, 1.4)).toBeCloseTo(-1.0, 4);
    });

    it('applies non-linearity curve smoothly', () => {
      // Linear (linearity = 1.0): halfway between 0.1 and 1.0 (val = 0.55) -> (0.55 - 0.1)/0.9 = 0.5
      expect(applyDeadzoneAndCurve(0.55, 0.1, 1.0)).toBeCloseTo(0.5, 4);

      // Progressive (linearity = 2.0): 0.5^2 = 0.25
      expect(applyDeadzoneAndCurve(0.55, 0.1, 2.0)).toBeCloseTo(0.25, 4);
    });
  });

  describe('applyTriggerDeadzone', () => {
    it('clamps values below trigger deadzone to 0', () => {
      expect(applyTriggerDeadzone(0.03, 0.05)).toBe(0);
      expect(applyTriggerDeadzone(0.05, 0.05)).toBe(0);
    });

    it('scales linearly from deadzone to 1.0', () => {
      expect(applyTriggerDeadzone(1.0, 0.05)).toBeCloseTo(1.0, 4);
      // Midpoint: (0.525 - 0.05) / 0.95 = 0.5
      expect(applyTriggerDeadzone(0.525, 0.05)).toBeCloseTo(0.5, 4);
    });
  });

  describe('readPedalAxis', () => {
    it('converts unpressed -1 to 0 and pressed +1 to 1.0', () => {
      expect(readPedalAxis(-1.0, false, 0.05)).toBe(0);
      expect(readPedalAxis(1.0, false, 0.05)).toBeCloseTo(1.0, 4);
    });

    it('inverts pedal axis when inverted is true', () => {
      // Inverted: +1 resting, -1 pressed
      expect(readPedalAxis(1.0, true, 0.05)).toBe(0);
      expect(readPedalAxis(-1.0, true, 0.05)).toBeCloseTo(1.0, 4);
    });
  });

  describe('calculateSpeedSensitiveLock', () => {
    it('returns full lock (1.0) at 0 km/h', () => {
      expect(calculateSpeedSensitiveLock(0, 1.0)).toBe(1.0);
    });

    it('smoothly reduces max steering lock as speed increases', () => {
      const lock85 = calculateSpeedSensitiveLock(85, 1.0);
      const lock170 = calculateSpeedSensitiveLock(170, 1.0);
      const lock300 = calculateSpeedSensitiveLock(300, 1.0);

      expect(lock85).toBeCloseTo(0.5, 2);
      expect(lock170).toBeCloseTo(0.33, 2);
      expect(lock300).toBeGreaterThanOrEqual(0.22);
      expect(lock300).toBeLessThan(lock170);
    });
  });

  describe('keyboard throttle and brake ramping', () => {
    it('ramps throttle 0 -> 1 in ~0.25s', () => {
      let th = 0;
      const attackRate = 4.0; // 1 / 0.25s
      const returnRate = 12.5;
      const dt = 0.05;

      // After 0.10s (2 steps)
      th = rampScalar(th, 1, attackRate, returnRate, dt);
      th = rampScalar(th, 1, attackRate, returnRate, dt);
      expect(th).toBeCloseTo(0.40, 2);

      // After 0.25s (5 steps)
      th = rampScalar(th, 1, attackRate, returnRate, dt);
      th = rampScalar(th, 1, attackRate, returnRate, dt);
      th = rampScalar(th, 1, attackRate, returnRate, dt);
      expect(th).toBe(1.0);

      // Releasing drops rapidly
      th = rampScalar(th, 0, attackRate, returnRate, dt);
      expect(th).toBeCloseTo(1.0 - 0.05 * 12.5, 2);
    });

    it('ramps brake 0 -> 1 in ~0.12s', () => {
      let br = 0;
      const attackRate = 8.33; // 1 / 0.12s
      const returnRate = 16.67;
      const dt = 0.04;

      br = rampScalar(br, 1, attackRate, returnRate, dt);
      br = rampScalar(br, 1, attackRate, returnRate, dt);
      br = rampScalar(br, 1, attackRate, returnRate, dt);
      expect(br).toBeCloseTo(1.0, 2);
    });

    it('steering returns to centre faster than it turns into the corner', () => {
      let steer = 0;
      const dt = 0.05;

      // Steer right away from 0: 2 steps of attack
      steer = stepKeyboardSteer(steer, 1, 0, dt, 1.0, 1.0, 1.0);
      steer = stepKeyboardSteer(steer, 1, 0, dt, 1.0, 1.0, 1.0);
      const turnedAmount = steer;

      // Release key (targetDir = 0): 1 step of return
      const returnedSteer = stepKeyboardSteer(steer, 0, 0, dt, 1.0, 1.0, 1.0);
      const returnedAmount = turnedAmount - returnedSteer;

      // Return speed (10.0/s) must be > 2x attack speed (4.54/s)
      expect(returnedAmount / dt).toBeGreaterThan((turnedAmount / 0.10) * 1.8);
    });
  });
});

describe('ControlsManager integration', () => {
  it('updates settings and persists custom mappings', () => {
    const mgr = new ControlsManager();
    mgr.updateSettings({
      input: {
        keyboardSteeringSpeed: 1.5,
        gamepadDeadzone: 0.12,
        customKeys: { drs: 'KeyG', throttle: 'KeyI' },
        customButtons: { drs: 4 },
      },
    });

    expect(mgr.inputSettings.keyboardSteeringSpeed).toBe(1.5);
    expect(mgr.inputSettings.gamepadDeadzone).toBe(0.12);
    expect(mgr.inputSettings.customKeys.drs).toBe('KeyG');
    expect(mgr.inputSettings.customButtons.drs).toBe(4);
  });

  it('poll() produces neutral controls when unpressed', () => {
    const mgr = new ControlsManager();
    const st = mgr.poll(0.016, 0);
    expect(st.throttle).toBe(0);
    expect(st.brake).toBe(0);
    expect(st.steer).toBe(0);
  });
});
