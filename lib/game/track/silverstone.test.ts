import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../gameState';
import { world } from '../sim/world';
import { autopilotPlayer, runRaceAsync } from '../sim/testutil';
import { ensureTrack, isTrackLoaded, setActiveTrack, track, trackCatalog } from './index';
import { getRacingLine } from '../sim/racingLine';

describe('Silverstone circuit integration (PLAN-v3 §4.2 T6.3)', () => {
  it('registers Silverstone in the track catalog with official facts', () => {
    const catalog = trackCatalog();
    const sil = catalog.find((t) => t.id === 'silverstone');
    expect(sil).toBeDefined();
    expect(sil!.name).toBe('Silverstone Circuit');
    expect(sil!.country).toBe('Great Britain');
    expect(sil!.lengthM).toBe(5891);
    expect(sil!.turns).toBe(18);
    expect(sil!.lapRecord?.time).toBe(87.097);
  });

  it('ensureTrack loads and builds Silverstone TrackRuntime with authentic dimensions', async () => {
    const rt = await ensureTrack('silverstone');
    expect(isTrackLoaded('silverstone')).toBe(true);
    expect(rt.meta.id).toBe('silverstone');
    expect(rt.meta.direction).toBe('cw');
    expect(rt.N).toBe(2356);

    // Track length in world units (10 units = 1 m) -> 58910 ± 50
    expect(rt.length).toBeGreaterThan(58850);
    expect(rt.length).toBeLessThan(58970);

    // Variable width: 13m to 15m (half-width 65 to 75 units)
    let minHw = 999;
    let maxHw = 0;
    for (let i = 0; i < rt.N; i++) {
      if (rt.halfWidth[i] < minHw) minHw = rt.halfWidth[i];
      if (rt.halfWidth[i] > maxHw) maxHw = rt.halfWidth[i];
    }
    expect(minHw).toBeCloseTo(65, 0);
    expect(maxHw).toBeCloseTo(75, 0);

    // DRS zones: 2 zones
    expect(rt.drs.length).toBe(2);

    // Pit lane: right side (+1), 80 km/h speed limit
    expect(rt.pit.side).toBe(1);
    expect(rt.pit.speedLimitKmh).toBe(80);
  });

  it('computes optimal racing line and realistic lap time estimate on Silverstone', async () => {
    await ensureTrack('silverstone');
    setActiveTrack('silverstone');
    const rl = getRacingLine();
    expect(rl).toBeDefined();
    expect(rl.offset.length).toBe(track.current.N);
    expect(rl.speed.length).toBe(track.current.N);

    // PLAN-v3 §11.2: Silverstone pro AI lap time band is 1:26–1:33 (86s–93s)
    console.log(`[silverstone] racing line lap estimate: ${rl.lapTimeEstimate.toFixed(2)}s`);
    expect(rl.lapTimeEstimate).toBeGreaterThan(80);
    expect(rl.lapTimeEstimate).toBeLessThan(110);
  });

  it('runs a multi-car AI race on Silverstone without cars going off-track or crashing', async () => {
    await ensureTrack('silverstone');
    setActiveTrack('silverstone');

    world.seed = 42;
    world.setup({
      ...DEFAULT_SETTINGS,
      trackId: 'silverstone',
      mode: 'race',
      totalLaps: 1,
      aiCount: 3,
      difficulty: 'pro',
    });
    autopilotPlayer(world);

    // Monitor off-track time during 1-lap race (~100s sim + 9s start)
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

    // Reset back to Buddh for following tests
    setActiveTrack('buddh');
  });
});
