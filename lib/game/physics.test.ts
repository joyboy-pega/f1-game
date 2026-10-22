import { describe, expect, it } from 'vitest';
import { TYRE_COMPOUNDS } from './constants';
import { createInitialCarState, fitFreshTires } from './physics';
import { tempGrip } from './sim/tyres';

describe('fitFreshTires (B9)', () => {
  it('with a compound, starting grip follows tyre temperature: cold new tyres are below full grip', () => {
    const p = createInitialCarState(0, 0);
    fitFreshTires(p, 65, 'soft');
    const expected = tempGrip(65, TYRE_COMPOUNDS.soft.tempWindow) * TYRE_COMPOUNDS.soft.baseGrip;
    expect(p.tires.fl.grip).toBeCloseTo(expected);
    expect(p.tires.fl.grip).toBeLessThan(1);
    expect(p.tires.overallGrip).toBeCloseTo(expected);
    expect(p.tires.avgTemp).toBe(65);
    expect(p.tires.avgWear).toBe(0);
  });

  it('a hotter set starts with more grip than a colder one, and the compound base grip applies', () => {
    const cold = createInitialCarState(0, 0);
    const warm = createInitialCarState(0, 0);
    fitFreshTires(cold, 60, 'medium');
    fitFreshTires(warm, 90, 'medium');
    expect(warm.tires.fl.grip).toBeGreaterThan(cold.tires.fl.grip);
    expect(warm.tires.fl.grip).toBeLessThanOrEqual(TYRE_COMPOUNDS.medium.baseGrip + 1e-9);
  });

  it('without a compound the legacy full-grip behaviour is unchanged', () => {
    const p = createInitialCarState(0, 0);
    fitFreshTires(p, 65);
    expect(p.tires.fl.grip).toBe(1);
    expect(p.tires.frontGrip).toBe(1);
  });
});
