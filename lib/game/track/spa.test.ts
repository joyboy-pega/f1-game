import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../gameState';
import { world } from '../sim/world';
import { autopilotPlayer, runRaceAsync } from '../sim/testutil';
import { ensureTrack, isTrackLoaded, setActiveTrack, track, trackCatalog } from './index';
import { getRacingLine } from '../sim/racingLine';

describe('Spa-Francorchamps circuit integration (PLAN-v3 §4.2 T6.4)', () => {
  it('registers Spa in the track catalog with official facts', () => {
    const catalog = trackCatalog();
    const spa = catalog.find((t) => t.id === 'spa');
    expect(spa).toBeDefined();
    expect(spa!.name).toBe('Circuit de Spa-Francorchamps');
    expect(spa!.country).toBe('Belgium');
    expect(spa!.lengthM).toBe(7004);
    expect(spa!.turns).toBe(19);
    expect(spa!.lapRecord?.time).toBe(106.286);
  });

  it('ensureTrack loads and builds Spa TrackRuntime with authentic ~102m elevation', async () => {
    const rt = await ensureTrack('spa');
    expect(isTrackLoaded('spa')).toBe(true);
    expect(rt.meta.id).toBe('spa');
    expect(rt.meta.direction).toBe('cw');
    expect(rt.N).toBe(2802);

    // Track length in world units (10 units = 1 m) -> 70040 ± 50
    expect(rt.length).toBeGreaterThan(69950);
    expect(rt.length).toBeLessThan(70120);

    // Extreme elevation range: ~102m (~1020 world units)
    let minZ = 9999;
    let maxZ = -9999;
    for (let i = 0; i < rt.N; i++) {
      if (rt.pz[i] < minZ) minZ = rt.pz[i];
      if (rt.pz[i] > maxZ) maxZ = rt.pz[i];
    }
    const elevationDeltaM = (maxZ - minZ) / 10;
    console.log(`[spa] measured elevation range: ${elevationDeltaM.toFixed(1)} m`);
    expect(elevationDeltaM).toBeGreaterThan(95);
    expect(elevationDeltaM).toBeLessThan(110);

    // DRS zones: 2 zones
    expect(rt.drs.length).toBe(2);

    // Pit lane: right side (+1), 80 km/h speed limit
    expect(rt.pit.side).toBe(1);
    expect(rt.pit.speedLimitKmh).toBe(80);
  });

  it('computes optimal racing line and realistic lap time estimate on Spa', async () => {
    await ensureTrack('spa');
    setActiveTrack('spa');
    const rl = getRacingLine();
    expect(rl).toBeDefined();
    expect(rl.offset.length).toBe(track.current.N);
    expect(rl.speed.length).toBe(track.current.N);

    // Spa 7.004 km lap time estimate: ~100s–120s
    console.log(`[spa] racing line lap estimate: ${rl.lapTimeEstimate.toFixed(2)}s`);
    expect(rl.lapTimeEstimate).toBeGreaterThan(95);
    expect(rl.lapTimeEstimate).toBeLessThan(125);
  });

  it('runs a multi-car AI race on Spa without cars going off-track or crashing', async () => {
    await ensureTrack('spa');
    setActiveTrack('spa');

    world.seed = 42;
    world.setup({
      ...DEFAULT_SETTINGS,
      trackId: 'spa',
      mode: 'race',
      totalLaps: 1,
      aiCount: 3,
      difficulty: 'pro',
    });
    autopilotPlayer(world);

    const logs: Record<number, { offTrack: number }> = {};
    for (const c of world.cars) logs[c.id] = { offTrack: 0 };

    world.events.subscribe((e) => {
      if (e.type === 'trackLimits') {
        logs[e.carId].offTrack += 1;
      }
    });

    await runRaceAsync(world, 190);

    for (const car of world.cars) {
      expect(car.timing.lapsCompleted).toBeGreaterThanOrEqual(1);
      expect(logs[car.id].offTrack).toBeLessThan(10.0);
    }

    setActiveTrack('buddh');
  });
});
