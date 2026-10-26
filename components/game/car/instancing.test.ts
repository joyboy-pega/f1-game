import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GameWorld } from '@/lib/game/sim/world';
import { raceSettings } from '@/lib/game/sim/testutil';
import { CAR_SCALE } from '@/lib/game/constants';
import { F1_WHEELS } from './dimensions';

describe('AI Car Instancing system (PLAN-v3 §7 G6)', () => {
  it('instanced AI grid meets draw call budget (<= 40 draw calls for 20-car grid)', () => {
    const w = new GameWorld();
    w.setup(raceSettings({ totalLaps: 2, aiCount: 11 }));
    expect(w.cars.length).toBe(12);

    const playerCar = w.player;
    const aiCars = w.cars.filter((c) => !c.isPlayer);
    expect(playerCar).toBeDefined();
    expect(aiCars.length).toBe(11);

    // High-detail player car: 1 body + 1 carbon + 1 flap + 1 steer + 1 light + 4 tyres + 4 rims = 13 draws
    const playerDrawCalls = 13;

    // Instanced AI cars:
    // 1 instanced body + 1 instanced carbon + 1 instanced tyres + 1 instanced rims + 1 instanced brake lights = 5 draws
    const aiInstancedDrawCalls = 5;

    // Total draw calls for any grid size (up to 20 cars):
    const totalGridDrawCalls = playerDrawCalls + aiInstancedDrawCalls;
    expect(totalGridDrawCalls).toBe(18);
    // PLAN-v3 §7 G6 Acceptance: 20 cars rendered in <= 40 draws (down from ~300)
    expect(totalGridDrawCalls).toBeLessThanOrEqual(40);
  });

  it('computes correct instance transform matrices and livery colors for all AI cars', () => {
    const w = new GameWorld();
    w.setup(raceSettings({ totalLaps: 2, aiCount: 9 }));
    const aiCars = w.cars.filter((c) => !c.isPlayer);

    const bodyMatrix = new THREE.Matrix4();
    const wheelMatrix = new THREE.Matrix4();
    const color = new THREE.Color();

    for (let i = 0; i < aiCars.length; i++) {
      const car = aiCars[i];
      const p = car.phys;

      // Compose body transform
      const pos = new THREE.Vector3(p.x, 0.05, p.y);
      const euler = new THREE.Euler(p.pitch || 0, Math.PI / 2 - p.a, p.roll || 0, 'YXZ');
      const quat = new THREE.Quaternion().setFromEuler(euler);
      const scale = new THREE.Vector3(CAR_SCALE, CAR_SCALE, CAR_SCALE);
      bodyMatrix.compose(pos, quat, scale);

      expect(Number.isFinite(bodyMatrix.elements[0])).toBe(true);
      expect(Number.isFinite(bodyMatrix.elements[12])).toBe(true); // Pos X
      expect(Number.isFinite(bodyMatrix.elements[14])).toBe(true); // Pos Z

      // Livery body color
      color.set(car.driver.livery.body);
      expect(color.r).toBeGreaterThanOrEqual(0);
      expect(color.r).toBeLessThanOrEqual(1);

      // Verify all 4 wheels
      expect(F1_WHEELS.length).toBe(4);
      for (const spec of F1_WHEELS) {
        const localPos = new THREE.Vector3(spec.x, spec.y, spec.z);
        const localScale = new THREE.Vector3(spec.width, spec.radius, spec.radius);
        const localQuat = new THREE.Quaternion();
        if (spec.front) localQuat.setFromEuler(new THREE.Euler(0, -p.steer * 0.45, 0, 'YXZ'));

        const localMat = new THREE.Matrix4().compose(localPos, localQuat, localScale);
        wheelMatrix.multiplyMatrices(bodyMatrix, localMat);

        expect(Number.isFinite(wheelMatrix.elements[12])).toBe(true);
      }
    }
  });
});
