import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../gameState';
import { track } from '../track';
import { GameWorld, FIXED_DT } from './world';
import { autopilotPlayer, raceSettings } from './testutil';
import { updateTrackLimits, cornerZoneOf } from './penalties';
import { advanceTiming } from './race';
import type { SimEvent } from './events';

describe('Lap validity & track limits everywhere (PLAN-v3 §8 R1 / Audit B6)', () => {
  it('invalidates lap when track limits are exceeded in Time Trial mode and prevents invalid ghost/records', () => {
    const w = new GameWorld();
    w.seed = 1234;
    w.setup({ ...DEFAULT_SETTINGS, mode: 'timetrial' });
    autopilotPlayer(w);

    const player = w.player;
    expect(player.timing.lapValid).toBe(true);

    const events: SimEvent[] = [];
    w.events.subscribe((e) => events.push(e));

    // Force player car into a track limits excursion in an authentic corner away from pit lane
    let idx = -1;
    for (let i = 250; i < track.current.N - 250; i++) {
      if (cornerZoneOf(i) >= 0) {
        idx = i;
        break;
      }
    }
    expect(idx).toBeGreaterThan(0);

    player.phys.idx = idx;
    player.lateral = track.current.halfWidth[idx] + 25;
    player.surface.dist = track.current.halfWidth[idx] + 25; // Well beyond wall threshold
    player.surface.gravel = false;
    player.phys.kmh = 160;

    // Step limits checker for > 0.25 s (35 steps * 1/120s = ~0.29s)
    const lctx = { raceTime: 50.0, dt: FIXED_DT, events: w.events, enabled: true };
    for (let i = 0; i < 35; i++) {
      updateTrackLimits(player, lctx);
      lctx.raceTime += FIXED_DT;
    }
    w.events.flush();

    expect(player.timing.lapValid).toBe(false);
    expect(events.some((e) => e.type === 'lapInvalid')).toBe(true);

    // Simulate lap completion
    const initialBestLap = player.timing.bestLap;
    const initialTrace = player.timing.bestLapTrace;

    // Advance timing to line crossing
    const tctx = {
      raceTime: 120.0,
      dt: FIXED_DT,
      standingStart: false,
      overall: w.overall,
      events: w.events,
    };
    const L = track.current.length;
    const CP_LEN = L / 64;
    player.timing.lapStartTime = 40.0;
    player.timing.lapsCompleted = 0;
    player.timing.progress = L - 5;
    player.timing.lastS = L - 5;
    player.timing.lastCheckpoint = Math.floor((L - 5) / CP_LEN) + 64;

    advanceTiming(player, 10, tctx);
    w.events.flush();

    // The completed lap was invalid -> must NOT update bestLap or bestLapTrace (Audit B6 fix)
    expect(player.timing.bestLap).toBe(initialBestLap);
    expect(player.timing.bestLapTrace).toBe(initialTrace);
    expect(events.some((e) => e.type === 'lap' && (e as any).valid === false)).toBe(true);
  });

  it('carries invalidation over to the next lap if track limits were exceeded in the final sector', () => {
    const w = new GameWorld();
    w.setup({ ...DEFAULT_SETTINGS, mode: 'timetrial' });
    autopilotPlayer(w);

    const player = w.player;
    // Find a corner in sector 2 (the final sector)
    let finalSectorIdx = -1;
    for (let i = track.current.sectorIdx[1]; i < track.current.N - 50; i++) {
      if (cornerZoneOf(i) >= 0) {
        finalSectorIdx = i;
        break;
      }
    }
    expect(finalSectorIdx).toBeGreaterThan(0);

    player.timing.currentSector = 2;
    player.phys.idx = finalSectorIdx;
    player.lateral = track.current.halfWidth[finalSectorIdx] + 30;
    player.surface.dist = track.current.halfWidth[finalSectorIdx] + 30;
    player.phys.kmh = 220;

    const lctx = { raceTime: 80.0, dt: FIXED_DT, events: w.events, enabled: true };
    for (let i = 0; i < 35; i++) {
      updateTrackLimits(player, lctx);
      lctx.raceTime += FIXED_DT;
    }
    w.events.flush();

    expect(player.timing.lapValid).toBe(false);
    // Because infraction was in final sector, next lap must also be marked invalid
    expect(player.timing.nextLapInvalid).toBe(true);

    // Complete lap
    const tctx = {
      raceTime: 100.0,
      dt: FIXED_DT,
      standingStart: false,
      overall: w.overall,
      events: w.events,
    };
    player.timing.lapStartTime = 20.0;
    advanceTiming(player, track.current.length - 1, tctx);
    advanceTiming(player, 10, tctx);
    w.events.flush();

    // New lap starts as invalid!
    expect(player.timing.lapValid).toBe(false);
    expect(player.timing.nextLapInvalid).toBe(false);
  });

  it('detects chicane shortcut and applies +5s penalty when advantage is taken without giving it back', () => {
    const w = new GameWorld();
    w.setup(raceSettings());
    const player = w.player;
    const events: SimEvent[] = [];
    w.events.subscribe((e) => events.push(e));

    // Find an authentic corner zone
    let idx = -1;
    for (let i = 300; i < track.current.N - 300; i++) {
      if (cornerZoneOf(i) >= 0) {
        idx = i;
        break;
      }
    }
    expect(idx).toBeGreaterThan(0);

    const sEntry = track.current.cumulativeS[idx];
    let idxExit = idx;
    for (let i = idx + 1; i < idx + 50; i++) {
      if (track.current.cumulativeS[i] - sEntry >= 200) {
        idxExit = i;
        break;
      }
    }
    expect(idxExit).toBeGreaterThan(idx);

    player.phys.idx = idx;
    player.lateral = track.current.halfWidth[idx] + 25;
    player.surface.dist = track.current.halfWidth[idx] + 25; // Cut across grass/verge
    player.ctrl.throttle = 1.0;
    player.phys.kmh = 240;

    const lctx = { raceTime: 30.0, dt: FIXED_DT, events: w.events, enabled: true };

    // Step 1: Enters off-track in corner
    updateTrackLimits(player, lctx);
    expect(player.limits.cutStartS).toBeGreaterThan(0);

    // Step 2: Rejoins track 200+ units further down the road in only 0.2 seconds (cutting the chicane)
    lctx.raceTime += 0.2;
    player.phys.idx = idxExit;
    player.lateral = 0;
    player.surface.dist = track.current.halfWidth[idxExit] - 5; // Back on asphalt
    player.ctrl.throttle = 1.0; // Still pinned on throttle

    updateTrackLimits(player, lctx);
    w.events.flush();

    // Chicane cut penalty + lap invalidation
    expect(player.timing.lapValid).toBe(false);
    expect(player.timing.penaltySec).toBe(5);
    expect(events.some((e) => e.type === 'penalty' && e.reason === 'CHICANE CUT')).toBe(true);
    expect(events.some((e) => e.type === 'chicaneCut')).toBe(true);
  });
});
