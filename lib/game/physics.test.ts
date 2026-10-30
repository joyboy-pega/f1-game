import { describe, expect, it } from 'vitest';
import { TYRE_COMPOUNDS } from './constants';
import { createInitialCarState, fitFreshTires, updateCarPhysics } from './physics';
import { tempGrip } from './sim/tyres';
import { NEUTRAL_CONTROLS } from './controls';

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

describe('driving mechanics options: casual vs hardcore', () => {
  it('casual is default and uses arcade physics without _veh', () => {
    const car = createInitialCarState(0, 0);
    const ctrl = { ...NEUTRAL_CONTROLS, throttle: 1 };
    
    updateCarPhysics(car, ctrl, 1 / 60, 'sunny');
    
    expect(car._veh).toBeUndefined();
    expect(car.vf).toBeGreaterThan(0);
    expect(car.kmh).toBeGreaterThan(0);
  });

  it('hardcore mode initializes and steps the realistic vehicle dynamics model (_veh)', () => {
    const car = createInitialCarState(0, 0);
    const ctrl = { ...NEUTRAL_CONTROLS, throttle: 1 };
    
    updateCarPhysics(car, ctrl, 1 / 60, 'sunny', 1.0, 1.0, 1.0, { drivingModel: 'hardcore' });
    
    expect(car._veh).toBeDefined();
    expect(car._veh?.powertrain).toBeDefined();
    expect(car.vf).toBeGreaterThan(0);
  });

  it('casual mode initiates drift on handbrake while hardcore does not set arcade drift flags', () => {
    const casualCar = createInitialCarState(0, 0);
    casualCar.vx = 250;
    casualCar.vf = 250;
    casualCar.steer = 0.5;
    const steerAndHandbrake = { ...NEUTRAL_CONTROLS, throttle: 0.5, steer: 0.8, handbrake: true };

    updateCarPhysics(casualCar, steerAndHandbrake, 1 / 60, 'sunny', 1.0, 1.0, 1.0, { drivingModel: 'casual' });
    expect(casualCar.isDrifting).toBe(true);
  });
});
