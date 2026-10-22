import { HW } from '../constants';
import { track } from '../track';
import type { CameraViewMode } from '../constants';

/** Pure helpers behind the audio layers: no AudioContext, unit-tested in helpers.test.ts. */

export const RPM_MIN = 3900;
export const RPM_MAX = 11000;
export const SPEED_OF_SOUND = 343;

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v: number) => clamp(v, 0, 1);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export function smoothstep(e0: number, e1: number, x: number) {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/** Normalised rpm 0..1 across the usable band. */
export const rpmNorm = (rpm: number) => clamp01((rpm - RPM_MIN) / (RPM_MAX - RPM_MIN));

/** V6 four-stroke: 3 firings per crank revolution -> fundamental = rpm/60 * 3. */
export const firingFreq = (rpm: number) => (Math.max(0, rpm) / 60) * 3;

/**
 * Harmonic amplitudes (index 0 = fundamental). Falls off as 1/h^tilt, with a mild boost on
 * every 2nd/3rd partial: the 120-degree V6 firing pattern is rich in those, which is what
 * gives a V6 its raspy, "tearing" tone compared with a V8/V10 flat-plane wail.
 */
export function harmonicSeries(count: number, tilt = 0.85): Float32Array {
  const a = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const h = i + 1;
    let amp = 1 / Math.pow(h, tilt);
    if (h % 2 === 0) amp *= 1.18;
    if (h % 3 === 0) amp *= 1.12;
    a[i] = amp;
  }
  return a;
}

/** Soft-clip transfer curve for a WaveShaperNode (tanh, normalised). */
export function softClipCurve(samples = 1024, drive = 2.2): Float32Array {
  const c = new Float32Array(samples);
  const norm = Math.tanh(drive);
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;
    c[i] = Math.tanh(x * drive) / norm;
  }
  return c;
}

export type ShiftKind = 'up' | 'down' | null;

/** Detect a gear change between two frames; neutral/reverse transitions are not shifts. */
export function detectShift(prev: number | string | null, cur: number | string): ShiftKind {
  if (typeof prev !== 'number' || typeof cur !== 'number') return null;
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return null;
}

/** MGU-K whine frequency (Hz) rising with road speed. */
export const mguWhineFreq = (kmh: number) => 700 + clamp(kmh, 0, 380) * 9;

/** Turbo whistle frequency (Hz) from spool 0..1. */
export const turboWhistleFreq = (spool: number) => 1900 + clamp01(spool) * 3300;

/**
 * Overrun crackle rate (pops/second). Only above ~8500 rpm with the throttle lifted and
 * decaying after the lift, like real exhaust afterburn.
 */
export function crackleRate(rpm: number, throttle: number, sinceLift: number): number {
  if (throttle > 0.15 || rpm < 8500) return 0;
  const frac = clamp01((rpm - 8500) / 2500);
  return (5 + 22 * frac) * Math.exp(-Math.max(0, sinceLift) / 2.4);
}

/** Doppler pitch ratio. `closing` = relative approach speed in m/s (positive = approaching). */
export function dopplerRatio(closing: number): number {
  const v = clamp(closing, -80, 80);
  return clamp(SPEED_OF_SOUND / (SPEED_OF_SOUND - v), 0.8, 1.25);
}

/** 0..1 how strongly the car is riding a corner kerb. */
export function kerbFactor(lateral: number, curvature: number): number {
  const a = Math.abs(lateral);
  if (a < HW - 1 || a > HW + 14) return 0;
  // Kerbs only exist on corners (see PLAN V3); smoothCurvature p50 = .009, p90 = .05.
  const corner = smoothstep(0.018, 0.045, curvature);
  // Strongest on the kerb proper (HW..HW+10), tapering at both edges.
  const edge = smoothstep(HW - 1, HW + 2, a) * (1 - smoothstep(HW + 10, HW + 14, a));
  return corner * edge;
}

export type SurfaceKind = 'track' | 'grass' | 'gravel';
export function surfaceKind(onTrack: boolean, gravel: boolean): SurfaceKind {
  return onTrack ? 'track' : gravel ? 'gravel' : 'grass';
}

/**
 * Squeal intensity 0..1 from lateral slip / drift / lock-ups. `lockSlip` is the max of
 * physics wheelSlipFront/Rear (1.0 = locked under braking).
 */
export function tyreSqueal(p: {
  vf: number;
  vl: number;
  steer: number;
  driftIntensity: number;
  lockSlip: number;
  brake: number;
  kmh: number;
}): number {
  const cornerSlip = Math.min(1, (Math.abs(p.vl) / Math.max(70, Math.abs(p.vf))) * 2.6 + p.driftIntensity * 0.72 + (Math.abs(p.steer) > 0.5 ? 0.2 : 0));
  const corner = clamp01((cornerSlip - 0.5) / 0.45);
  const lock = p.brake > 0.5 ? clamp01((p.lockSlip - 0.8) / 0.2) : 0;
  const speedGate = clamp01((p.kmh - 30) / 50);
  return Math.max(corner, lock * 0.9) * speedGate;
}

/**
 * Proximity of a spline index to the main grandstands, 0..1. The stands run from idx ~1700
 * up to the line (idx 0) and ~120 past it; the plateau straddles the finish line.
 */
export function crowdProximity(idx: number, n = track.current.N): number {
  let pos = ((idx % n) + n) % n;
  if (pos > n / 2) pos -= n; // negative = before the line
  if (pos < 0) return smoothstep(-300, -90, pos);
  return 1 - smoothstep(40, 200, pos);
}

/** Per-camera mix. Multipliers except `lowDb`/`highDb` (shelving in dB) and `lpHz`. */
export interface CameraMix {
  engine: number;
  lowDb: number;
  highDb: number;
  lpHz: number;
  exhaust: number;
  turbo: number;
  ers: number;
  wind: number;
}

export const CAMERA_MIX: Record<CameraViewMode, CameraMix> = {
  // Behind the car: exhaust + wind dominate, engine a bit further away.
  chase: { engine: 1.0, lowDb: 0, highDb: 1.5, lpHz: 16000, exhaust: 1.0, turbo: 0.8, ers: 0.8, wind: 1.0 },
  tcam: { engine: 0.95, lowDb: -1, highDb: 2.0, lpHz: 16000, exhaust: 1.25, turbo: 0.7, ers: 0.7, wind: 1.3 },
  // On the airbox: close, bassy, turbo and MGU forward, little wind.
  cockpit: { engine: 1.12, lowDb: 5, highDb: -5, lpHz: 7500, exhaust: 0.6, turbo: 1.4, ers: 1.5, wind: 0.55 },
  hood: { engine: 1.18, lowDb: 4, highDb: -2, lpHz: 10000, exhaust: 0.8, turbo: 1.2, ers: 1.2, wind: 0.65 },
};

export interface VoiceCandidate {
  id: number;
  dist: number;
}

/**
 * Re-assign a small pool of positional voices. Cars that are still among the nearest keep
 * their voice (no retrigger glitches); freed voices pick up the nearest unassigned cars.
 * `cands` must be sorted ascending by distance and already limited to the audible range.
 */
export function assignVoices(current: readonly number[], cands: readonly VoiceCandidate[]): number[] {
  const size = current.length;
  const wanted = new Set(cands.slice(0, size).map((c) => c.id));
  const next = current.map((id) => (wanted.has(id) ? id : -1));
  const used = new Set(next.filter((id) => id >= 0));
  for (const c of cands) {
    if (used.has(c.id)) continue;
    const free = next.indexOf(-1);
    if (free < 0) break;
    next[free] = c.id;
    used.add(c.id);
  }
  return next;
}
