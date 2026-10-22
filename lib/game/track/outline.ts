import type { TrackRuntime } from './types';

export interface Outline {
  /** SVG path data (closed polygon through the centreline). */
  d: string;
  /** Start/finish marker position in the same box. */
  start: { x: number; y: number };
  /** Heading of travel at the start line in SVG space (radians, for rotating a tick mark). */
  startAngle: number;
}

/**
 * Minimap outline of a track fitted into a `w` x `h` box with `pad` margin, from its centreline.
 * World y maps to SVG y unchanged (the same orientation the in-game minimap uses). `maxPoints` thins long centrelines.
 */
export function trackOutline(rt: TrackRuntime, w: number, h: number, pad = 8, maxPoints = 240): Outline {
  const { minX, maxX, minY, maxY } = rt.bounds;
  const s = Math.min((w - pad * 2) / (maxX - minX), (h - pad * 2) / (maxY - minY));
  const ox = w / 2 - ((minX + maxX) / 2) * s;
  const oy = h / 2 - ((minY + maxY) / 2) * s;
  const step = Math.max(1, Math.ceil(rt.N / maxPoints));
  const f = (v: number) => Math.round(v * 100) / 100;
  let d = '';
  for (let i = 0; i < rt.N; i += step) {
    d += `${i === 0 ? 'M' : 'L'}${f(rt.px[i] * s + ox)} ${f(rt.py[i] * s + oy)}`;
  }
  d += 'Z';
  return {
    d,
    start: { x: f(rt.px[0] * s + ox), y: f(rt.py[0] * s + oy) },
    startAngle: Math.atan2(rt.ty[0], rt.tx[0]),
  };
}
