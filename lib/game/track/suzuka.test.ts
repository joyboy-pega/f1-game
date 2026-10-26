import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../gameState';
import { world } from '../sim/world';
import { autopilotPlayer, runRaceAsync } from '../sim/testutil';
import { ensureTrack, isTrackLoaded, setActiveTrack, track, trackCatalog } from './index';
import { getRacingLine } from '../sim/racingLine';
import { findNearestTrackPoint } from '../physics';

describe('Suzuka circuit integration (PLAN-v3 §4.2 T6.5)', () => {
  it('registers Suzuka in the track catalog with official facts', () => {
    const catalog = trackCatalog();
    const suzuka = catalog.find((t) => t.id === 'suzuka');
    expect(suzuka).toBeDefined();
    expect(suzuka!.name).toBe('Suzuka International Racing Course');
    expect(suzuka!.country).toBe('Japan');
    expect(suzuka!.lengthM).toBe(5807);
    expect(suzuka!.turns).toBe(18);
    expect(suzuka!.lapRecord?.time).toBe(90.983);
  });

  it('ensureTrack loads and builds Suzuka TrackRuntime with figure-of-eight crossover bridge', async () => {
    const rt = await ensureTrack('suzuka');
    expect(isTrackLoaded('suzuka')).toBe(true);
    expect(rt.meta.id).toBe('suzuka');
    expect(rt.meta.direction).toBe('cw');
    expect(rt.N).toBe(2323);

    // Track length in world units (10 units = 1 m) -> 58070 ± 50
    expect(rt.length).toBeGreaterThan(58000);
    expect(rt.length).toBeLessThan(58150);

    // Elevation range: ~35-45m (~350-450 world units)
    let minZ = 9999;
    let maxZ = -9999;
    for (let i = 0; i < rt.N; i++) {
      if (rt.pz[i] < minZ) minZ = rt.pz[i];
      if (rt.pz[i] > maxZ) maxZ = rt.pz[i];
    }
    const elevationDeltaM = (maxZ - minZ) / 10;
    console.log(`[suzuka] measured elevation range: ${elevationDeltaM.toFixed(1)} m`);
    expect(elevationDeltaM).toBeGreaterThan(35);
    expect(elevationDeltaM).toBeLessThan(45);

    // Verify crossover bridge clearance:
    // Underpass near index ~820 (s ~2050m) vs Bridge near index ~1860 (s ~4650m)
    const underpassZ = rt.pz[820];
    const bridgeZ = rt.pz[1860];
    const clearanceM = (bridgeZ - underpassZ) / 10;
    console.log(`[suzuka] bridge clearance: ${clearanceM.toFixed(1)} m`);
    expect(clearanceM).toBeGreaterThan(15); // > 15 m clearance

    // Pit lane: right side (+1), 80 km/h speed limit
    expect(rt.pit.side).toBe(1);
    expect(rt.pit.speedLimitKmh).toBe(80);
  });

  it('height-aware nearest point search correctly distinguishes bridge overpass from underpass', async () => {
    const rt = await ensureTrack('suzuka');
    setActiveTrack('suzuka');

    // Test a point located right at the 2D crossover intersection
    // In Suzuka geometry: underpass is index 929 (z ~ 81 units / 8.1m), bridge is index 1877 (z ~ 319 units / 31.9m)
    const bridgeIdx = 1877;
    const underpassIdx = 929;
    const bridgeX = rt.px[bridgeIdx];
    const bridgeY = rt.py[bridgeIdx];

    // Car on bridge (high z): nearest search must return bridge index (~1877), not underpass (~929)
    const [foundBridgeIdx] = findNearestTrackPoint(bridgeX, bridgeY, bridgeIdx, 320);
    expect(Math.abs(foundBridgeIdx - bridgeIdx)).toBeLessThan(5);

    // Car in underpass (low z): nearest search must return underpass index (~929), not bridge (~1877)
    const [foundUnderpassIdx] = findNearestTrackPoint(bridgeX, bridgeY, underpassIdx, 80);
    expect(Math.abs(foundUnderpassIdx - underpassIdx)).toBeLessThan(5);
  });

  it('computes optimal racing line and realistic lap time estimate on Suzuka', async () => {
    await ensureTrack('suzuka');
    setActiveTrack('suzuka');
    const rl = getRacingLine();
    expect(rl).toBeDefined();
    expect(rl.offset.length).toBe(track.current.N);
    expect(rl.speed.length).toBe(track.current.N);

    // Suzuka 5.807 km lap time estimate: ~85s–105s
    console.log(`[suzuka] racing line lap estimate: ${rl.lapTimeEstimate.toFixed(2)}s`);
    expect(rl.lapTimeEstimate).toBeGreaterThan(80);
    expect(rl.lapTimeEstimate).toBeLessThan(110);
  });

  it('runs a multi-car AI race on Suzuka through the crossover without cars getting lost or crashing', async () => {
    await ensureTrack('suzuka');
    setActiveTrack('suzuka');

    world.seed = 42;
    world.setup({
      ...DEFAULT_SETTINGS,
      trackId: 'suzuka',
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

    await runRaceAsync(world, 180);

    for (const car of world.cars) {
      expect(car.timing.lapsCompleted).toBeGreaterThanOrEqual(1);
      expect(logs[car.id].offTrack).toBeLessThan(10.0);
    }

    setActiveTrack('buddh');
  });
});
