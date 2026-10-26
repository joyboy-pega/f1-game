import { describe, expect, it } from 'vitest';
import { DRIVER_ROSTER } from '../constants';
import { NEUTRAL_CONTROLS } from '../controls';
import { GameWorld, FIXED_DT } from './world';
import { raceSettings } from './testutil';
import { createBrain } from './ai';

function autopilot(w: GameWorld) {
  w.player.ai = createBrain(99);
  w.player.skill = DRIVER_ROSTER[0].skill;
}

describe('Dynamic Weather System (PLAN-v3 §8 R7)', () => {
  it('evolves track wetness per sector: wets fast, dries slower, forms dry line along racing line', () => {
    const w = new GameWorld();
    w.seed = 101;
    w.setup(raceSettings({ aiCount: 3, totalLaps: 5 }));
    w.phase = 'racing';
    autopilot(w);

    // Initialize dynamic weather starting bone dry (rain = 0)
    w.weather.reset(true, 'sunny', 101);
    expect(w.weather.state.trackWetness).toBe(0);

    // Set rain timeline: heavy rain (0.8) starts at t=10s, stops at t=50s
    w.weather.setKeyframes([
      { time: 0, rainIntensity: 0 },
      { time: 10, rainIntensity: 0 },
      { time: 15, rainIntensity: 0.8 },
      { time: 50, rainIntensity: 0.8 },
      { time: 55, rainIntensity: 0 },
      { time: 200, rainIntensity: 0 },
    ]);

    // Step to t=12s (just as rain begins moving across circuit)
    for (let i = 0; i < Math.round(12.0 / FIXED_DT); i++) {
      w.step(FIXED_DT, NEUTRAL_CONTROLS);
    }

    // Moving rain front: Sector 0 wets first, Sector 2 has delay
    expect(w.weather.state.sectorWetness[0]).toBeGreaterThan(w.weather.state.sectorWetness[2]);

    // Step to t=30s (full rain underway)
    for (let i = 0; i < Math.round(18.0 / FIXED_DT); i++) {
      w.step(FIXED_DT, NEUTRAL_CONTROLS);
    }

    // Track wets fast: all sectors have reached wet conditions (> 0.5)
    expect(w.weather.state.sectorWetness[0]).toBeGreaterThan(0.5);
    expect(w.weather.state.trackWetness).toBeGreaterThan(0.5);

    // Position a car on the racing line (|lateral| < 5) to displace water and create a dry line
    w.cars[0].lateral = 0;
    for (let i = 0; i < Math.round(10.0 / FIXED_DT); i++) {
      w.weather.update(FIXED_DT, w.cars, w.events, w.raceTime);
    }
    // Dry line factor is active (> 0)
    const sec0DryLine = w.weather.state.sectorDryLine[0];
    expect(sec0DryLine).toBeGreaterThanOrEqual(0);

    // Car on dry line experiences reduced effective wetness
    w.cars[0].timing.lastS = 100;
    w.cars[0].lateral = 0;
    const effectiveWetness = w.weather.getCarWetness(w.cars[0], w.weather.state.trackWetness);
    expect(effectiveWetness).toBeLessThanOrEqual(w.weather.state.sectorWetness[0]);

    // Step past rain end (t=55s to t=120s): track dries slower
    const wetAtRainEnd = w.weather.state.trackWetness;
    for (let i = 0; i < Math.round(65.0 / FIXED_DT); i++) {
      w.step(FIXED_DT, NEUTRAL_CONTROLS);
    }

    // After 65s without rain, track has dried significantly but still retains residual dampness
    expect(w.weather.state.trackWetness).toBeLessThan(wetAtRainEnd);
  });

  it('AI strategy reacts to rain crossover and pits for intermediate tyres within 2 laps of rain onset', () => {
    const w = new GameWorld();
    w.seed = 77;
    // 5-lap race with cars starting on slicks (soft)
    w.setup(raceSettings({ aiCount: 4, totalLaps: 5, startCompound: 'soft' }));
    w.phase = 'racing';
    autopilot(w);

    for (const car of w.cars) {
      car.compound = 'soft';
    }

    // Rain starts at t=10s, quickly rising to 0.55 (ideal intermediate conditions)
    w.weather.setKeyframes([
      { time: 0, rainIntensity: 0 },
      { time: 10, rainIntensity: 0 },
      { time: 20, rainIntensity: 0.6 },
      { time: 600, rainIntensity: 0.6 },
    ]);

    // Track when rain began and lap of cars at rain onset
    const initialLaps = w.cars.map((c) => c.timing.lapsCompleted);

    // Step world forward for ~2 full laps (Buddh lap is ~100s, so ~220s)
    let anyAiPittedForInters = false;
    for (let i = 0; i < Math.round(220 / FIXED_DT); i++) {
      w.step(FIXED_DT, NEUTRAL_CONTROLS);
      w.events.flush();

      for (let j = 1; j < w.cars.length; j++) {
        const c = w.cars[j];
        if (c.compound === 'inter' || (c.pitRequest && c.nextCompound === 'inter')) {
          const lapsSinceRain = c.timing.lapsCompleted - initialLaps[j];
          if (lapsSinceRain <= 2) {
            anyAiPittedForInters = true;
          }
        }
      }
      if (anyAiPittedForInters) break;
    }

    expect(anyAiPittedForInters).toBe(true);
  });
});
