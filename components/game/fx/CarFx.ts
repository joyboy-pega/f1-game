import * as THREE from 'three';
import { HW } from '@/lib/game/constants';
import { track } from '@/lib/game/track';
import { world } from '@/lib/game/sim/world';
import { renderPose, type Pose } from '@/lib/game/sim/interp';
import { addCameraShake } from '@/lib/game/fx/shake';
import { frontSlip, rearSlip, sprayStrength } from '@/lib/game/fx/emission';
import type { FxEnv } from '@/lib/game/fx/env';
import { ParticlePool } from './ParticlePool';
import { SkidTrails } from './SkidTrails';

// Wheel contact points in car space (world units; car forward = +f, left = +l). Tyre half widths for skid ribbons.
const WHEELS = [
  { f: 10.4, l: 9.4, hw: 1.7 }, // FL
  { f: 10.4, l: -9.4, hw: 1.7 }, // FR
  { f: -11.3, l: 9.9, hw: 2.2 }, // RL
  { f: -11.3, l: -9.9, hw: 2.2 }, // RR
] as const;

// Per-car accumulator slots (Float32Array, no per-frame allocation).
const A_SMOKE = 0; // 0..3 one per wheel
const A_DUST = 4; // 4..7
const A_SPRAY = 8; // 8..9 wheel spray, 10 tail
const A_SPARK = 11;
const A_FLOOR = 12;
const A_PREV_SPARKS = 13;
const A_RUMBLE = 14;
const SLOTS = 16;

const scratchPose: Pose = { x: 0, y: 0, a: 0 };
const SPAWN_CAP = 6; // per emitter per frame, protects against dt spikes
const NEAR_SQ = 2200 * 2200; // only emit particles for cars within ~220 m of the camera

const rnd = Math.random;

/**
 * Owns every per-car effect: tyre smoke, wall/floor sparks, rain spray, gravel dust, skid ribbons,
 * plus the camera-shake triggers for the player. Pools are sized by the quality tier's particle density.
 */
export class CarFx {
  readonly group = new THREE.Group();
  private smoke: ParticlePool;
  private spray: ParticlePool;
  private dust: ParticlePool;
  private sparks: ParticlePool;
  private skids: SkidTrails;
  private acc: Float32Array;
  private n: number;
  private density: number;

  constructor(density: number, skidSegments: number) {
    this.density = density;
    this.n = world.cars.length;
    this.acc = new Float32Array(Math.max(1, this.n) * SLOTS);
    const cap = (base: number) => Math.max(64, Math.round(base * density));
    this.smoke = new ParticlePool('smoke', cap(1400), new THREE.Vector3(0, 4, 0), 6);
    this.spray = new ParticlePool('smoke', cap(2600), new THREE.Vector3(0, 1, 0), 7);
    this.dust = new ParticlePool('smoke', cap(900), new THREE.Vector3(0, -6, 0), 6);
    this.sparks = new ParticlePool('spark', cap(1000), new THREE.Vector3(0, -130, 0), 8);
    this.skids = new SkidTrails(skidSegments, Math.max(1, this.n) * 4);
    this.group.add(this.skids.mesh, this.dust.mesh, this.smoke.mesh, this.spray.mesh, this.sparks.mesh);
  }

  update(dt: number, camX: number, camZ: number, env: FxEnv) {
    if (world.cars.length !== this.n) {
      // Session rebuilt under us (restart): resize accumulators, keep the pools.
      this.n = world.cars.length;
      this.acc = new Float32Array(Math.max(1, this.n) * SLOTS);
    }
    const d = this.density;
    this.smoke.setLight(env.light);
    this.spray.setLight(Math.max(0.55, env.light));
    this.dust.setLight(env.light);

    for (let i = 0; i < this.n; i++) {
      const car = world.cars[i];
      const p = car.phys;
      // Emit from where the car is DRAWN (interpolated), not from the last fixed step.
      const q = renderPose(car, world.alpha, scratchPose);
      const a = this.acc;
      const o = i * SLOTS;
      const cos = Math.cos(q.a);
      const sin = Math.sin(q.a);
      // Ground plane is XZ: sim y -> world z. Forward = (cos, sin); left = (-sin, cos).
      const kmh = p.kmh;
      const onTrack = car.surface.onTrack;

      // ---- skid ribbons (all cars, regardless of distance) ----
      const rs = rearSlip(p, car.ctrl.throttle);
      const fs = frontSlip(p);
      const wet = env.wet ? 0.5 : 1;
      const markable = onTrack && kmh > 25;
      const rearMark = markable && rs > 0.14 ? Math.min(1, rs * 1.4) * 0.62 * wet : 0;
      const frontMark = markable && fs > 0.22 && p.brakeInput > 0.5 ? Math.min(1, fs * 1.4) * 0.55 * wet : 0;
      for (let w = 0; w < 4; w++) {
        const W = WHEELS[w];
        const wx = q.x + cos * W.f - sin * W.l;
        const wz = q.y + sin * W.f + cos * W.l;
        this.skids.update(i * 4 + w, true, wx, wz, W.hw, w < 2 ? frontMark : rearMark);
      }

      // ---- player-only camera shake ----
      if (car.isPlayer) this.playerShake(dt, a, o, car.surface.dist, onTrack, car.surface.gravel, p.guardRailSparks, kmh);
      else a[o + A_PREV_SPARKS] = p.guardRailSparks;

      const dx = q.x - camX;
      const dz = q.y - camZ;
      if (dx * dx + dz * dz > NEAR_SQ) continue;

      const sv = rnd; // short alias: the emitters below are dense with random jitter
      const back = rnd() * dt;
      const vx = p.vx;
      const vz = p.vy;

      // ---- tyre smoke ----
      for (let w = 0; w < 4; w++) {
        const slip = w < 2 ? fs : rs;
        if (slip < 0.14 || kmh < 8) continue;
        const k = o + A_SMOKE + w;
        a[k] += (w < 2 ? 38 : 80) * slip * d * dt;
        let c = Math.min(SPAWN_CAP, Math.floor(a[k]));
        a[k] -= Math.floor(a[k]);
        const W = WHEELS[w];
        while (c-- > 0) {
          const t = sv() * dt;
          const wx = q.x + cos * W.f - sin * W.l - vx * t + (sv() - 0.5) * 3;
          const wz = q.y + sin * W.f + cos * W.l - vz * t + (sv() - 0.5) * 3;
          const sh = env.light;
          this.smoke.spawn(
            wx, 1 + sv() * 2, wz,
            vx * 0.2 + (sv() - 0.5) * 14, 7 + sv() * 9, vz * 0.2 + (sv() - 0.5) * 14,
            1.0 + sv() * 1.0, 5 + sv() * 3, 28 + sv() * 16,
            (0.34 + sv() * 0.2) * Math.min(1, slip * 1.5), sv(),
            env.smoke[0] * sh, env.smoke[1] * sh, env.smoke[2] * sh, 1.1,
          );
        }
      }

      // ---- gravel / dust kick-up ----
      if (!onTrack && kmh > 25) {
        const gr = car.surface.gravel;
        const base = 60 * Math.min(1, kmh / 160) * d;
        for (let w = 0; w < 4; w++) {
          const k = o + A_DUST + w;
          a[k] += base * (w < 2 ? 0.35 : 1) * dt;
          let c = Math.min(SPAWN_CAP, Math.floor(a[k]));
          a[k] -= Math.floor(a[k]);
          const W = WHEELS[w];
          while (c-- > 0) {
            const t = sv() * dt;
            this.dust.spawn(
              q.x + cos * W.f - sin * W.l - vx * t, 1 + sv() * 2, q.y + sin * W.f + cos * W.l - vz * t,
              vx * 0.12 + (sv() - 0.5) * 22, 10 + sv() * 24, vz * 0.12 + (sv() - 0.5) * 22,
              0.9 + sv() * 0.9, 4 + sv() * 3, 20 + sv() * 14,
              0.42, sv(),
              gr ? 0.7 : 0.46, gr ? 0.6 : 0.43, gr ? 0.45 : 0.3, 1.6,
            );
          }
        }
      }

      // ---- rain / snow spray rooster tail ----
      const spr = sprayStrength(kmh) * env.sprayAmount;
      if (spr > 0.02 && onTrack) {
        const sp = env.spray;
        for (let w = 0; w < 2; w++) {
          const W = WHEELS[2 + w];
          const k = o + A_SPRAY + w;
          a[k] += 50 * spr * d * dt;
          let c = Math.min(SPAWN_CAP, Math.floor(a[k]));
          a[k] -= Math.floor(a[k]);
          while (c-- > 0) {
            const t = sv() * dt;
            this.spray.spawn(
              q.x + cos * W.f - sin * W.l - vx * t, 1.5 + sv() * 2.5, q.y + sin * W.f + cos * W.l - vz * t,
              vx * 0.3 + (-sin * (w ? -1 : 1)) * (6 + sv() * 18) + (sv() - 0.5) * 8, 8 + sv() * 18,
              vz * 0.3 + cos * (w ? -1 : 1) * (6 + sv() * 18) + (sv() - 0.5) * 8,
              0.9 + sv() * 0.8, 7 + sv() * 3, 34 + sv() * 18,
              0.13 + sv() * 0.07, sv(),
              sp[0], sp[1], sp[2], 1.8,
            );
          }
        }
        // Dense mist plume off the rear wing / diffuser.
        const k = o + A_SPRAY + 2;
        a[k] += 80 * spr * d * dt;
        let c = Math.min(SPAWN_CAP + 2, Math.floor(a[k]));
        a[k] -= Math.floor(a[k]);
        while (c-- > 0) {
          const t = sv() * dt;
          const lat = (sv() - 0.5) * 12;
          const fwd = -15;
          this.spray.spawn(
            q.x + cos * fwd - sin * lat - vx * t, 4 + sv() * 6, q.y + sin * fwd + cos * lat - vz * t,
            vx * 0.55 + (sv() - 0.5) * 10, 14 + sv() * 26, vz * 0.55 + (sv() - 0.5) * 10,
            1.1 + sv() * 0.9, 10 + sv() * 4, 50 + sv() * 24,
            0.14 + sv() * 0.07, sv(),
            sp[0], sp[1], sp[2], 1.35,
          );
        }
      }

      // ---- sparks: wall grinding, floor strikes at speed / over kerbs ----
      const gs = p.guardRailSparks;
      if (gs > 0.02) {
        const k = o + A_SPARK;
        a[k] += 420 * gs * d * dt;
        let c = Math.min(14, Math.floor(a[k]));
        a[k] -= Math.floor(a[k]);
        // Wall is on the outside of the track: push sparks out along centreline -> car.
        const T = track.current;
        let ox = q.x - T.px[p.idx];
        let oz = q.y - T.py[p.idx];
        const ol = Math.hypot(ox, oz) || 1;
        ox /= ol;
        oz /= ol;
        while (c-- > 0) {
          const t = sv() * dt;
          const fwd = (sv() - 0.5) * 22;
          this.emitSpark(
            q.x + cos * fwd + ox * 9 - vx * t, 3 + sv() * 4, q.y + sin * fwd + oz * 9 - vz * t,
            vx * (0.45 + sv() * 0.5) + ox * (sv() * 30 - 12), 20 + sv() * 80, vz * (0.45 + sv() * 0.5) + oz * (sv() * 30 - 12),
            0.9,
          );
        }
      }
      const kerb = onTrack && car.surface.dist > HW - 3;
      const floorRate = (kmh > 265 ? ((kmh - 265) / 60) * 10 : 0) + (kerb && kmh > 130 ? 14 : 0);
      if (floorRate > 0 && onTrack) {
        const k = o + A_FLOOR;
        a[k] += floorRate * d * dt;
        let c = Math.min(4, Math.floor(a[k]));
        a[k] -= Math.floor(a[k]);
        while (c-- > 0) {
          const t = sv() * dt;
          const lat = (sv() - 0.5) * 16;
          this.emitSpark(
            q.x + cos * -8 - sin * lat - vx * t, 1 + sv(), q.y + sin * -8 + cos * lat - vz * t,
            vx * 0.1 + (sv() - 0.5) * 30, 10 + sv() * 36, vz * 0.1 + (sv() - 0.5) * 30,
            0.5,
          );
        }
      }
    }

    this.skids.flush();
    this.smoke.flush();
    this.spray.flush();
    this.dust.flush();
    this.sparks.flush();
  }

  /** Burst of sparks (+ a little smoke) where two cars touched. */
  burst(carId: number, intensity: number) {
    const car = world.cars[carId];
    if (!car) return;
    const p = car.phys;
    const n = Math.round((16 + 40 * intensity) * this.density);
    for (let i = 0; i < n; i++) {
      const ang = rnd() * Math.PI * 2;
      const sp = 20 + rnd() * 90 * (0.4 + intensity);
      this.emitSpark(
        p.x + (rnd() - 0.5) * 14, 2 + rnd() * 6, p.y + (rnd() - 0.5) * 14,
        p.vx * 0.5 + Math.cos(ang) * sp, 20 + rnd() * 70, p.vy * 0.5 + Math.sin(ang) * sp,
        0.9,
      );
    }
  }

  private emitSpark(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number) {
    const hot = rnd();
    this.sparks.spawn(
      x, y, z, vx, vy, vz,
      0.25 + rnd() * 0.5, (0.35 + rnd() * 0.35) * size, 0.7 + rnd() * 0.6, 1, rnd(),
      4.2, 1.5 + hot * 1.4, 0.35 + hot * 0.8, 0.7,
    );
  }

  private playerShake(
    dt: number, a: Float32Array, o: number, dist: number, onTrack: boolean, gravel: boolean, gs: number, kmh: number,
  ) {
    const prev = a[o + A_PREV_SPARKS];
    a[o + A_PREV_SPARKS] = gs;
    const s01 = Math.min(1, kmh / 250);
    if (gs > 0.4 && prev <= 0.4) addCameraShake(0.3 + 0.55 * s01);
    // Grinding along a wall keeps the camera juddering.
    if (gs > 0.3) addCameraShake(dt * 2.6, 0.5);

    // Kerb / run-off rumble, pulsed so the cap model keeps it bounded.
    const onKerb = onTrack && dist > HW - 1;
    const rough = !onTrack;
    if ((onKerb || rough) && kmh > 40) {
      a[o + A_RUMBLE] += dt;
      if (a[o + A_RUMBLE] > 0.05) {
        a[o + A_RUMBLE] = 0;
        if (rough) addCameraShake(0.12 * s01, (gravel ? 0.5 : 0.36) * s01);
        else addCameraShake(0.1 * s01, 0.26 * s01);
      }
    }
  }

  dispose() {
    this.skids.dispose();
    this.smoke.dispose();
    this.spray.dispose();
    this.dust.dispose();
    this.sparks.dispose();
  }
}
