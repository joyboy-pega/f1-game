// Camera rig: chase / T-cam / cockpit / nose cam with critically-damped springs, g-force head
// movement, look-back, shake and smooth view transitions. Pure three.js (no React) so both the
// live camera and the replay director can drive it.
//
// Everything is frame-rate independent: springs use the exact critically-damped solution and
// filters use 1 - exp(-k dt). Springs run on the offset *from the car*, not on absolute world
// position, so there is no steady-state lag that grows with speed.

import * as THREE from 'three';
import { consumeCameraShake } from '@/lib/game/fx/shake';
import { CAR_SCALE, type VehicleModelType } from '@/lib/game/constants';
import {
  COCKPIT_EYE as MODEL_COCKPIT_EYE,
  NOSE_CAM as MODEL_NOSE_CAM,
  TCAM as MODEL_TCAM,
  ROADSTER_COCKPIT_EYE,
  ROADSTER_NOSE_CAM,
  ROADSTER_TCAM,
  PEGASUS_COCKPIT_EYE,
  PEGASUS_NOSE_CAM,
  PEGASUS_TCAM,
} from '@/components/game/car/dimensions';
import { surfaceHeight, surfaceGradeAngle, surfaceCamberAngle, surfaceIndex } from '@/lib/game/track/surface';
import { track } from '@/lib/game/track';

export type RigMode = 'chase' | 'tcam' | 'cockpit' | 'hood' | 'intro';

/** The subset of car state the rig reads (CarPhysicsState satisfies it). */
export interface RigCar {
  x: number;
  y: number;
  a: number;
  vf: number;
  vl: number;
  kmh: number;
  steer: number;
  isDrifting: boolean;
  driftAngle: number;
  isBoosting: boolean;
  drsOpen: boolean;
  idx?: number;
  carModel?: VehicleModelType;
}

// Anchors come from the car model (car/dimensions.ts, car-local model units: [x lateral, y up, z forward]) so the
// camera sits where the cockpit really is. Converted to world units with CAR_SCALE; `fwd` is along the car heading.
// CAR_ROOT_Y is the car group's height above the ground (F1Car places it at y = 0.05).
const CAR_ROOT_Y = 0.05;
export const COCKPIT_EYE = { fwd: MODEL_COCKPIT_EYE[2] * CAR_SCALE, h: MODEL_COCKPIT_EYE[1] * CAR_SCALE + CAR_ROOT_Y, lat: 0 };
export const NOSE_CAM = { fwd: MODEL_NOSE_CAM[2] * CAR_SCALE, h: MODEL_NOSE_CAM[1] * CAR_SCALE + CAR_ROOT_Y, lat: 0 };
export const TCAM = { back: -MODEL_TCAM[2] * CAR_SCALE, h: MODEL_TCAM[1] * CAR_SCALE + CAR_ROOT_Y, lat: 0 };

function getAnchorsForModel(model?: VehicleModelType) {
  if (model === 'roadster') {
    return {
      cockpit: { fwd: ROADSTER_COCKPIT_EYE[2] * CAR_SCALE, h: ROADSTER_COCKPIT_EYE[1] * CAR_SCALE + CAR_ROOT_Y, lat: -ROADSTER_COCKPIT_EYE[0] * CAR_SCALE },
      nose: { fwd: ROADSTER_NOSE_CAM[2] * CAR_SCALE, h: ROADSTER_NOSE_CAM[1] * CAR_SCALE + CAR_ROOT_Y, lat: 0 },
      tcam: { back: -ROADSTER_TCAM[2] * CAR_SCALE, h: ROADSTER_TCAM[1] * CAR_SCALE + CAR_ROOT_Y, lat: 0 },
    };
  }
  if (model === 'pegasus') {
    return {
      cockpit: { fwd: PEGASUS_COCKPIT_EYE[2] * CAR_SCALE, h: PEGASUS_COCKPIT_EYE[1] * CAR_SCALE + CAR_ROOT_Y, lat: 0 },
      nose: { fwd: PEGASUS_NOSE_CAM[2] * CAR_SCALE, h: PEGASUS_NOSE_CAM[1] * CAR_SCALE + CAR_ROOT_Y, lat: 0 },
      tcam: { back: -PEGASUS_TCAM[2] * CAR_SCALE, h: PEGASUS_TCAM[1] * CAR_SCALE + CAR_ROOT_Y, lat: 0 },
    };
  }
  return {
    cockpit: COCKPIT_EYE,
    nose: NOSE_CAM,
    tcam: TCAM,
  };
}

const G = 98.1; // 1 g in world units/s^2 (1 unit = 0.1 m)
const UP = new THREE.Vector3(0, 1, 0);

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth01 = (t: number) => t * t * (3 - 2 * t);
const wrap = (d: number) => d - Math.PI * 2 * Math.round(d / (Math.PI * 2));
const damp = (dt: number, k: number) => 1 - Math.exp(-k * dt);

export class Spring1 {
  x = 0;
  v = 0;
  step(target: number, omega: number, dt: number) {
    const e = Math.exp(-omega * dt);
    const d = this.x - target;
    const tmp = (this.v + omega * d) * dt;
    this.x = target + (d + tmp) * e;
    this.v = (this.v - omega * tmp) * e;
    return this.x;
  }
  snap(x: number) {
    this.x = x;
    this.v = 0;
  }
}

export class Spring3 {
  readonly x = new Spring1();
  readonly y = new Spring1();
  readonly z = new Spring1();
  step(tx: number, ty: number, tz: number, omega: number, dt: number) {
    this.x.step(tx, omega, dt);
    this.y.step(ty, omega, dt);
    this.z.step(tz, omega, dt);
  }
  snap(x: number, y: number, z: number) {
    this.x.snap(x);
    this.y.snap(y);
    this.z.snap(z);
  }
}

/** Cheap smooth pseudo-noise in [-1, 1]: sum of incommensurate sines. */
function noise(t: number, seed: number) {
  return (Math.sin(t * 38.1 + seed * 1.7) + 0.6 * Math.sin(t * 61.3 + seed * 3.1) + 0.4 * Math.sin(t * 97.7 + seed * 5.3)) / 2;
}

const SHAKE_POS: Record<Exclude<RigMode, 'intro'>, number> = { chase: 2.6, tcam: 1.4, cockpit: 1.8, hood: 1.5 };
const SHAKE_ROT: Record<Exclude<RigMode, 'intro'>, number> = { chase: 0.012, tcam: 0.02, cockpit: 0.04, hood: 0.03 };
const VIB_POS: Record<Exclude<RigMode, 'intro'>, number> = { chase: 0.05, tcam: 0.16, cockpit: 0.22, hood: 0.32 };
const VIB_ROT: Record<Exclude<RigMode, 'intro'>, number> = { chase: 0.0005, tcam: 0.0015, cockpit: 0.0025, hood: 0.0035 };

export interface RigOptions {
  lookBack: boolean;
  /** Intro progress 0..1 (mode 'intro' only). */
  introP?: number;
  /** Pole-position car (intro camera starts near it). */
  pole?: { x: number; y: number; a: number; idx?: number };
  /** Seconds to blend from the previous pose when `mode` changes. Default 0.5. */
  blend?: number;
  /** Scale for random shake (replay uses less). */
  shakeScale?: number;
}

// Scratch objects (module scope: the rig runs once per frame, never re-entrantly).
const _eye = new THREE.Vector3();
const _look = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _qr = new THREE.Quaternion();
const _qs = new THREE.Quaternion();
const _e = new THREE.Euler();
const _zAxis = new THREE.Vector3(0, 0, 1);
const _cp = new THREE.Vector3();
const _cq = new THREE.Quaternion();

export class CameraRig {
  private ready = false;
  private time = 0;

  // Chase
  private chaseOff = new Spring3();
  private chaseLook = new Spring3();
  private yawLag = 0;
  private chasePrevBase = 0;
  private chaseSeeded = false;
  private lb = 0; // look-back blend 0..1

  // Kinematics derived from car state
  private prevA = 0;
  private prevVf = 0;
  private yawRate = 0;
  private accLon = 0;

  // Cockpit head / lead
  private head = new Spring3(); // x = right, y = up, z = fwd
  private lead = new Spring1();
  private rollS = new Spring1();
  private pitchS = new Spring1();

  private fov = 60;

  // View transition
  private mode: RigMode | null = null;
  private blendT = 1;
  private blendDur = 0.5;
  private fromPos = new THREE.Vector3();
  private fromQuat = new THREE.Quaternion();

  // Output pose
  private fovTarget = 60;

  /** Drop all smoothing state; the next update snaps to its target pose. */
  reset() {
    this.ready = false;
    this.mode = null;
    this.blendT = 1;
  }

  update(cam: THREE.PerspectiveCamera, car: RigCar, mode: RigMode, rawDt: number, o: RigOptions) {
    const dt = clamp(rawDt, 1 / 1000, 0.1);
    this.time += dt;

    if (!this.ready) this.snapTo(car, mode);
    this.kinematics(car, dt);
    this.lb += ((o.lookBack ? 1 : 0) - this.lb) * damp(dt, 9);

    const s = clamp(car.kmh / 330, 0, 1.15);
    const sm = smooth01(clamp(s, 0, 1));
    let roll = 0;
    let shakeMode: Exclude<RigMode, 'intro'> = 'chase';

    switch (mode) {
      case 'chase':
      case 'intro':
        roll = this.chase(car, dt, s, sm);
        if (mode === 'intro') this.intro(car, o);
        shakeMode = 'chase';
        break;
      case 'tcam':
        roll = this.rigid(car, dt, s, 'tcam');
        shakeMode = 'tcam';
        break;
      case 'cockpit':
        roll = this.rigid(car, dt, s, 'cockpit');
        shakeMode = 'cockpit';
        break;
      case 'hood':
        roll = this.rigid(car, dt, s, 'hood');
        shakeMode = 'hood';
        break;
    }

    // Field of view: speed-based, smoothed; widened on portrait screens so the car stays framed.
    this.fov += (this.fovTarget - this.fov) * damp(dt, 5);
    const aspect = cam.aspect || 1.6;
    const fovOut = this.fov * (aspect < 1.25 ? 1 + (1.25 - aspect) * 0.42 : 1);
    if (Math.abs(cam.fov - fovOut) > 0.01) {
      cam.fov = fovOut;
      cam.updateProjectionMatrix();
    }

    // Shake: impact trauma from the FX agent + subtle speed vibration.
    const trauma = consumeCameraShake(dt) * (o.shakeScale ?? 1);
    const vib = s * s;
    const t = this.time;
    const pAmp = trauma * SHAKE_POS[shakeMode] + vib * VIB_POS[shakeMode];
    const rAmp = trauma * SHAKE_ROT[shakeMode] + vib * VIB_ROT[shakeMode];
    _eye.x += noise(t, 1) * pAmp;
    _eye.y += noise(t, 2) * pAmp;
    _eye.z += noise(t, 3) * pAmp;

    // Pose -> quaternion
    _m.lookAt(_eye, _look, UP);
    _q.setFromRotationMatrix(_m);
    _qr.setFromAxisAngle(_zAxis, roll + noise(t, 6) * rAmp);
    _q.multiply(_qr);
    _e.set(noise(t, 4) * rAmp, noise(t, 5) * rAmp, 0);
    _qs.setFromEuler(_e);
    _q.multiply(_qs);

    // Smooth transition between views (and from the intro)
    if (this.mode !== mode) {
      if (this.mode !== null && this.ready) {
        this.fromPos.copy(cam.position);
        this.fromQuat.copy(cam.quaternion);
        this.blendDur = o.blend ?? 0.5;
        this.blendT = this.blendDur > 0 ? 0 : 1;
      }
      this.mode = mode;
    }
    if (this.blendT < 1) {
      this.blendT = Math.min(1, this.blendT + dt / this.blendDur);
      const e = smooth01(this.blendT);
      _cp.copy(this.fromPos).lerp(_eye, e);
      _cq.copy(this.fromQuat).slerp(_q, e);
      cam.position.copy(_cp);
      cam.quaternion.copy(_cq);
    } else {
      cam.position.copy(_eye);
      cam.quaternion.copy(_q);
    }
    this.ready = true;
  }

  // -------------------------------------------------------------------------- internals

  private snapTo(car: RigCar, mode?: RigMode) {
    this.prevA = car.a;
    this.prevVf = car.vf;
    this.yawRate = 0;
    this.accLon = 0;
    this.yawLag = 0;
    this.lb = 0;
    this.chasePrevBase = car.a;
    this.chaseSeeded = false;
    this.head.snap(0, 0, 0);
    this.lead.snap(0);
    this.rollS.snap(0);
    this.pitchS.snap(0);
    const initialFov = mode === 'intro' ? 44 : 60;
    this.fov = this.fovTarget = initialFov;
  }

  /** Smoothed yaw rate and longitudinal acceleration, for head movement and chase pumping. */
  private kinematics(car: RigCar, dt: number) {
    const yr = clamp(wrap(car.a - this.prevA) / dt, -4, 4);
    const ac = clamp((car.vf - this.prevVf) / dt, -6 * G, 4 * G);
    this.prevA = car.a;
    this.prevVf = car.vf;
    this.yawRate += (yr - this.yawRate) * damp(dt, 10);
    this.accLon += (ac - this.accLon) * damp(dt, 8);
  }

  private chase(car: RigCar, dt: number, s: number, sm: number): number {
    // Yaw lag: the camera heading trails the car so you see it rotate in corners.
    const drift = car.isDrifting && car.vf > 60 ? -car.driftAngle * 0.38 : 0;
    const base = car.a + drift;
    // lag = yaw - base: when `base` moves the lag grows by the opposite amount, then decays.
    const dBase = wrap(base - this.chasePrevBase);
    this.chasePrevBase = base;
    this.yawLag = clamp((this.yawLag - dBase) * Math.exp(-4.5 * dt), -0.65, 0.65);
    const yaw = base + this.yawLag + this.lb * Math.PI;

    const gLon = clamp(this.accLon / G, -2, 1.5);
    const dist = lerp(88, 116, sm) + gLon * 9;
    const h = lerp(32, 23, sm) - Math.abs(gLon) * 0.5;
    const tx = -Math.cos(yaw) * dist;
    const tz = -Math.sin(yaw) * dist;

    const look = base + this.lb * Math.PI;
    const lx = Math.cos(look) * 42;
    const lz = Math.sin(look) * 42;

    if (!this.chaseSeeded) {
      this.chaseSeeded = true;
      this.chaseOff.snap(tx, h, tz);
      this.chaseLook.snap(lx, 6, lz);
    } else {
      this.chaseOff.step(tx, h, tz, 6.5, dt);
      this.chaseLook.step(lx, 6, lz, 10, dt);
    }

    const carY = car.idx !== undefined ? surfaceHeight(surfaceIndex(car.idx, car.x, car.y), 0) : 0;
    const roadPitch = car.idx !== undefined ? surfaceGradeAngle(surfaceIndex(car.idx, car.x, car.y)) : 0;
    const T = track.current;
    const trackYaw = car.idx !== undefined && T && T.ty ? Math.atan2(T.ty[car.idx], T.tx[car.idx]) : car.a;
    const effRoadPitch = roadPitch * Math.cos(car.a - trackYaw);
    const pitchH = Math.sin(effRoadPitch) * dist * 0.45;

    _eye.set(car.x + this.chaseOff.x.x, Math.max(carY + 12, carY + this.chaseOff.y.x - pitchH), car.y + this.chaseOff.z.x);
    _look.set(car.x + this.chaseLook.x.x, carY + this.chaseLook.y.x, car.y + this.chaseLook.z.x);

    this.fovTarget = Math.min(80, 60 + 18 * sm + (car.isBoosting ? 2 : 0) + (car.drsOpen ? 1 : 0));
    // Bank slightly into the corner.
    return this.yawLag * 0.12;
  }

  private rigid(car: RigCar, dt: number, s: number, view: 'tcam' | 'cockpit' | 'hood'): number {
    const cos = Math.cos(car.a);
    const sin = Math.sin(car.a);
    // right-hand vector: (-sin, cos) in (x, z)
    const gLat = clamp((car.vf * this.yawRate) / G, -4, 4);
    const gLon = clamp(this.accLon / G, -4, 2);

    const headScale = view === 'cockpit' ? 1 : view === 'tcam' ? 0.35 : 0.12;
    this.head.step(-gLat * 0.38 * headScale, 0, -gLon * 0.55 * headScale, 9, dt);

    // Look direction leads into the corner (driver looks through the apex).
    const leadT = clamp(car.steer * 0.09 + this.yawRate * 0.06, -0.22, 0.22) * (view === 'cockpit' ? 1 : 0.5);
    this.lead.step(leadT, 7, dt);
    const lookBack = this.lb * Math.PI;
    const yaw = car.a + this.lead.x + lookBack;

    const anchors = getAnchorsForModel(car.carModel);
    const roadPitch = car.idx !== undefined ? surfaceGradeAngle(surfaceIndex(car.idx, car.x, car.y)) : 0;
    const roadBank = car.idx !== undefined ? surfaceCamberAngle(surfaceIndex(car.idx, car.x, car.y)) : 0;
    const T = track.current;
    const trackYaw = car.idx !== undefined && T && T.ty ? Math.atan2(T.ty[car.idx], T.tx[car.idx]) : car.a;
    const headingDiff = car.a - trackYaw;
    const effRoadPitch = roadPitch * Math.cos(headingDiff);
    const effRoadBank = roadBank * Math.cos(headingDiff);

    let eyeFwd: number;
    let eyeH: number;
    let eyeLat: number;
    let pitchT: number;
    let rollT: number;
    switch (view) {
      case 'cockpit':
        eyeFwd = anchors.cockpit.fwd + this.head.z.x;
        eyeH = anchors.cockpit.h;
        eyeLat = anchors.cockpit.lat;
        // Natural driver downward viewing angle: frames steering wheel, halo pillar & track
        pitchT = -0.11 + effRoadPitch + clamp(gLon, -2, 1) * 0.012;
        rollT = effRoadBank - gLat * 0.011 - (car.isDrifting ? car.driftAngle * 0.15 : 0);
        this.fovTarget = 72 + 9 * smooth01(clamp(s, 0, 1)) + (car.isBoosting ? 1.5 : 0);
        break;
      case 'hood':
        eyeFwd = anchors.nose.fwd;
        eyeH = anchors.nose.h;
        eyeLat = anchors.nose.lat;
        pitchT = -0.025 + effRoadPitch;
        rollT = effRoadBank + (car.isDrifting ? -car.driftAngle * 0.1 : 0);
        this.fovTarget = 74 + 12 * smooth01(clamp(s, 0, 1));
        break;
      default:
        eyeFwd = -anchors.tcam.back;
        eyeH = anchors.tcam.h;
        eyeLat = anchors.tcam.lat;
        pitchT = -0.1 + effRoadPitch;
        rollT = effRoadBank - gLat * 0.008 - (car.isDrifting ? car.driftAngle * 0.12 : 0);
        this.fovTarget = 66 + 12 * smooth01(clamp(s, 0, 1));
    }
    this.pitchS.step(pitchT, 8, dt);
    this.rollS.step(rollT, 8, dt);

    const carY = car.idx !== undefined ? surfaceHeight(surfaceIndex(car.idx, car.x, car.y), 0) : 0;
    _eye.set(
      car.x + cos * eyeFwd - sin * (this.head.x.x + eyeLat),
      carY + eyeH + this.head.y.x,
      car.y + sin * eyeFwd + cos * (this.head.x.x + eyeLat)
    );
    const p = this.pitchS.x;
    const cp = Math.cos(p);
    _look.set(_eye.x + Math.cos(yaw) * cp * 100, _eye.y + Math.sin(p) * 100, _eye.z + Math.sin(yaw) * cp * 100);
    return this.rollS.x;
  }

  /** Grid intro: sweep from a TV angle at the front of the grid round to the chase position behind the player. */
  private intro(car: RigCar, o: RigOptions) {
    const p = clamp(o.introP ?? 1, 0, 1);
    const e = p * p * p * (p * (p * 6 - 15) + 10); // smootherstep
    const pole = o.pole ?? car;
    const fx = Math.cos(pole.a);
    const fz = Math.sin(pole.a);
    const poleY = pole.idx !== undefined ? surfaceHeight(surfaceIndex(pole.idx, pole.x, pole.y), 0) : 0;
    const carY = car.idx !== undefined ? surfaceHeight(surfaceIndex(car.idx, car.x, car.y), 0) : 0;
    // Start: just ahead of pole, over the infield edge, looking back along the grid.
    const side = 1;
    const ax = pole.x + fx * 150 - fz * side * 210;
    const az = pole.y + fz * 150 + fx * side * 210;
    const ay = poleY + 24;
    const lax = lerp(pole.x - fx * 60, car.x - Math.cos(car.a) * 40, 0.55);
    const laz = lerp(pole.y - fz * 60, car.y - Math.sin(car.a) * 40, 0.55);

    // Blend A -> chase pose (already in _eye/_look). Bow the path upwards for a crane feel.
    const bow = Math.sin(Math.PI * e) * 22;
    _eye.set(lerp(ax, _eye.x, e), lerp(ay, _eye.y, e) + bow, lerp(az, _eye.z, e));
    _look.set(lerp(lax, _look.x, e), lerp(carY + 5, _look.y, e), lerp(laz, _look.z, e));
    this.fovTarget = lerp(44, this.fovTarget, e);
  }
}
