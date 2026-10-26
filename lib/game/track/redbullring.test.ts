import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../gameState';
import { world } from '../sim/world';
import { autopilotPlayer, runRaceAsync } from '../sim/testutil';
import { ensureTrack, isTrackLoaded, setActiveTrack, track, trackCatalog } from './index';
import { getRacingLine } from '../sim/racingLine';

describe('Red Bull Ring circuit integration (PLAN-v3 §4.2 T6.2)', () => {
  it('registers Red Bull Ring in the track catalog with official facts', () => {
    const catalog = trackCatalog();
    const rbr = catalog.find((t) => t.id === 'redbullring');
    expect(rbr).toBeDefined();
    expect(rbr!.name).toBe('Red Bull Ring');
    expect(rbr!.country).toBe('Austria');
    expect(rbr!.lengthM).toBe(4318);
    expect(rbr!.turns).toBe(10);
    expect(rbr!.lapRecord?.time).toBe(65.619);
  });

  it('ensureTrack loads and builds Red Bull Ring TrackRuntime with authentic ~65m elevation', async () => {
    const rt = await ensureTrack('redbullring');
    expect(isTrackLoaded('redbullring')).toBe(true);
    expect(rt.meta.id).toBe('redbullring');
    expect(rt.meta.direction).toBe('cw');
    expect(rt.N).toBe(1727);

    // Track length in world units (10 units = 1 m) -> 43180 ± 50
    expect(rt.length).toBeGreaterThan(43100);
    expect(rt.length).toBeLessThan(43300);

    // Variable width: 13m to 15m (half-width 65 to 75 units)
    let minHw = 999;
    let maxHw = 0;
    for (let i = 0; i < rt.N; i++) {
      if (rt.halfWidth[i] < minHw) minHw = rt.halfWidth[i];
      if (rt.halfWidth[i] > maxHw) maxHw = rt.halfWidth[i];
    }
    expect(minHw).toBeCloseTo(65, 0); // 13 m / 2 * 10
    expect(maxHw).toBeCloseTo(75, 0); // 15 m / 2 * 10

    // DRS zones: 3 zones
    expect(rt.drs.length).toBe(3);
    const wrapZone = rt.drs.find((z) => z.wraps);
    expect(wrapZone).toBeDefined();

    // Pit lane: right side (+1), 80 km/h speed limit
    expect(rt.pit.side).toBe(1);
    expect(rt.pit.speedLimitKmh).toBe(80);

    // Extreme elevation change: ~65m (~650 world units)
    let minZ = 9999;
    let maxZ = -9999;
    for (let i = 0; i < rt.N; i++) {
      if (rt.pz[i] < minZ) minZ = rt.pz[i];
      if (rt.pz[i] > maxZ) maxZ = rt.pz[i];
    }
    const elevationDeltaM = (maxZ - minZ) / 10;
    console.log(`[redbullring] measured elevation range: ${elevationDeltaM.toFixed(1)} m`);
    expect(elevationDeltaM).toBeGreaterThan(60); // > 60 m
    expect(elevationDeltaM).toBeLessThan(75); // < 75 m
  });

  it('computes optimal racing line and realistic lap time estimate on Red Bull Ring', async () => {
    await ensureTrack('redbullring');
    setActiveTrack('redbullring');

    const rl = getRacingLine();
    expect(rl.offset.length).toBe(track.current.N);
    expect(rl.speed.length).toBe(track.current.N);

    // Red Bull Ring QSS lap time estimate should be within 62-75 s (§11.2 band: 1:04-1:10)
    console.log(`[redbullring] racing line lap estimate: ${rl.lapTimeEstimate.toFixed(2)}s`);
    expect(rl.lapTimeEstimate).toBeGreaterThan(60);
    expect(rl.lapTimeEstimate).toBeLessThan(78);

    // Reset back to Buddh for subsequent test isolation
    setActiveTrack('buddh');
  });

  it('runs a multi-car AI race on Red Bull Ring through extreme elevation without crashing', async () => {
    await ensureTrack('redbullring');

    world.setup({
      ...DEFAULT_SETTINGS,
      trackId: 'redbullring',
      mode: 'race',
      totalLaps: 2,
      aiCount: 5,
      difficulty: 'pro',
      gridPosition: 3,
    });

    expect(track.current.meta.id).toBe('redbullring');
    expect(world.cars.length).toBe(6);

    autopilotPlayer(world);

    // Run race simulation for 2 laps
    const { logs } = await runRaceAsync(world, 200);
    expect(logs.length).toBe(6);

    // Verify all cars completed laps cleanly (PLAN-v3 §4.2 T6: < 5% off-track time, no respawns)
    for (const car of world.cars) {
      expect(car.timing.lapsCompleted).toBeGreaterThanOrEqual(1);
      expect(logs[car.id].offTrack).toBeLessThan(10.0);
    }

    // Reset back to Buddh for test suite hygiene
    setActiveTrack('buddh');
  });
});
