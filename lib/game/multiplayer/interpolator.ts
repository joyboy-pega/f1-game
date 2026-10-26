import type { CarSnapshot } from './protocol';
import type { Pose } from '../sim/interp';

const BUFFER_SIZE = 32;
const MAX_EXTRAPOLATION_SEC = 0.25;

/** Normalizes angle difference to [-PI, PI] to prevent 360-degree spins. */
export function unwrapAngle(from: number, to: number): number {
  let diff = (to - from) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  else if (diff < -Math.PI) diff += Math.PI * 2;
  return from + diff;
}

export class SnapshotInterpolator {
  private buffers = new Map<number, CarSnapshot[]>();

  reset() {
    this.buffers.clear();
  }

  push(snapshot: CarSnapshot) {
    let buf = this.buffers.get(snapshot.carId);
    if (!buf) {
      buf = [];
      this.buffers.set(snapshot.carId, buf);
    }
    // Maintain ascending order by timestamp
    if (buf.length > 0 && snapshot.timestamp <= buf[buf.length - 1].timestamp) {
      return; // Discard out-of-order packet
    }
    buf.push(snapshot);
    if (buf.length > BUFFER_SIZE) {
      buf.shift();
    }
  }

  sample(carId: number, renderTime: number, out: Pose): boolean {
    const buf = this.buffers.get(carId);
    if (!buf || buf.length === 0) return false;

    // If renderTime is older than our oldest snapshot, clamp to oldest
    if (renderTime <= buf[0].timestamp) {
      const s0 = buf[0];
      out.x = s0.x;
      out.y = s0.y;
      out.a = s0.a;
      return true;
    }

    const latest = buf[buf.length - 1];
    // If renderTime exceeds latest snapshot, dead-reckon extrapolate
    if (renderTime >= latest.timestamp) {
      const dt = Math.min(MAX_EXTRAPOLATION_SEC, renderTime - latest.timestamp);
      const cA = Math.cos(latest.a);
      const sA = Math.sin(latest.a);
      out.x = latest.x + (latest.vf * cA - latest.vl * sA) * dt;
      out.y = latest.y + (latest.vf * sA + latest.vl * cA) * dt;
      out.a = latest.a + latest.yawRate * dt;
      return true;
    }

    // Binary search or linear scan for bracket [s0, s1]
    let s0 = buf[0];
    let s1 = buf[1];
    for (let i = 0; i < buf.length - 1; i++) {
      if (renderTime >= buf[i].timestamp && renderTime <= buf[i + 1].timestamp) {
        s0 = buf[i];
        s1 = buf[i + 1];
        break;
      }
    }

    const dt = s1.timestamp - s0.timestamp;
    const factor = dt > 0 ? (renderTime - s0.timestamp) / dt : 0;
    const alpha = Math.max(0, Math.min(1, factor));

    out.x = s0.x + (s1.x - s0.x) * alpha;
    out.y = s0.y + (s1.y - s0.y) * alpha;
    const unwrappedA1 = unwrapAngle(s0.a, s1.a);
    out.a = s0.a + (unwrappedA1 - s0.a) * alpha;

    return true;
  }
}
