import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../gameState';
import { NEUTRAL_CONTROLS } from '../controls';
import { FIXED_DT, GameWorld } from './world';
import { renderPose, snapRenderPose, type Pose } from './interp';
import type { WorldCar } from './types';

/** Minimal car: renderPose only reads phys.x/y/a and prevX/Y/A. */
function fakeCar(prev: [number, number, number], cur: [number, number, number]): WorldCar {
  return { phys: { x: cur[0], y: cur[1], a: cur[2] }, prevX: prev[0], prevY: prev[1], prevA: prev[2] } as unknown as WorldCar;
}

const out = (): Pose => ({ x: 0, y: 0, a: 0 });

describe('renderPose', () => {
  it('alpha 0 gives the previous pose, alpha 1 the current pose, 0.5 the midpoint', () => {
    const car = fakeCar([10, 20, 0.2], [14, 26, 0.6]);
    expect(renderPose(car, 0, out())).toEqual({ x: 10, y: 20, a: 0.2 });
    expect(renderPose(car, 1, out())).toEqual({ x: 14, y: 26, a: 0.6 });
    const mid = renderPose(car, 0.5, out());
    expect(mid.x).toBeCloseTo(12);
    expect(mid.y).toBeCloseTo(23);
    expect(mid.a).toBeCloseTo(0.4);
  });

  it('takes the shortest arc across the ±π wrap (no spin the long way round)', () => {
    // 3.0 -> -3.0 rad is a 0.283 rad turn through π, not a 6 rad turn back through 0.
    const car = fakeCar([0, 0, 3.0], [0, 0, -3.0]);
    const mid = renderPose(car, 0.5, out());
    expect(Math.abs(Math.abs(mid.a) - Math.PI)).toBeLessThan(1e-9); // halfway is ±π
    const q = renderPose(car, 0.25, out());
    expect(q.a).toBeCloseTo(3.0 + (2 * Math.PI - 6.0) * 0.25);
    // and the reverse direction
    const back = renderPose(fakeCar([0, 0, -3.0], [0, 0, 3.0]), 0.25, out());
    expect(back.a).toBeCloseTo(-3.0 - (2 * Math.PI - 6.0) * 0.25);
  });

  it('clamps alpha to [0, 1]', () => {
    const car = fakeCar([0, 0, 0], [10, 0, 0.1]);
    expect(renderPose(car, -3, out()).x).toBe(0);
    expect(renderPose(car, 7, out()).x).toBe(10);
  });

  it('does not smear a teleport: a jump larger than one step returns the current pose', () => {
    const car = fakeCar([0, 0, 0], [500, 0, 1]);
    expect(renderPose(car, 0.3, out())).toEqual({ x: 500, y: 0, a: 1 });
  });

  it('writes into the supplied object and returns it', () => {
    const o = out();
    expect(renderPose(fakeCar([0, 0, 0], [1, 1, 0]), 1, o)).toBe(o);
  });

  it('snapRenderPose makes the previous pose equal the current one', () => {
    const car = fakeCar([0, 0, 0], [5, 5, 0.5]);
    snapRenderPose(car);
    expect(renderPose(car, 0.3, out())).toEqual({ x: 5, y: 5, a: 0.5 });
  });
});

describe('world interpolation state', () => {
  it('alpha is the accumulator fraction after step()', () => {
    const w = new GameWorld();
    w.setup({ ...DEFAULT_SETTINGS, mode: 'timetrial' });
    w.step(FIXED_DT * 2.25, NEUTRAL_CONTROLS);
    expect(w.alpha).toBeCloseTo(0.25, 6);
    w.step(FIXED_DT * 0.5, NEUTRAL_CONTROLS); // 0.75: still no new step
    expect(w.alpha).toBeCloseTo(0.75, 6);
    w.step(FIXED_DT * 0.5, NEUTRAL_CONTROLS); // 1.25 -> one step, 0.25 left
    expect(w.alpha).toBeCloseTo(0.25, 6);
  });

  it('prev is the pose before the last step; a zero-step frame leaves it untouched', () => {
    const w = new GameWorld();
    w.setup({ ...DEFAULT_SETTINGS, mode: 'timetrial' });
    const car = w.player;
    const drive = { ...NEUTRAL_CONTROLS, throttle: 1 };
    for (let i = 0; i < 60; i++) w.step(FIXED_DT, drive);
    const xBefore = car.phys.x;
    const yBefore = car.phys.y;
    w.step(FIXED_DT, drive);
    // prev now holds the pose that existed before that one step.
    expect(car.prevX).toBe(xBefore);
    expect(car.prevY).toBe(yBefore);
    const prevX = car.prevX;
    const curX = car.phys.x;
    w.step(FIXED_DT * 0.3, drive); // zero-step frame
    expect(car.prevX).toBe(prevX);
    expect(car.phys.x).toBe(curX);
    // blended pose lies between prev and current
    const q = renderPose(car, w.alpha, out());
    const lo = Math.min(prevX, curX) - 1e-9;
    const hi = Math.max(prevX, curX) + 1e-9;
    expect(q.x).toBeGreaterThanOrEqual(lo);
    expect(q.x).toBeLessThanOrEqual(hi);
  });

  it('resetPlayer does not smear: the render pose is the new pose', () => {
    const w = new GameWorld();
    w.setup({ ...DEFAULT_SETTINGS, mode: 'timetrial' });
    const drive = { ...NEUTRAL_CONTROLS, throttle: 1 };
    for (let i = 0; i < 240; i++) w.step(FIXED_DT, drive);
    w.resetPlayer();
    const q = renderPose(w.player, 0.2, out());
    expect(q.x).toBe(w.player.phys.x);
    expect(q.y).toBe(w.player.phys.y);
    expect(q.a).toBe(w.player.phys.a);
  });

  it('removes frame-to-frame stutter at 144 Hz (measured)', () => {
    const w = new GameWorld();
    w.setup({ ...DEFAULT_SETTINGS, mode: 'timetrial' });
    const drive = { ...NEUTRAL_CONTROLS, throttle: 1 };
    for (let i = 0; i < 600; i++) w.step(FIXED_DT, drive); // get up to speed (5 s)
    const frame = 1 / 144; // 120 Hz sim vs 144 Hz display: 0 or 1 steps per frame
    const rawDx: number[] = [];
    const blendDx: number[] = [];
    const q = out();
    let lastRaw = w.player.phys.x;
    let lastBlend = renderPose(w.player, w.alpha, q).x;
    let lastY = w.player.phys.y;
    let lastBlendY = q.y;
    for (let i = 0; i < 288; i++) {
      w.step(frame, drive);
      const p = w.player.phys;
      rawDx.push(Math.hypot(p.x - lastRaw, p.y - lastY));
      lastRaw = p.x;
      lastY = p.y;
      renderPose(w.player, w.alpha, q);
      blendDx.push(Math.hypot(q.x - lastBlend, q.y - lastBlendY));
      lastBlend = q.x;
      lastBlendY = q.y;
    }
    const spread = (d: number[]) => {
      const m = d.reduce((a, b) => a + b, 0) / d.length;
      return { mean: m, sd: Math.sqrt(d.reduce((a, b) => a + (b - m) ** 2, 0) / d.length), min: Math.min(...d), max: Math.max(...d) };
    };
    const raw = spread(rawDx);
    const blend = spread(blendDx);
    console.log(
      `[interp @144Hz] per-frame displacement (units, 1 unit = 0.103 m): raw mean ${raw.mean.toFixed(3)} sd ${raw.sd.toFixed(3)} ` +
        `min ${raw.min.toFixed(3)} max ${raw.max.toFixed(3)} | blended mean ${blend.mean.toFixed(3)} sd ${blend.sd.toFixed(3)} ` +
        `min ${blend.min.toFixed(3)} max ${blend.max.toFixed(3)}`
    );
    expect(raw.min).toBe(0); // some frames run zero steps: the car does not move on screen
    expect(blend.min).toBeGreaterThan(0);
    // V2 realistic 8-gear acceleration contributes speed-ramp variance across the 2 s window
    expect(blend.sd).toBeLessThan(raw.sd * 0.30);
  });
});
