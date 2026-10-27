import { describe, it, expect } from 'vitest';
import { handlePitReaction, chooseNextCompound } from './pit';
import { EventBus, type SimEvent } from './events';
import { makeCar } from './world';
import type { WorldCar } from './types';

describe('Pit Stop Simulation & QTE Reaction Mini-Game', () => {
  it('chooses appropriate tyre compound according to weather and laps', () => {
    expect(chooseNextCompound(10, 0.45)).toBe('inter');
    expect(chooseNextCompound(10, 0.8)).toBe('wet');
    expect(chooseNextCompound(12, 0)).toBe('hard');
    expect(chooseNextCompound(5, 0)).toBe('medium');
    expect(chooseNextCompound(2, 0)).toBe('soft');
  });

  it('evaluates perfect QTE reaction timing and reduces pit service time', () => {
    const car: WorldCar = makeCar(0, true, 100, 0, 'soft');
    const events = new EventBus();
    const emitted: SimEvent[] = [];
    events.subscribe((e) => emitted.push(e));

    car.pit = {
      stage: 'service',
      boxIdx: 100,
      entryLateral: 0,
      serviceLeft: 2.5,
      serviceTime: 2.5,
      fit: 'medium',
      stationary: 1.62, // Target is 1.625 (diff = -0.005s)
      enteredAt: 10,
      qteTarget: 1.625,
      qteWindow: 0.35,
      qteResult: null,
      qteHandled: false,
    };

    const res = handlePitReaction(car, events);
    expect(res).toBe('perfect');
    expect(car.pit.qteResult).toBe('perfect');
    expect(car.pit.qteHandled).toBe(true);
    expect(car.pit.serviceLeft).toBeCloseTo(1.9, 1); // 2.5 - 0.6 = 1.9s

    events.flush();
    expect(emitted).toContainEqual({
      type: 'pitQTE',
      carId: 0,
      result: 'perfect',
      delta: -0.6,
    });
  });

  it('evaluates good QTE reaction timing and reduces pit service time', () => {
    const car: WorldCar = makeCar(0, true, 100, 0, 'soft');
    const events = new EventBus();

    car.pit = {
      stage: 'service',
      boxIdx: 100,
      entryLateral: 0,
      serviceLeft: 2.5,
      serviceTime: 2.5,
      fit: 'medium',
      stationary: 1.9, // diff = +0.275s (within good window <= 0.38s)
      enteredAt: 10,
      qteTarget: 1.625,
      qteWindow: 0.35,
      qteResult: null,
      qteHandled: false,
    };

    const res = handlePitReaction(car, events);
    expect(res).toBe('good');
    expect(car.pit.qteResult).toBe('good');
    expect(car.pit.serviceLeft).toBeCloseTo(2.25, 2); // 2.5 - 0.25 = 2.25s
  });

  it('penalizes false start / early release timing', () => {
    const car: WorldCar = makeCar(0, true, 100, 0, 'soft');
    const events = new EventBus();

    car.pit = {
      stage: 'service',
      boxIdx: 100,
      entryLateral: 0,
      serviceLeft: 2.5,
      serviceTime: 2.5,
      fit: 'medium',
      stationary: 1.0, // diff = -0.625s (< -0.38s early)
      enteredAt: 10,
      qteTarget: 1.625,
      qteWindow: 0.35,
      qteResult: null,
      qteHandled: false,
    };

    const res = handlePitReaction(car, events);
    expect(res).toBe('early');
    expect(car.pit.qteResult).toBe('early');
    expect(car.pit.serviceLeft).toBeCloseTo(3.3, 1); // 2.5 + 0.8 = 3.3s
  });
});
