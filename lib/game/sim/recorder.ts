// Session recorder: samples every car at ~30 Hz into chunked typed arrays so a whole race
// (up to MAX_REC_SECONDS) can be replayed. Samples carry their own timestamp (sim race time),
// so irregular capture intervals (render frames, not fixed steps) still interpolate cleanly.
//
// Memory: per car-sample = 8 float32 + 8 uint8 = 40 bytes, plus 4 bytes shared timestamp.
// 12 cars x 30 Hz x 30 min = 54 000 samples ~= 26 MB (a typical 5-lap race is ~3-4 MB).
// Chunks are allocated on demand (no 26 MB up-front cost, no copy-on-grow).

import type { SimEvent } from './events';

export const REC_HZ = 30;
export const MAX_REC_SECONDS = 30 * 60;
const MIN_INTERVAL = 1 / REC_HZ - 0.0025;
const CHUNK = 512; // samples per chunk
const NF = 8; // floats per car-sample: x y a steer vf vl kmh rpm
const NB = 8; // bytes per car-sample: brake flags sparks compound position lap drift gear

export const REC_COMPOUNDS = ['soft', 'medium', 'hard', 'inter', 'wet'] as const;

const FLAG_DRS = 1;
const FLAG_BOOST = 2;
const FLAG_DRIFT = 4;
const FLAG_PIT = 8;

/** Structural subset of WorldCar / GameWorld the recorder needs (keeps it unit-testable). */
export interface RecordableCar {
  id: number;
  compound: string;
  position: number;
  inPit?: boolean;
  timing: { lapsCompleted: number };
  phys: {
    x: number;
    y: number;
    a: number;
    steer: number;
    vf: number;
    vl: number;
    kmh: number;
    rpm: number;
    gear: number | string;
    brakeInput: number;
    drsOpen: boolean;
    isBoosting: boolean;
    isDrifting: boolean;
    driftIntensity: number;
    guardRailSparks: number;
  };
}

export interface RecordableWorld {
  raceId: number;
  raceTime: number;
  phase: string;
  cars: RecordableCar[];
  events?: { subscribe(fn: (e: SimEvent) => void): () => void };
}

/** One interpolated car sample. Reused by callers to avoid per-frame allocations. */
export interface CarSample {
  x: number;
  y: number;
  a: number;
  steer: number;
  vf: number;
  vl: number;
  kmh: number;
  rpm: number;
  brake: number;
  drsOpen: boolean;
  isBoosting: boolean;
  isDrifting: boolean;
  inPit: boolean;
  sparks: number;
  compound: number; // index into REC_COMPOUNDS
  position: number;
  lap: number; // laps completed (-1 = on the grid)
  drift: number; // 0..1
  gear: number; // 0 = neutral
}

export function makeCarSample(): CarSample {
  return {
    x: 0, y: 0, a: 0, steer: 0, vf: 0, vl: 0, kmh: 0, rpm: 0, brake: 0,
    drsOpen: false, isBoosting: false, isDrifting: false, inPit: false, sparks: 0,
    compound: 0, position: 1, lap: 0, drift: 0, gear: 0,
  };
}

export interface RecMarker {
  t: number;
  carId: number;
  kind: 'lap' | 'finish';
  lap: number;
  /** Lap time (lap markers) */
  time: number;
}

export interface RecLocation {
  i0: number;
  i1: number;
  f: number;
}

export function wrapAngle(d: number) {
  return d - Math.PI * 2 * Math.round(d / (Math.PI * 2));
}

/** Interpolate angle a -> b along the shortest arc. */
export function lerpAngle(a: number, b: number, f: number) {
  return a + wrapAngle(b - a) * f;
}

export class Recorder {
  readonly maxSamples: number;
  raceId = -1;
  carCount = 0;
  count = 0;
  markers: RecMarker[] = [];
  carMeta: { id: number; code: string; name: string; color: string; isPlayer: boolean }[] = [];

  private floats: Float32Array[] = [];
  private bytes: Uint8Array[] = [];
  private times: Float32Array[] = [];
  private lastT = -1;
  private unsub: (() => void) | null = null;
  private loc: RecLocation = { i0: 0, i1: 0, f: 0 };

  constructor(opts: { maxSeconds?: number } = {}) {
    this.maxSamples = Math.floor((opts.maxSeconds ?? MAX_REC_SECONDS) * REC_HZ);
  }

  /** Total recorded duration in seconds of race time. */
  get duration() {
    return this.count > 0 ? this.timeAt(this.count - 1) : 0;
  }

  get startTime() {
    return this.count > 0 ? this.timeAt(0) : 0;
  }

  /** Approximate memory held by the recording. */
  get bytesUsed() {
    return this.floats.length * (CHUNK * this.carCount * (NF * 4 + NB) + CHUNK * 4);
  }

  reset(carCount = 0, raceId = -1) {
    this.floats = [];
    this.bytes = [];
    this.times = [];
    this.markers = [];
    this.count = 0;
    this.lastT = -1;
    this.carCount = carCount;
    this.raceId = raceId;
  }

  /** Call once per rendered frame after the world has been stepped. */
  capture(w: RecordableWorld) {
    if (w.raceId !== this.raceId) this.begin(w);
    if (w.phase === 'grid' || w.phase === 'lights') return;
    if (this.count >= this.maxSamples) return;
    const t = w.raceTime;
    if (this.count > 0 && t - this.lastT < MIN_INTERVAL) return;
    this.write(w, t);
  }

  private begin(w: RecordableWorld) {
    this.reset(w.cars.length, w.raceId);
    this.carMeta = w.cars.map((c) => {
      const d = (c as unknown as { driver?: { code: string; name: string; livery?: { body: string } }; isPlayer?: boolean });
      return {
        id: c.id,
        code: d.driver?.code ?? `C${c.id}`,
        name: d.driver?.name ?? '',
        color: d.driver?.livery?.body ?? '#ffffff',
        isPlayer: !!d.isPlayer,
      };
    });
    this.unsub?.();
    this.unsub = w.events
      ? w.events.subscribe((e) => {
          if (this.raceId !== w.raceId) return;
          const t = w.raceTime;
          if (e.type === 'lap') this.markers.push({ t, carId: e.carId, kind: 'lap', lap: e.lap, time: e.time });
          else if (e.type === 'finish') this.markers.push({ t, carId: e.carId, kind: 'finish', lap: 0, time: 0 });
        })
      : null;
  }

  private write(w: RecordableWorld, t: number) {
    const i = this.count;
    const ci = (i / CHUNK) | 0;
    const li = i - ci * CHUNK;
    if (ci >= this.floats.length) {
      this.floats.push(new Float32Array(CHUNK * this.carCount * NF));
      this.bytes.push(new Uint8Array(CHUNK * this.carCount * NB));
      this.times.push(new Float32Array(CHUNK));
    }
    this.times[ci][li] = t;
    const F = this.floats[ci];
    const B = this.bytes[ci];
    for (let k = 0; k < this.carCount; k++) {
      const c = w.cars[k];
      const p = c.phys;
      const fo = (li * this.carCount + k) * NF;
      F[fo] = p.x;
      F[fo + 1] = p.y;
      F[fo + 2] = p.a;
      F[fo + 3] = p.steer;
      F[fo + 4] = p.vf;
      F[fo + 5] = p.vl;
      F[fo + 6] = p.kmh;
      F[fo + 7] = p.rpm;
      const bo = (li * this.carCount + k) * NB;
      B[bo] = clampByte(p.brakeInput * 255);
      B[bo + 1] = (p.drsOpen ? FLAG_DRS : 0) | (p.isBoosting ? FLAG_BOOST : 0) | (p.isDrifting ? FLAG_DRIFT : 0) | (c.inPit ? FLAG_PIT : 0);
      B[bo + 2] = clampByte(p.guardRailSparks);
      const ci2 = REC_COMPOUNDS.indexOf(c.compound as (typeof REC_COMPOUNDS)[number]);
      B[bo + 3] = ci2 < 0 ? 0 : ci2;
      B[bo + 4] = clampByte(c.position);
      B[bo + 5] = clampByte(c.timing.lapsCompleted + 1); // stored +1 so the grid (-1) fits
      B[bo + 6] = clampByte(p.driftIntensity * 255);
      B[bo + 7] = typeof p.gear === 'number' ? clampByte(p.gear) : 0;
    }
    this.count++;
    this.lastT = t;
  }

  timeAt(i: number) {
    const ci = (i / CHUNK) | 0;
    return this.times[ci][i - ci * CHUNK];
  }

  /** Find the sample pair bracketing race time `t`. The returned object is reused. */
  locate(t: number): RecLocation {
    const n = this.count;
    const loc = this.loc;
    if (n === 0) {
      loc.i0 = loc.i1 = 0;
      loc.f = 0;
      return loc;
    }
    if (t <= this.timeAt(0)) {
      loc.i0 = loc.i1 = 0;
      loc.f = 0;
      return loc;
    }
    if (t >= this.timeAt(n - 1)) {
      loc.i0 = loc.i1 = n - 1;
      loc.f = 0;
      return loc;
    }
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.timeAt(mid) <= t) lo = mid;
      else hi = mid;
    }
    const t0 = this.timeAt(lo);
    const t1 = this.timeAt(hi);
    loc.i0 = lo;
    loc.i1 = hi;
    loc.f = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
    return loc;
  }

  /** Interpolated sample of car `k` at `loc` (continuous values lerped, angle along the shortest arc). */
  readCar(loc: RecLocation, k: number, out: CarSample): CarSample {
    const cA = (loc.i0 / CHUNK) | 0;
    const cB = (loc.i1 / CHUNK) | 0;
    const slotA = (loc.i0 - cA * CHUNK) * this.carCount + k;
    const slotB = (loc.i1 - cB * CHUNK) * this.carCount + k;
    const fa = this.floats[cA];
    const fb = this.floats[cB];
    const f = loc.f;
    const oa = slotA * NF;
    const ob = slotB * NF;
    out.x = fa[oa] + (fb[ob] - fa[oa]) * f;
    out.y = fa[oa + 1] + (fb[ob + 1] - fa[oa + 1]) * f;
    out.a = lerpAngle(fa[oa + 2], fb[ob + 2], f);
    out.steer = fa[oa + 3] + (fb[ob + 3] - fa[oa + 3]) * f;
    out.vf = fa[oa + 4] + (fb[ob + 4] - fa[oa + 4]) * f;
    out.vl = fa[oa + 5] + (fb[ob + 5] - fa[oa + 5]) * f;
    out.kmh = fa[oa + 6] + (fb[ob + 6] - fa[oa + 6]) * f;
    out.rpm = fa[oa + 7] + (fb[ob + 7] - fa[oa + 7]) * f;
    const ba = this.bytes[cA];
    const bb = this.bytes[cB];
    const boA = slotA * NB;
    const boB = slotB * NB;
    const near = f < 0.5 ? ba : bb; // discrete fields snap to the nearest sample
    const no = f < 0.5 ? boA : boB;
    out.brake = (ba[boA] + (bb[boB] - ba[boA]) * f) / 255;
    const flags = near[no + 1];
    out.drsOpen = (flags & FLAG_DRS) !== 0;
    out.isBoosting = (flags & FLAG_BOOST) !== 0;
    out.isDrifting = (flags & FLAG_DRIFT) !== 0;
    out.inPit = (flags & FLAG_PIT) !== 0;
    out.sparks = near[no + 2];
    out.compound = near[no + 3];
    out.position = near[no + 4];
    out.lap = near[no + 5] - 1;
    out.drift = (ba[boA + 6] + (bb[boB + 6] - ba[boA + 6]) * f) / 255;
    out.gear = near[no + 7];
    return out;
  }

  /** Laps markers for one car, in time order. */
  markersFor(carId: number): RecMarker[] {
    return this.markers.filter((m) => m.carId === carId);
  }
}

function clampByte(v: number) {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

export const recorder = new Recorder();
