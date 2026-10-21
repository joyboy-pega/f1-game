'use client';

import { useGameStore } from '@/lib/game/store';
import { world } from '@/lib/game/sim/world';
import { F1Car } from './car/F1Car';

/** Renders every car in the world. Rebuilds when a new session starts. */
export function Cars() {
  const sessionId = useGameStore((s) => s.sessionId);
  return (
    <group name="cars" key={sessionId}>
      {world.cars.map((car) => (
        <F1Car key={`${world.raceId}-${car.id}`} car={car} interpolate />
      ))}
    </group>
  );
}
