import { describe, expect, it } from 'vitest';
import {
  checkJumpStart,
  checkPitSpeeding,
  checkTwoCompoundRule,
  calculateChampionshipPoints,
  EngineerManager,
  exportLapTelemetryCsv,
  get2026AeroModifiers,
  compoundToBit,
  AERO_PRESET_CONFIG,
  DEFAULT_SETUP,
  type CarSetup,
  type TelemetrySample,
} from './rules';
import { makeCar, GameWorld } from './world';
import { EventBus } from './events';
import { DEFAULT_SETTINGS } from '../gameState';

describe('R5: Race starts & Jump-start false start detection', () => {
  it('penalizes jump start when moving at > 4 km/h before lights out', () => {
    const car = makeCar(0, true, 0, 0, 'soft');
    const events = new EventBus();
    const penaltyEvents: any[] = [];
    events.subscribe((e) => {
      if (e.type === 'penalty') penaltyEvents.push(e);
    });

    car.phys.kmh = 10;
    const penalized = checkJumpStart(car, 'lights', events);
    events.flush();
    expect(penalized).toBe(true);
    expect(car.jumpStart).toBe(true);
    expect(car.timing.penaltySec).toBe(5);
    expect(penaltyEvents).toHaveLength(1);
    expect(penaltyEvents[0].reason).toBe('JUMP START');

    // Should not penalize twice
    expect(checkJumpStart(car, 'lights', events)).toBe(false);
    events.flush();
    expect(car.timing.penaltySec).toBe(5);
  });

  it('does not penalize stationary car during lights', () => {
    const car = makeCar(0, true, 0, 0, 'soft');
    const events = new EventBus();
    car.phys.kmh = 0;
    const penalized = checkJumpStart(car, 'lights', events);
    expect(penalized).toBe(false);
    expect(car.jumpStart).toBe(false);
    expect(car.timing.penaltySec).toBe(0);
  });

  it('does not penalize during green-flag racing phase', () => {
    const car = makeCar(0, true, 0, 0, 'soft');
    const events = new EventBus();
    car.phys.kmh = 50;
    const penalized = checkJumpStart(car, 'racing', events);
    expect(penalized).toBe(false);
    expect(car.timing.penaltySec).toBe(0);
  });
});

describe('R6: Pit lane speeding & Mandatory two-compound rules', () => {
  it('penalizes car exceeding pit speed limit (> 82 km/h in pit lane)', () => {
    const car = makeCar(0, true, 0, 0, 'soft');
    const events = new EventBus();
    const penalties: any[] = [];
    events.subscribe((e) => {
      if (e.type === 'penalty') penalties.push(e);
    });

    car.inPit = true;
    car.phys.kmh = 85;
    const penalized = checkPitSpeeding(car, events);
    events.flush();
    expect(penalized).toBe(true);
    expect(car.pitSpeedingPenalized).toBe(true);
    expect(car.timing.penaltySec).toBe(5);
    expect(penalties[0].reason).toBe('PIT LANE SPEEDING');

    // Subsequence check does not double-penalize
    expect(checkPitSpeeding(car, events)).toBe(false);
    events.flush();
    expect(car.timing.penaltySec).toBe(5);
  });

  it('allows speeds within pit limiter', () => {
    const car = makeCar(0, true, 0, 0, 'soft');
    const events = new EventBus();
    car.inPit = true;
    car.phys.kmh = 79;
    expect(checkPitSpeeding(car, events)).toBe(false);
    expect(car.timing.penaltySec).toBe(0);
  });

  it('penalizes failure to use two dry tyre compounds in dry races >= 10 laps', () => {
    const car = makeCar(0, true, 0, 0, 'soft');
    const events = new EventBus();
    car.compoundsUsedMask = compoundToBit('soft'); // only soft used

    const passed = checkTwoCompoundRule(car, 10, true, events);
    expect(passed).toBe(false);
    expect(car.timing.penaltySec).toBe(20);
  });

  it('passes when two dry tyre compounds were used', () => {
    const car = makeCar(0, true, 0, 0, 'soft');
    const events = new EventBus();
    car.compoundsUsedMask = compoundToBit('soft') | compoundToBit('medium');

    const passed = checkTwoCompoundRule(car, 10, true, events);
    expect(passed).toBe(true);
    expect(car.timing.penaltySec).toBe(0);
  });

  it('does not enforce two-compound rule in wet races or short sprints (< 10 laps)', () => {
    const car = makeCar(0, true, 0, 0, 'soft');
    const events = new EventBus();
    car.compoundsUsedMask = compoundToBit('soft');

    // Wet race
    expect(checkTwoCompoundRule(car, 15, false, events)).toBe(true);
    // Short sprint (5 laps)
    expect(checkTwoCompoundRule(car, 5, true, events)).toBe(true);
    expect(car.timing.penaltySec).toBe(0);
  });
});

describe('R8: Strategy & Race Engineer messages', () => {
  it('notifies player to box this lap when pit is requested in sector 2', () => {
    const player = makeCar(0, true, 0, 0, 'soft');
    const events = new EventBus();
    const messages: string[] = [];
    events.subscribe((e) => {
      if (e.type === 'engineer' && e.message.startsWith('BOX THIS LAP')) messages.push(e.message);
    });

    const engineer = new EngineerManager();
    player.pitRequest = true;
    player.nextCompound = 'hard';
    // Buddh length ~51250 world units, sector 2 is in the final sector before pit entry
    player.timing.lastS = 45000;

    engineer.update(player, [player], events, 0.1);
    events.flush();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('FITTING HARD');

    // Does not repeat on every tick
    engineer.update(player, [player], events, 0.1);
    events.flush();
    expect(messages).toHaveLength(1);
  });

  it('alerts player when immediate rival pits', () => {
    const player = makeCar(0, true, 0, 0, 'soft');
    const rival = makeCar(1, false, 0, 0, 'medium');
    player.position = 3;
    rival.position = 2; // rival ahead

    const events = new EventBus();
    const messages: string[] = [];
    events.subscribe((e) => {
      if (e.type === 'engineer' && e.message.startsWith('RIVAL PITTED')) messages.push(e.message);
    });

    const engineer = new EngineerManager();
    rival.inPit = true;

    engineer.update(player, [player, rival], events, 0.1);
    events.flush();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('P2 IN PIT LANE');
  });

  it('recommends pit stop when tyre wear exceeds critical threshold', () => {
    const player = makeCar(0, true, 0, 0, 'soft');
    const events = new EventBus();
    const messages: string[] = [];
    events.subscribe((e) => {
      if (e.type === 'engineer' && e.message.includes('TYRE WEAR CRITICAL')) messages.push(e.message);
    });

    const engineer = new EngineerManager();
    player.phys.tires.avgWear = 0.72;

    engineer.update(player, [player], events, 0.1);
    events.flush();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('PIT WINDOW RECOMMENDED');
  });

  it('emits gap notifications to rival ahead when in DRS threat range', () => {
    const player = makeCar(0, true, 0, 0, 'soft');
    const rival = makeCar(1, false, 0, 0, 'soft');
    player.position = 2;
    rival.position = 1;
    player.timing.lapsCompleted = 2;
    rival.timing.lapsCompleted = 2;
    player.timing.lastCheckpoint = 10;
    rival.timing.lastCheckpoint = 10;
    player.timing.checkpointTimes = new Float64Array(50);
    rival.timing.checkpointTimes = new Float64Array(50);
    player.timing.checkpointTimes[10] = 30.8;
    rival.timing.checkpointTimes[10] = 30.0; // 0.8s ahead

    const events = new EventBus();
    const messages: string[] = [];
    events.subscribe((e) => {
      if (e.type === 'engineer' && e.message.startsWith('GAP AHEAD')) messages.push(e.message);
    });

    const engineer = new EngineerManager();
    // Advance cooldown
    engineer.update(player, [player, rival], events, 20);
    events.flush();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('+0.8s');
  });
});

describe('R9: Championship Points System', () => {
  it('awards 25-18-15-12-10-8-6-4-2-1 points with +1 fastest lap in top 10', () => {
    const cars = Array.from({ length: 12 }, (_, i) => makeCar(i, i === 0, 0, 0, 'soft'));
    // Car 2 has fastest lap and finishes P3
    const points = calculateChampionshipPoints(cars, 2);

    expect(points.get(0)).toBe(25); // P1
    expect(points.get(1)).toBe(18); // P2
    expect(points.get(2)).toBe(15 + 1); // P3 + FL
    expect(points.get(3)).toBe(12); // P4
    expect(points.get(4)).toBe(10); // P5
    expect(points.get(5)).toBe(8); // P6
    expect(points.get(6)).toBe(6); // P7
    expect(points.get(7)).toBe(4); // P8
    expect(points.get(8)).toBe(2); // P9
    expect(points.get(9)).toBe(1); // P10
    expect(points.get(10)).toBe(0); // P11
    expect(points.get(11)).toBe(0); // P12
  });

  it('does not award fastest lap bonus point to a car finishing outside top 10', () => {
    const cars = Array.from({ length: 12 }, (_, i) => makeCar(i, false, 0, 0, 'soft'));
    // Car 11 finishes P12 with fastest lap
    const points = calculateChampionshipPoints(cars, 11);
    expect(points.get(11)).toBe(0);
  });
});

describe('R10: Car Setup Presets', () => {
  it('provides distinct downforce presets with monotonic ClA/CdA progression', () => {
    expect(AERO_PRESET_CONFIG.low.CdA).toBeLessThan(AERO_PRESET_CONFIG.medium.CdA);
    expect(AERO_PRESET_CONFIG.medium.CdA).toBeLessThan(AERO_PRESET_CONFIG.high.CdA);
    expect(AERO_PRESET_CONFIG.low.ClA).toBeLessThan(AERO_PRESET_CONFIG.medium.ClA);
    expect(AERO_PRESET_CONFIG.medium.ClA).toBeLessThan(AERO_PRESET_CONFIG.high.ClA);
  });

  it('initializes default setup with balanced values', () => {
    expect(DEFAULT_SETUP.aeroPreset).toBe('medium');
    expect(DEFAULT_SETUP.brakeBias).toBe(56);
    expect(DEFAULT_SETUP.diffOnThrottle).toBe(70);
  });

  it('applies setup parameters across vehicle physics modules', () => {
    const setup: CarSetup = {
      aeroPreset: 'high',
      brakeBias: 60,
      diffOnThrottle: 90,
      rideHeightM: 0.025,
      tirePressureBar: 1.60,
    };
    expect(setup.diffOnThrottle).toBeGreaterThan(DEFAULT_SETUP.diffOnThrottle);
    expect(setup.rideHeightM).toBeLessThan(DEFAULT_SETUP.rideHeightM);
    expect(setup.tirePressureBar).toBeGreaterThan(DEFAULT_SETUP.tirePressureBar);
  });
});

describe('R11: Telemetry CSV Export', () => {
  it('formats telemetry samples into standard CSV structure', () => {
    const samples: TelemetrySample[] = [
      {
        distanceM: 100.5,
        speedKmh: 285.2,
        throttle: 1.0,
        brake: 0.0,
        gear: 7,
        rpm: 11450,
        drs: true,
        lateralG: 0.15,
        longitudinalG: 0.82,
      },
      {
        distanceM: 250.0,
        speedKmh: 110.0,
        throttle: 0.0,
        brake: 0.95,
        gear: 3,
        rpm: 8200,
        drs: false,
        lateralG: 2.45,
        longitudinalG: -3.80,
      },
    ];

    const csv = exportLapTelemetryCsv(samples);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('distance_m,speed_kmh,throttle,brake,gear,rpm,drs,lat_g,lon_g');
    expect(lines[1]).toBe('100.5,285.2,1.00,0.00,7,11450,1,0.15,0.82');
    expect(lines[2]).toBe('250.0,110.0,0.00,0.95,3,8200,0,2.45,-3.80');
  });
});

describe('R12: 2026 Regulations Active Aero', () => {
  it('engages Straight Mode with reduced drag and downforce on straights', () => {
    const straightMode = get2026AeroModifiers(true);
    expect(straightMode.cdaScale).toBe(0.75); // 25% drag cut
    expect(straightMode.claScale).toBe(0.65); // 35% downforce cut

    const cornerMode = get2026AeroModifiers(false);
    expect(cornerMode.cdaScale).toBe(1.0);
    expect(cornerMode.claScale).toBe(1.0);
  });
});
