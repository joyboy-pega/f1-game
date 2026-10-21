// Time-trial ghost: the player's best lap, recorded at ~30 Hz relative to lap start.
// Persisted per weather in localStorage as a base64 Float32Array (a 100 s lap is ~130 KB).

import type { SimEvent } from '../sim/events';
import { lerpAngle } from '../sim/recorder';

export const GHOST_HZ = 30;
const MIN_INTERVAL = 1 / GHOST_HZ - 0.0025;
/** floats per sample: t, x, y, a, steer, vf, brake, drs */
export const GHOST_STRIDE = 8;
const MAX_LAP_SECONDS = 600;

export interface GhostLap {
  weather: string;
  lapTime: number;
  /** Sample count. */
  n: number;
  data: Float32Array;
}

export interface GhostSample {
  x: number;
  y: number;
  a: number;
  steer: number;
  vf: number;
  brake: number;
  drsOpen: boolean;
}

export const ghostKey = (weather: string) => `buddh-gp-ghost:${weather}`;

// ----------------------------------------------------------------------------- serialisation

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) bin += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Compact JSON: `{v:1, w, t, n, d}` with `d` the base64 of the little-endian float32 samples. */
export function serializeGhost(g: GhostLap): string {
  const bytes = new Uint8Array(g.data.buffer, g.data.byteOffset, g.n * GHOST_STRIDE * 4);
  return JSON.stringify({ v: 1, w: g.weather, t: Math.round(g.lapTime * 1000) / 1000, n: g.n, d: toBase64(bytes) });
}

export function parseGhost(raw: string | null): GhostLap | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    if (!o || o.v !== 1 || typeof o.d !== 'string' || typeof o.n !== 'number' || typeof o.t !== 'number') return null;
    const bytes = fromBase64(o.d);
    if (bytes.length !== o.n * GHOST_STRIDE * 4 || o.n < 2) return null;
    // Copy into a fresh, aligned buffer.
    const data = new Float32Array(o.n * GHOST_STRIDE);
    new Uint8Array(data.buffer).set(bytes);
    return { weather: String(o.w ?? ''), lapTime: o.t, n: o.n, data };
  } catch {
    return null;
  }
}

export function loadGhost(weather: string): GhostLap | null {
  try {
    return parseGhost(localStorage.getItem(ghostKey(weather)));
  } catch {
    return null;
  }
}

export function saveGhost(g: GhostLap): boolean {
  try {
    localStorage.setItem(ghostKey(g.weather), serializeGhost(g));
    return true;
  } catch {
    return false; // quota / private mode: keep the in-memory ghost for this session only
  }
}

// ----------------------------------------------------------------------------- sampling

/** Interpolated ghost state at lap time `t`; returns false when `t` is outside the recorded lap. */
export function sampleGhost(g: GhostLap, t: number, out: GhostSample): boolean {
  const d = g.data;
  const n = g.n;
  if (t < 0 || t > d[(n - 1) * GHOST_STRIDE] + 0.05) return false;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (d[mid * GHOST_STRIDE] <= t) lo = mid;
    else hi = mid;
  }
  const a = lo * GHOST_STRIDE;
  const b = hi * GHOST_STRIDE;
  const t0 = d[a];
  const t1 = d[b];
  const f = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 0;
  out.x = d[a + 1] + (d[b + 1] - d[a + 1]) * f;
  out.y = d[a + 2] + (d[b + 2] - d[a + 2]) * f;
  out.a = lerpAngle(d[a + 3], d[b + 3], f);
  out.steer = d[a + 4] + (d[b + 4] - d[a + 4]) * f;
  out.vf = d[a + 5] + (d[b + 5] - d[a + 5]) * f;
  out.brake = d[a + 6] + (d[b + 6] - d[a + 6]) * f;
  out.drsOpen = (f < 0.5 ? d[a + 7] : d[b + 7]) > 0.5;
  return true;
}

// ----------------------------------------------------------------------------- store

type Listener = () => void;

/** Best ghost for the current weather; the Ghost component subscribes to changes. */
export const ghostStore = {
  best: null as GhostLap | null,
  listeners: new Set<Listener>(),
  set(g: GhostLap | null) {
    this.best = g;
    this.listeners.forEach((fn) => fn());
  },
  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  },
};

// ----------------------------------------------------------------------------- recorder

export interface GhostWorld {
  raceId: number;
  raceTime: number;
  settings: { mode: string; weather: string };
  player: {
    id: number;
    timing: { lapStartTime: number | null };
    phys: { x: number; y: number; a: number; steer: number; vf: number; vx: number; vy: number; brakeInput: number; drsOpen: boolean };
  };
  events?: { subscribe(fn: (e: SimEvent) => void): () => void };
}

interface PendingLap {
  lapTime: number;
  n: number;
  data: Float32Array;
  valid: boolean;
}

export class GhostRecorder {
  private raceId = -1;
  private buf = new Float32Array(GHOST_STRIDE * GHOST_HZ * 180);
  private n = 0;
  private curStart: number | null = null;
  private valid = true;
  private pending: PendingLap | null = null;
  private unsub: (() => void) | null = null;
  private world: GhostWorld | null = null;
  private lastRel = -1;

  /** Call once per rendered frame after the world has been stepped (before events are flushed). */
  capture(w: GhostWorld) {
    if (w.raceId !== this.raceId) this.begin(w);
    if (w.settings.mode !== 'timetrial') return;

    const ls = w.player.timing.lapStartTime;
    if (ls !== this.curStart) {
      this.finishLap(w, ls);
      this.curStart = ls;
      this.n = 0;
      this.lastRel = -1;
      this.valid = true;
    }
    if (ls === null) return;
    const rel = w.raceTime - ls;
    if (rel > MAX_LAP_SECONDS) return;
    if (this.n > 0 && rel - this.lastRel < MIN_INTERVAL) return;
    this.push(rel, w.player.phys);
    this.lastRel = rel;
  }

  private begin(w: GhostWorld) {
    this.raceId = w.raceId;
    this.world = w;
    this.n = 0;
    this.curStart = null;
    this.pending = null;
    this.valid = true;
    this.lastRel = -1;
    this.unsub?.();
    this.unsub = null;
    if (w.settings.mode === 'timetrial') {
      ghostStore.set(loadGhost(w.settings.weather));
      if (w.events) this.unsub = w.events.subscribe((e) => this.onEvent(e));
    } else {
      ghostStore.set(null);
    }
  }

  private push(rel: number, p: GhostWorld['player']['phys']) {
    if ((this.n + 1) * GHOST_STRIDE > this.buf.length) {
      const bigger = new Float32Array(this.buf.length * 2);
      bigger.set(this.buf);
      this.buf = bigger;
    }
    const o = this.n * GHOST_STRIDE;
    const b = this.buf;
    b[o] = rel;
    b[o + 1] = p.x;
    b[o + 2] = p.y;
    b[o + 3] = p.a;
    b[o + 4] = p.steer;
    b[o + 5] = p.vf;
    b[o + 6] = p.brakeInput;
    b[o + 7] = p.drsOpen ? 1 : 0;
    this.n++;
  }

  /** The lap that just ended (timing.lapStartTime moved on): snapshot it so a following `lap` event can claim it. */
  private finishLap(w: GhostWorld, newStart: number | null) {
    const oldStart = this.curStart;
    if (oldStart === null || newStart === null || this.n < 2) {
      this.pending = null;
      return;
    }
    const lapTime = newStart - oldStart;
    // Cap the lap exactly on the line: step back from the (slightly past-line) current state.
    const over = Math.max(0, w.raceTime - newStart);
    const p = w.player.phys;
    this.push(lapTime, { ...p, x: p.x - p.vx * over, y: p.y - p.vy * over });
    this.pending = { lapTime, n: this.n, data: this.buf.slice(0, this.n * GHOST_STRIDE), valid: this.valid };
  }

  private onEvent(e: SimEvent) {
    const w = this.world;
    if (!w) return;
    if (e.type === 'reset' && e.carId === w.player.id) this.valid = false; // teleported: lap isn't a clean reference
    if (e.type === 'lap' && e.carId === w.player.id && e.personalBest) this.commit(w.settings.weather);
  }

  commit(weather: string) {
    const p = this.pending;
    this.pending = null;
    if (!p || !p.valid || p.n < 2) return;
    const best = ghostStore.best;
    if (best && best.lapTime <= p.lapTime) return;
    const g: GhostLap = { weather, lapTime: p.lapTime, n: p.n, data: p.data };
    saveGhost(g);
    ghostStore.set(g);
  }
}

export const ghostRecorder = new GhostRecorder();
