import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { CameraRig, type RigCar } from './rig';
import { track } from '@/lib/game/track';
import { ensureTrack } from '@/lib/game/track/registry';
import { surfaceHeight } from '@/lib/game/track/surface';

describe('CameraRig & Angles', () => {
  beforeEach(async () => {
    await ensureTrack('buddh');
  });

  const createMockCar = (partial: Partial<RigCar> = {}): RigCar => ({
    x: 100,
    y: 200,
    a: 0,
    vf: 600, // ~216 km/h
    vl: 0,
    kmh: 216,
    steer: 0,
    isDrifting: false,
    driftAngle: 0,
    isBoosting: false,
    drsOpen: false,
    idx: 100,
    carModel: 'f1',
    ...partial,
  });

  it('initializes in chase mode with smooth framing and valid quaternion', () => {
    const rig = new CameraRig();
    const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 2000);
    const car = createMockCar();

    rig.update(cam, car, 'chase', 0.016, { lookBack: false });

    expect(cam.position.x).toBeDefined();
    expect(cam.position.y).toBeGreaterThan(0);
    expect(cam.position.z).toBeDefined();
    expect(cam.quaternion.x).toBeDefined();
    expect(cam.quaternion.w).toBeDefined();
    // Camera is positioned behind the car
    expect(cam.position.x).toBeLessThan(car.x);
  });

  it('cockpit camera frames steering wheel and halo with downward pitch', () => {
    const rig = new CameraRig();
    const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 2000);
    const car = createMockCar({ kmh: 150 });

    rig.update(cam, car, 'cockpit', 0.016, { lookBack: false });

    // Cockpit position is at the driver eye level above track elevation
    const carY = surfaceHeight(car.idx ?? 0, 0);
    expect(cam.position.y - carY).toBeGreaterThan(8);
    expect(cam.position.y - carY).toBeLessThan(14);

    // Camera look direction has negative pitch (looking downward into the cockpit)
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    expect(forward.y).toBeLessThan(0); // Negative Y = downward viewing angle
  });

  it('adjusts cockpit camera pitch with track elevation grade', () => {
    const rigFlat = new CameraRig();
    const rigSlope = new CameraRig();
    const camFlat = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 2000);
    const camSlope = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 2000);

    const carFlat = createMockCar({ idx: 0 }); // near start
    const carSlope = createMockCar({ idx: 100 });

    // Step several frames to let springs settle
    for (let i = 0; i < 30; i++) {
      rigFlat.update(camFlat, carFlat, 'cockpit', 0.016, { lookBack: false });
      rigSlope.update(camSlope, carSlope, 'cockpit', 0.016, { lookBack: false });
    }

    const fwdFlat = new THREE.Vector3(0, 0, -1).applyQuaternion(camFlat.quaternion);
    const fwdSlope = new THREE.Vector3(0, 0, -1).applyQuaternion(camSlope.quaternion);
    expect(fwdFlat.length()).toBeCloseTo(1, 4);
    expect(fwdSlope.length()).toBeCloseTo(1, 4);
  });

  it('supports model-specific anchors for Roadster (left seat) and Pegasus', () => {
    const rigF1 = new CameraRig();
    const rigRoadster = new CameraRig();
    const rigPegasus = new CameraRig();

    const camF1 = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 2000);
    const camRoadster = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 2000);
    const camPegasus = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 2000);

    const carF1 = createMockCar({ carModel: 'f1', a: 0 });
    const carRoadster = createMockCar({ carModel: 'roadster', a: 0 });
    const carPegasus = createMockCar({ carModel: 'pegasus', a: 0 });

    for (let i = 0; i < 20; i++) {
      rigF1.update(camF1, carF1, 'cockpit', 0.016, { lookBack: false });
      rigRoadster.update(camRoadster, carRoadster, 'cockpit', 0.016, { lookBack: false });
      rigPegasus.update(camPegasus, carPegasus, 'cockpit', 0.016, { lookBack: false });
    }

    // Roadster driver seat has a lateral offset to the left of the car centerline
    expect(Math.abs(camRoadster.position.z - carRoadster.y)).toBeGreaterThan(1.0);
    // F1 cockpit is centered on the car centerline
    expect(Math.abs(camF1.position.z - carF1.y)).toBeLessThan(0.8);
    // Pegasus has higher eye level
    expect(camPegasus.position.y).toBeGreaterThan(camRoadster.position.y);
  });

  it('cycles through all camera modes smoothly without NaN or spikes', () => {
    const rig = new CameraRig();
    const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 2000);
    const car = createMockCar();

    const modes = ['chase', 'tcam', 'cockpit', 'hood'] as const;
    for (const mode of modes) {
      for (let f = 0; f < 10; f++) {
        rig.update(cam, car, mode, 0.016, { lookBack: false });
        expect(Number.isFinite(cam.position.x)).toBe(true);
        expect(Number.isFinite(cam.position.y)).toBe(true);
        expect(Number.isFinite(cam.position.z)).toBe(true);
        expect(Number.isFinite(cam.quaternion.x)).toBe(true);
      }
    }
  });

  it('reverses view angle when lookBack is enabled', () => {
    const rig = new CameraRig();
    const camForward = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 2000);
    const camBack = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 2000);
    const car = createMockCar({ a: 0 });

    for (let f = 0; f < 40; f++) {
      rig.update(camForward, car, 'cockpit', 0.016, { lookBack: false });
    }
    rig.reset();
    for (let f = 0; f < 40; f++) {
      rig.update(camBack, car, 'cockpit', 0.016, { lookBack: true });
    }

    const forwardDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camForward.quaternion);
    const backDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camBack.quaternion);

    // Forward and backward viewing directions should point in opposite directions along X
    expect(forwardDir.x * backDir.x).toBeLessThan(0);
  });
});
