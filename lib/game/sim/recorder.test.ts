import { describe, expect, it } from 'vitest';
import { GHOST_STRIDE, parseGhost, sampleGhost, serializeGhost, type GhostLap, type GhostSample } from '../replay/ghost';
import { REC_HZ, Recorder, lerpAngle, makeCarSample, wrapAngle, type RecordableWorld } from './recorder';

function fakeWorld(): RecordableWorld {
  const car = (id: number) => ({
    id,
    compound: 'soft',
    position: id + 1,
    timing: { lapsCompleted: 0 },
    phys: { x: 0, y: 0, a: 0, steer: 0, vf: 0, vl: 0, kmh: 0, rpm: 4000, gear: 1 as number | string, brakeInput: 0, drsOpen: false, isBoosting: false, isDrifting: false, driftIntensity: 0, guardRailSparks: 0 },
  });
  return { raceId: 1, raceTime: 0, phase: 'racing', cars: [car(0), car(1)] };
}

describe('Recorder', () => {
  it('interpolates a recorded car between samples', () => {
    const w = fakeWorld();
    const rec = new Recorder();
    for (let i = 0; i <= 60; i++) {
      w.raceTime = i / REC_HZ;
      w.cars[0].phys.x = i * 10;
      w.cars[1].phys.x = -i * 5;
      rec.capture(w);
    }
    expect(rec.count).toBeGreaterThan(55);
    const out = makeCarSample();
    const mid = 20.5 / REC_HZ;
    rec.readCar(rec.locate(mid), 0, out);
    expect(out.x).toBeCloseTo(205, 0);
    rec.readCar(rec.locate(mid), 1, out);
    expect(out.x).toBeCloseTo(-102.5, 0);
  });

  it('ignores the grid and lights phases', () => {
    const w = fakeWorld();
    const rec = new Recorder();
    w.phase = 'grid';
    rec.capture(w);
    w.phase = 'lights';
    rec.capture(w);
    expect(rec.count).toBe(0);
  });

  it('interpolates heading along the shortest arc', () => {
    expect(Math.abs(lerpAngle(3.0, -3.0, 0.5))).toBeCloseTo(Math.PI, 1);
    expect(Math.abs(wrapAngle(Math.PI * 3))).toBeCloseTo(Math.PI, 5);
  });

  it('stops recording at its sample cap', () => {
    const w = fakeWorld();
    const rec = new Recorder({ maxSeconds: 1 });
    for (let i = 0; i < 200; i++) {
      w.raceTime = i / REC_HZ;
      rec.capture(w);
    }
    expect(rec.count).toBe(REC_HZ);
  });
});

describe('ghost storage', () => {
  const lap = (): GhostLap => {
    const n = 90;
    const data = new Float32Array(n * GHOST_STRIDE);
    for (let i = 0; i < n; i++) {
      const o = i * GHOST_STRIDE;
      data[o] = i / 30; // t
      data[o + 1] = i * 12; // x
      data[o + 2] = -i * 4; // y
      data[o + 3] = 0.3; // a
      data[o + 7] = i > 45 ? 1 : 0; // drs
    }
    return { trackId: 'buddh', weather: 'sunny', lapTime: 2.97, n, data };
  };

  it('survives a serialise / parse round trip', () => {
    const g = lap();
    const back = parseGhost(serializeGhost(g))!;
    expect(back.n).toBe(g.n);
    expect(back.lapTime).toBeCloseTo(2.97, 3);
    expect(Array.from(back.data.slice(0, 16))).toEqual(Array.from(g.data.slice(0, 16)));
  });

  it('rejects corrupt input', () => {
    expect(parseGhost(null)).toBeNull();
    expect(parseGhost('{not json')).toBeNull();
    expect(parseGhost(JSON.stringify({ v: 1, t: 1, n: 5, d: 'AAAA' }))).toBeNull();
  });

  it('samples positions between recorded points and past the end', () => {
    const g = lap();
    const out: GhostSample = { x: 0, y: 0, a: 0, steer: 0, vf: 0, brake: 0, drsOpen: false };
    expect(sampleGhost(g, 2.0, out)).toBe(true);
    expect(out.x).toBeCloseTo(720, 0);
    expect(out.drsOpen).toBe(true);
    expect(sampleGhost(g, 99, out)).toBe(false);
  });
});
