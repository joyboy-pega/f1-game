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

  it('launch puff is light and short (S7): max 0.3 at a standstill, none by 40 km/h or without throttle', () => {
    const p = createInitialCarState(0, 0);
    p.kmh = 5;
    expect(rearSlip(p, 1)).toBeLessThanOrEqual(0.3);
    expect(rearSlip(p, 1)).toBeGreaterThan(0.25);
    p.kmh = 40;
    expect(rearSlip(p, 1)).toBeLessThan(0.05);
    p.kmh = 5;
    expect(rearSlip(p, 0.5)).toBe(0);
    // CarFx only emits above a 0.14 slip threshold: the puff dies out before ~25 km/h
    p.kmh = 25;
    expect(rearSlip(p, 1)).toBeLessThan(0.14);
  });
});
