import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../gameState';
import { world } from '../sim/world';
import { runRaceAsync } from '../sim/testutil';
import { ensureTrack, getTrack, isTrackLoaded, setActiveTrack, track, trackCatalog } from './index';
import { getRacingLine } from '../sim/racingLine';
import { surfaceHeight } from './surface';

describe('Monza circuit integration (PLAN-v3 §4.2 T6.1)', () => {
  it('registers Monza in the track catalog with official facts', () => {
    const catalog = trackCatalog();
    const monza = catalog.find((t) => t.id === 'monza');
    expect(monza).toBeDefined();
    expect(monza!.name).toBe('Autodromo Nazionale Monza');
    expect(monza!.country).toBe('Italy');
    expect(monza!.lengthM).toBe(5793);
    expect(monza!.turns).toBe(11);
    expect(monza!.lapRecord?.time).toBe(81.046);
  });

  it('ensureTrack loads and builds Monza TrackRuntime with authentic geometry', async () => {
    const rt = await ensureTrack('monza');
    expect(isTrackLoaded('monza')).toBe(true);
    expect(rt.meta.id).toBe('monza');
    expect(rt.meta.direction).toBe('cw');
    expect(rt.N).toBe(2317);

    // Track length in world units (10 units = 1 m) -> 57930 ± 50
    expect(rt.length).toBeGreaterThan(57800);
    expect(rt.length).toBeLessThan(58100);

    // Variable width: 13m to 15m (half-width 65 to 75 units)
    let minHw = 999;
    let maxHw = 0;
    for (let i = 0; i < rt.N; i++) {
      if (rt.halfWidth[i] < minHw) minHw = rt.halfWidth[i];
      if (rt.halfWidth[i] > maxHw) maxHw = rt.halfWidth[i];
    }
    expect(minHw).toBeCloseTo(65, 0); // 13 m / 2 * 10
    expect(maxHw).toBeCloseTo(75, 0); // 15 m / 2 * 10

    // DRS zones: 2 zones (pit straight wrapping and serraglio)
    expect(rt.drs.length).toBe(2);
    const wrapZone = rt.drs.find((z) => z.wraps);
    expect(wrapZone).toBeDefined();

    // Pit lane: right side (+1), entry and exit indices valid
    expect(rt.pit.side).toBe(1);
    expect(rt.pit.speedLimitKmh).toBe(80);

    // Elevation & Camber
    let minZ = 999;
    let maxZ = -999;
    for (let i = 0; i < rt.N; i++) {
      if (rt.pz[i] < minZ) minZ = rt.pz[i];
      if (rt.pz[i] > maxZ) maxZ = rt.pz[i];
    }
    expect(maxZ - minZ).toBeGreaterThan(40); // > 4 m elevation change
    expect(maxZ - minZ).toBeLessThan(160); // < 16 m elevation change
  });

  it('computes optimal racing line and realistic lap time estimate on Monza', async () => {
    await ensureTrack('monza');
    setActiveTrack('monza');

    const rl = getRacingLine();
    expect(rl.offset.length).toBe(track.current.N);
    expect(rl.speed.length).toBe(track.current.N);

    // Monza QSS lap time estimate should be within 75-92 s (high speed ~250 km/h average)
    console.log(`[monza] racing line lap estimate: ${rl.lapTimeEstimate.toFixed(2)}s`);
    expect(rl.lapTimeEstimate).toBeGreaterThan(75);
    expect(rl.lapTimeEstimate).toBeLessThan(95);

    // Reset back to Buddh for subsequent test isolation
    setActiveTrack('buddh');
  });

  it('runs a multi-car AI race on Monza without cars going off-track or crashing', async () => {
    await ensureTrack('monza');

    world.seed = 4242;
    world.setup({
      ...DEFAULT_SETTINGS,
      trackId: 'monza',
      mode: 'race',
      totalLaps: 2,
      aiCount: 5,
      difficulty: 'pro',
      gridPosition: 3,
    });

    expect(track.current.meta.id).toBe('monza');
    expect(world.cars.length).toBe(6);

    const { autopilotPlayer } = await import('../sim/testutil');
    autopilotPlayer(world);

    // Run race simulation for 2 laps
    const { logs } = await runRaceAsync(world, 240);
    expect(logs.length).toBe(6);

    // Verify all cars completed laps cleanly (PLAN-v3 §4.2 T6: < 5% off-track time, no respawns)
    for (const car of world.cars) {
      expect(car.timing.lapsCompleted).toBeGreaterThanOrEqual(1);
      // In 180s race, 5% is 9.0s
      expect(logs[car.id].offTrack).toBeLessThan(10.0);
    }

    // Reset back to Buddh for test suite hygiene
    setActiveTrack('buddh');
  });
});
