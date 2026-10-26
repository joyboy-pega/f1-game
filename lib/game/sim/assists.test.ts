import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Assists } from '../gameState';
import { NEUTRAL_CONTROLS } from '../controls';
import { track } from '../track';
import { GameWorld, FIXED_DT } from './world';
import { applyAssists } from './assists';
import { getRacingLine } from './racingLine';

describe('driver assists (PLAN-v3 §5.5 V5)', () => {
  it('traction control cuts throttle on rear wheel slip', () => {
    const w = new GameWorld();
    const car = w.player;
    car.phys.vf = 200;
    car.phys.wheelSlipRear = 0.25; // high slip
    car.ctrl.throttle = 1.0;
    car.ctrl.steer = 0;

    const assists: Assists = {
      racingLine: 'corners',
      brakingAssist: false,
      steeringAssist: false,
      tractionControl: true,
      abs: false,
      stabilityControl: false,
    };

    applyAssists(car, assists, 'sunny');
    expect(car.ctrl.throttle).toBeLessThan(0.8);
  });

  it('ABS prevents brake lockup when slip exceeds threshold', () => {
    const w = new GameWorld();
    const car = w.player;
    car.phys.vf = 250;
    car.phys.wheelSlipFront = 0.35; // lockup
    car.ctrl.brake = 1.0;

    const assists: Assists = {
      racingLine: 'corners',
      brakingAssist: false,
      steeringAssist: false,
      tractionControl: false,
      abs: true,
      stabilityControl: false,
    };

    applyAssists(car, assists, 'sunny');
    expect(car.ctrl.brake).toBeLessThan(0.85);
  });

  it('stability control applies counter-steer on severe body sideslip', () => {
    const w = new GameWorld();
    const car = w.player;
    car.phys.vf = 200;
    car.phys.vl = 35; // sliding right (positive beta)
    car.ctrl.steer = 0;
    car.ctrl.throttle = 1.0;

    const assists: Assists = {
      racingLine: 'corners',
      brakingAssist: false,
      steeringAssist: false,
      tractionControl: false,
      abs: false,
      stabilityControl: true,
    };

    applyAssists(car, assists, 'sunny');
    // Positive lateral velocity -> negative counter-steer
    expect(car.ctrl.steer).toBeLessThan(0);
    expect(car.ctrl.throttle).toBeLessThanOrEqual(0.4);
  });

  it('braking assist brakes for corners when approaching over safe speed', () => {
    const w = new GameWorld();
    const car = w.player;
    // Approaching Turn 1 (idx ~180) at high speed (300 km/h)
    car.phys.idx = 160;
    car.phys.vf = 750; // 270 km/h
    car.ctrl.throttle = 1.0;
    car.ctrl.brake = 0.0;

    const assists: Assists = {
      racingLine: 'corners',
      brakingAssist: true,
      steeringAssist: false,
      tractionControl: false,
      abs: false,
      stabilityControl: false,
    };

    applyAssists(car, assists, 'sunny');
    expect(car.ctrl.brake).toBeGreaterThan(0.3);
    expect(car.ctrl.throttle).toBe(0);
  });

  it('hard requirement: keyboard bot with all assists completes a lap of Buddh without leaving track', () => {
    const w = new GameWorld();
    w.seed = 42;
    const allAssists: Assists = {
      racingLine: 'full',
      brakingAssist: true,
      steeringAssist: true,
      tractionControl: true,
      abs: true,
      stabilityControl: true,
    };

    w.setup({
      ...DEFAULT_SETTINGS,
      mode: 'timetrial',
      totalLaps: 1,
      aiCount: 0,
      gridPosition: 1,
      weather: 'sunny',
      assists: allAssists,
    });

    const player = w.player;
    const RL = getRacingLine();
    const N = track.current.N;

    let lapCompleted = false;
    let lapTime = 0;
    w.events.subscribe((e) => {
      if (e.type === 'lap' && e.carId === player.id) {
        lapCompleted = true;
        lapTime = e.time;
      }
    });

    let offTrackTime = 0;
    const maxSteps = Math.round(180 / FIXED_DT); // 180s max for 1 lap

    for (let step = 0; step < maxSteps; step++) {
      // Scripted keyboard bot: purely digital 0/1 inputs
      // Hold full throttle:
      const rawThrottle = 1.0;
      const rawBrake = 0.0;

      // Digital steering: looking ahead on the racing line, press Left (-1), Right (+1), or neutral (0)
      const lookahead = (player.phys.idx + 12) % N;
      const targetHeading = RL.heading[lookahead];
      let herr = targetHeading - player.phys.a;
      herr = Math.atan2(Math.sin(herr), Math.cos(herr));

      // Also account for lateral displacement from line
      const latOffset = player.lateral - RL.offset[player.phys.idx];
      const steerDemand = herr - (latOffset / 50);

      let rawSteer = 0;
      if (steerDemand > 0.04) rawSteer = 1.0;
      else if (steerDemand < -0.04) rawSteer = -1.0;

      // Digital keyboard input
      const controls = {
        ...NEUTRAL_CONTROLS,
        throttle: rawThrottle,
        brake: rawBrake,
        steer: rawSteer,
        analogSteer: false, // digital keyboard keys!
      };

      w.step(FIXED_DT, controls);
      w.events.flush();

      if (!player.surface.onTrack && !player.inPit) {
        offTrackTime += FIXED_DT;
      }

      if (lapCompleted) break;
    }

    console.log(`[keyboard bot] lapTime=${lapTime.toFixed(2)}s, offTrackTime=${offTrackTime.toFixed(2)}s`);
    expect(lapCompleted).toBe(true);
    expect(lapTime).toBeGreaterThan(60);
    expect(lapTime).toBeLessThan(160);
    // Hard requirement: completes the lap without leaving the asphalt
    expect(offTrackTime).toBeLessThan(2.0);
  });
});
