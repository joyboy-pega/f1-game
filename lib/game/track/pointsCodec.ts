import type { Pt } from './geo';

/** Pack points as little-endian float32 (x, y) pairs in base64: a 2300-point circuit is ~25 kB of text. */
export function encodePoints(pts: Pt[]): string {
  const f = new Float32Array(pts.length * 2);
  pts.forEach((p, i) => {
    f[i * 2] = p[0];
    f[i * 2 + 1] = p[1];
  });
  const bytes = new Uint8Array(f.buffer);
  let bin = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) bin += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(bin);
}

export function decodePoints(b64: string): Pt[] {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const f = new Float32Array(bytes.buffer);
  const out: Pt[] = [];
  for (let i = 0; i < f.length; i += 2) out.push([f[i], f[i + 1]]);
  return out;
}
