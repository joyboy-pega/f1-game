import { CAR_SCALE, COLLISION_CONFIG } from '../constants';
import type { EventBus } from './events';
import type { WorldCar } from './types';
import { arcDelta } from './ai';

const { offsets, radius, restitution, friction, yawGain, maxYawKick, broadphase, eventCooldown, minEventSpeed } = COLLISION_CONFIG;
const MAX_DAMAGE = 0.15;

function massOf(car: WorldCar): number {
  // A car stopped in its pit box is hard to shove around.
  return car.pit?.stage === 'service' ? 6 : 1;
}

/**
 * Car-to-car collisions: three circles per car along its heading, broadphase on track position,
 * positional correction split by mass, impulse with restitution and tangential friction,
 * and a small yaw kick. Emits rate-limited `collision` events for both cars.
 */
export class CollisionSystem {
  private cooldown = new Map<number, number>();

  reset() {
    this.cooldown.clear();
  }

  resolve(cars: WorldCar[], raceTime: number, events: EventBus, damageEnabled: boolean) {
    const n = cars.length;
    for (let i = 0; i < n; i++) {
      const A = cars[i];
      for (let j = i + 1; j < n; j++) {
        const B = cars[j];
        if (Math.abs(arcDelta(A.timing.lastS, B.timing.lastS)) > broadphase) continue;
        const pa = A.phys;
        const pb = B.phys;
        const dxc = pa.x - pb.x;
        const dyc = pa.y - pb.y;
        if (dxc * dxc + dyc * dyc > 70 * 70) continue;
        this.pair(A, B, i * 64 + j, raceTime, events, damageEnabled);
      }
    }
  }

  private pair(A: WorldCar, B: WorldCar, key: number, raceTime: number, events: EventBus, damageEnabled: boolean) {
    const pa = A.phys;
    const pb = B.phys;
    const ca = Math.cos(pa.a);
    const sa = Math.sin(pa.a);
    const cb = Math.cos(pb.a);
    const sb = Math.sin(pb.a);
    const minDist = 2 * radius;

    let nx = 0;
    let ny = 0;
    let wsum = 0;
    let maxPen = 0;
    let cx = 0;
    let cy = 0;
    for (let a = 0; a < 3; a++) {
      const ax = pa.x + ca * offsets[a];
      const ay = pa.y + sa * offsets[a];
      for (let b = 0; b < 3; b++) {
        const bx = pb.x + cb * offsets[b];
        const by = pb.y + sb * offsets[b];
        const dx = ax - bx;
        const dy = ay - by;
        const d2 = dx * dx + dy * dy;
        if (d2 >= minDist * minDist) continue;
        const d = Math.sqrt(d2);
        const pen = minDist - d;
        let ux: number;
        let uy: number;
        if (d > 1e-4) {
          ux = dx / d;
          uy = dy / d;
        } else {
          // coincident circles: push apart along the line between the car centres
          const ddx = pa.x - pb.x;
          const ddy = pa.y - pb.y;
          const dl = Math.hypot(ddx, ddy) || 1;
          ux = ddx / dl;
          uy = ddy / dl;
        }
        nx += ux * pen;
        ny += uy * pen;
        wsum += pen;
        cx += (ax + bx) * 0.5 * pen;
        cy += (ay + by) * 0.5 * pen;
        if (pen > maxPen) maxPen = pen;
      }
    }
    if (wsum === 0) return;
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;
    cx /= wsum;
    cy /= wsum;

    const mA = massOf(A);
    const mB = massOf(B);
    const iA = 1 / mA;
    const iB = 1 / mB;
    const iSum = iA + iB;

    // Positional correction (n points from B toward A)
    const corr = maxPen * 0.9 + 0.05;
    pa.x += nx * corr * (iA / iSum);
    pa.y += ny * corr * (iA / iSum);
    pb.x -= nx * corr * (iB / iSum);
    pb.y -= ny * corr * (iB / iSum);

    const rvx = pa.vx - pb.vx;
    const rvy = pa.vy - pb.vy;
    const vn = rvx * nx + rvy * ny;
    if (vn >= 0) return; // already separating

    const j = (-(1 + restitution) * vn) / iSum;
    let dAx = j * iA * nx;
    let dAy = j * iA * ny;
    let dBx = -j * iB * nx;
    let dBy = -j * iB * ny;

    // Tangential friction (Coulomb)
    const tvx = rvx - vn * nx;
    const tvy = rvy - vn * ny;
    const tl = Math.hypot(tvx, tvy);
    if (tl > 1e-3) {
      const jt = Math.min(tl / iSum, friction * j);
      const tx = tvx / tl;
      const ty = tvy / tl;
      dAx -= jt * iA * tx;
      dAy -= jt * iA * ty;
      dBx += jt * iB * tx;
      dBy += jt * iB * ty;
    }

    // Yaw kick from the off-centre contact (angular velocity is not a state, so it is a heading nudge)
    const kickA = Math.max(-maxYawKick, Math.min(maxYawKick, yawGain * ((cx - pa.x) * dAy - (cy - pa.y) * dAx)));
    const kickB = Math.max(-maxYawKick, Math.min(maxYawKick, yawGain * ((cx - pb.x) * dBy - (cy - pb.y) * dBx)));

    pa.vx += dAx;
    pa.vy += dAy;
    pb.vx += dBx;
    pb.vy += dBy;
    pa.a += kickA * (iA / iSum) * 2;
    pb.a += kickB * (iB / iSum) * 2;
    syncLocalVelocity(pa);
    syncLocalVelocity(pb);
    syncVeh(pa);
    syncVeh(pb);

    const closing = -vn;
    const last = this.cooldown.get(key) ?? -99;
    if (closing >= minEventSpeed && raceTime - last >= eventCooldown) {
      this.cooldown.set(key, raceTime);
      const intensity = Math.min(1, closing / 300);
      events.emit({ type: 'collision', carId: A.id, otherId: B.id, intensity });
      events.emit({ type: 'collision', carId: B.id, otherId: A.id, intensity });
      A.lastCollisionTime = raceTime;
      B.lastCollisionTime = raceTime;
      if (damageEnabled && intensity > 0.45) {
        // Contact ahead of the car's mid-point counts as a front impact
        const fA = (cx - pa.x) * ca + (cy - pa.y) * sa;
        const fB = (cx - pb.x) * cb + (cy - pb.y) * sb;
        if (fA > 0.5 * CAR_SCALE) A.damage = Math.min(MAX_DAMAGE, A.damage + 0.05 * intensity);
        if (fB > 0.5 * CAR_SCALE) B.damage = Math.min(MAX_DAMAGE, B.damage + 0.05 * intensity);
      }
    } else if (closing >= 3) {
      A.lastCollisionTime = raceTime;
      B.lastCollisionTime = raceTime;
    }
  }
}

/** Keep vf/vl consistent with vx/vy (physics recomputes them from vx/vy at the start of each step). */
function syncLocalVelocity(p: WorldCar['phys']) {
  const c = Math.cos(p.a);
  const s = Math.sin(p.a);
  p.vf = p.vx * c + p.vy * s;
  p.vl = -p.vx * s + p.vy * c;
}

function syncVeh(p: WorldCar['phys']) {
  if (p._veh) {
    p._veh.x = p.x / 10;
    p._veh.y = p.y / 10;
    p._veh.yaw = p.a;
    const c = Math.cos(p.a);
    const s = Math.sin(p.a);
    p._veh.vx = (p.vx * c + p.vy * s) / 10;
    p._veh.vy = (-p.vx * s + p.vy * c) / 10;
  }
}
