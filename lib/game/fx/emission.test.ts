import { describe, expect, it } from 'vitest';
import { createInitialCarState } from '../physics';
import { frontSlip, rearSlip, sprayStrength } from './emission';

describe('fx emission', () => {
  it('is silent for a car cruising straight', () => {
    const p = createInitialCarState(0, 0);
    p.kmh = 200;
    expect(rearSlip(p, 1)).toBe(0);
    expect(frontSlip(p)).toBe(0);
  });

  it('smokes rear tyres in a drift and fronts on lock-up', () => {
    const p = createInitialCarState(0, 0);
    p.kmh = 150;
    p.isDrifting = true;
    p.driftIntensity = 0.8;
    expect(rearSlip(p, 1)).toBeCloseTo(0.8);
    p.isDrifting = false;
    p.brakeInput = 0.9;
    p.wheelSlipFront = 0.7;
    expect(frontSlip(p)).toBeCloseTo(0.7);
  });

  it('ramps spray with speed', () => {
    expect(sprayStrength(100)).toBe(0);
    expect(sprayStrength(210)).toBeCloseTo(0.5, 1);
    expect(sprayStrength(400)).toBe(1);
  });
});
