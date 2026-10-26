'use client';

import { useGameStore } from '@/lib/game/store';
import { world } from '@/lib/game/sim/world';
import { F1Car } from './car/F1Car';
import { InstancedAICars } from './car/InstancedAICars';

/** Renders every car in the world with instancing for AI grid (PLAN-v3 §7 G6). */
export function Cars() {
  const sessionId = useGameStore((s) => s.sessionId);
  const playerCar = world.player;
  const nonPlayerCars = world.cars.filter((c) => !c.isPlayer);
  const aiF1Cars = nonPlayerCars.filter((c) => c.driver.team !== 'Pegasus');
  const aiPegasusCars = nonPlayerCars.filter((c) => c.driver.team === 'Pegasus');

  return (
    <group name="cars" key={sessionId}>
      {/* Player car: full cockpit and high-detail rig */}
      {playerCar && <F1Car key={`${world.raceId}-${playerCar.id}`} car={playerCar} interpolate />}

      {/* AI cars: instanced rendering (G6: <= 40 draw calls for 20 cars) */}
      {aiF1Cars.length > 0 && <InstancedAICars cars={aiF1Cars} />}

      {/* Pegasus AI cars */}
      {aiPegasusCars.map((car) => (
        <F1Car key={`${world.raceId}-${car.id}`} car={car} interpolate />
      ))}
    </group>
  );
}
