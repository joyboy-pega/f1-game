import { describe, expect, it } from 'vitest';
import {
  type ClientInputPacket,
  type ServerSnapshotPacket,
  type RoomSyncPacket,
  serializePacket,
  deserializePacket,
} from './protocol';
import { SnapshotInterpolator, unwrapAngle } from './interpolator';
import { MultiplayerRoom } from './room';
import { GameWorld } from '../sim/world';
import { DEFAULT_SETTINGS } from '../gameState';
import { NEUTRAL_CONTROLS } from '../controls';

describe('R13: Multiplayer Packet Serialization / Deserialization', () => {
  it('round-trips ClientInputPacket accurately', () => {
    const packet: ClientInputPacket = {
      type: 'input',
      peerId: 'peer_abc123',
      seq: 42,
      timestamp: 12.345,
      controls: {
        ...NEUTRAL_CONTROLS,
        throttle: 0.85,
        steer: -0.25,
      },
    };

    const serialized = serializePacket(packet);
    const deserialized = deserializePacket(serialized) as ClientInputPacket;
    expect(deserialized).toEqual(packet);
  });

  it('round-trips ServerSnapshotPacket with multiple car states', () => {
    const packet: ServerSnapshotPacket = {
      type: 'snapshot',
      simTime: 45.67,
      cars: [
        {
          carId: 0,
          timestamp: 45.67,
          x: 100.2,
          y: -50.4,
          a: 1.25,
          vf: 65.5,
          vl: 0.1,
          yawRate: 0.05,
          steer: 0.02,
          throttle: 1.0,
          brake: 0.0,
          drsOpen: true,
          isBoosting: false,
          compound: 'soft',
          lap: 2,
          position: 1,
          gapToLeader: 'LEADER',
          inPit: false,
          finished: false,
        },
      ],
    };

    const serialized = serializePacket(packet);
    const deserialized = deserializePacket(serialized) as ServerSnapshotPacket;
    expect(deserialized).toEqual(packet);
  });

  it('gracefully returns null on malformed packet string', () => {
    expect(deserializePacket('{ invalid json')).toBeNull();
    expect(deserializePacket('')).toBeNull();
  });
});

describe('R13: Snapshot Interpolator & Jitter Buffering', () => {
  it('interpolates positions linearly between two timestamped snapshots', () => {
    const interpolator = new SnapshotInterpolator();
    interpolator.push({
      carId: 0,
      timestamp: 1.0,
      x: 0,
      y: 0,
      a: 0,
      vf: 20,
      vl: 0,
      yawRate: 0,
      steer: 0,
      throttle: 1,
      brake: 0,
      drsOpen: false,
      isBoosting: false,
      compound: 'soft',
      lap: 1,
      position: 1,
      gapToLeader: '',
      inPit: false,
      finished: false,
    });

    interpolator.push({
      carId: 0,
      timestamp: 2.0,
      x: 100,
      y: 200,
      a: 1.0,
      vf: 20,
      vl: 0,
      yawRate: 0,
      steer: 0,
      throttle: 1,
      brake: 0,
      drsOpen: false,
      isBoosting: false,
      compound: 'soft',
      lap: 1,
      position: 1,
      gapToLeader: '',
      inPit: false,
      finished: false,
    });

    const pose = { x: 0, y: 0, a: 0 };
    // Sample halfway at t = 1.5
    const success = interpolator.sample(0, 1.5, pose);
    expect(success).toBe(true);
    expect(pose.x).toBeCloseTo(50);
    expect(pose.y).toBeCloseTo(100);
    expect(pose.a).toBeCloseTo(0.5);
  });

  it('correctly unwraps angle around the PI / -PI boundary', () => {
    const fromAngle = Math.PI - 0.1; // ~3.04 rad
    const toAngle = -Math.PI + 0.1; // ~-3.04 rad (clockwise rotation by 0.2 rad)

    const unwrapped = unwrapAngle(fromAngle, toAngle);
    expect(unwrapped).toBeGreaterThan(Math.PI);
    expect(unwrapped - fromAngle).toBeCloseTo(0.2);
  });

  it('extrapolates forward using velocity and heading when packets are delayed', () => {
    const interpolator = new SnapshotInterpolator();
    interpolator.push({
      carId: 0,
      timestamp: 1.0,
      x: 100,
      y: 0,
      a: 0, // facing positive X
      vf: 50, // 50 units/s forward
      vl: 0,
      yawRate: 0,
      steer: 0,
      throttle: 1,
      brake: 0,
      drsOpen: false,
      isBoosting: false,
      compound: 'soft',
      lap: 1,
      position: 1,
      gapToLeader: '',
      inPit: false,
      finished: false,
    });

    const pose = { x: 0, y: 0, a: 0 };
    // Sample 0.1s in the future
    interpolator.sample(0, 1.1, pose);
    expect(pose.x).toBeCloseTo(105); // 100 + 50 * 0.1
    expect(pose.y).toBeCloseTo(0);
    expect(pose.a).toBeCloseTo(0);
  });
});

describe('R13: Multiplayer Room State Machine & AI Fallback', () => {
  it('enforces minimum 2 players before host can start countdown', () => {
    const room = new MultiplayerRoom();
    expect(room.state).toBe('idle');

    room.createRoom('TEST01', { driverName: 'Player1' });
    expect(room.state).toBe('lobby');
    expect(room.role).toBe('host');
    expect(room.players).toHaveLength(1);
    expect(room.players[0].isHost).toBe(true);

    // With 1 player: cannot start
    expect(room.canStartRace).toBe(false);
    expect(room.startCountdown()).toBe(false);
    expect(room.state).toBe('lobby');

    // Host updates theme and track settings
    room.updateSettings({ trackId: 'monza', totalLaps: 3, weather: 'rain', timeOfDay: 'sunset' });
    expect(room.settings.trackId).toBe('monza');
    expect(room.settings.totalLaps).toBe(3);
    expect(room.settings.weather).toBe('rain');
    expect(room.settings.timeOfDay).toBe('sunset');

    // Host updates their car selection
    room.updatePlayer({ carModel: 'roadster', team: 'Velocity GP' });
    expect(room.players[0].carModel).toBe('roadster');
    expect(room.players[0].team).toBe('Velocity GP');

    // Second player joins
    room.handlePacket({
      type: 'join',
      player: {
        id: 'peer_guest2',
        carId: -1,
        driverName: 'Racer Two',
        driverCode: 'RC2',
        team: 'Nova Racing',
        livery: { body: '#00D2BE', accent: '#111111', rim: '#00D2BE', number: 44 },
        carModel: 'pegasus',
        ready: true,
        isHost: false,
        latencyMs: 12,
      },
    });

    // Now 2 players are in the lobby: can start race!
    expect(room.players).toHaveLength(2);
    expect(room.canStartRace).toBe(true);

    // Second player customizes car via player_update
    room.handlePacket({
      type: 'player_update',
      player: {
        id: 'peer_guest2',
        carModel: 'f1',
        team: 'Titan Corsa',
      },
    });
    expect(room.players[1].carModel).toBe('f1');
    expect(room.players[1].team).toBe('Titan Corsa');

    // Owner starts the race
    expect(room.startCountdown()).toBe(true);
    expect(room.state).toBe('countdown');
    room.close();
  });

  it('adds remote player and assigns car ID upon receiving join packet', () => {
    const room = new MultiplayerRoom();
    room.createRoom('TEST03', { driverName: 'Host' });
    expect(room.players).toHaveLength(1);

    room.handlePacket({
      type: 'join',
      player: {
        id: 'peer_joiner',
        carId: -1,
        driverName: 'Guest 1',
        driverCode: 'GST',
        team: 'Papaya',
        livery: { body: '#ff8700', accent: '#0072bb', rim: '#1e1e1e', number: 2 },
        carModel: 'f1',
        ready: true,
        isHost: false,
        latencyMs: 15,
      },
    });

    expect(room.players).toHaveLength(2);
    expect(room.players[1].id).toBe('peer_joiner');
    expect(room.players[1].carId).toBe(1);
    room.close();
  });

  it('falls back to AI controller when a connected peer stops sending inputs', () => {
    const room = new MultiplayerRoom();
    room.createRoom('TEST02', { driverName: 'Host' });
    // Add a remote client player
    room.players.push({
      id: 'peer_client',
      carId: 1,
      driverName: 'Remote Player',
      driverCode: 'REM',
      team: 'Papaya',
      livery: { body: '#ff8700', accent: '#0072bb', rim: '#1e1e1e', number: 4 },
      carModel: 'f1',
      ready: true,
      isHost: false,
      latencyMs: 30,
    });

    const world = new GameWorld();
    world.setup({ ...DEFAULT_SETTINGS, aiCount: 3 });

    // Client actively sending input
    room.handlePacket({
      type: 'input',
      peerId: 'peer_client',
      seq: 1,
      timestamp: 10.0,
      controls: { ...NEUTRAL_CONTROLS, throttle: 1.0 },
    });

    const t0 = Date.now();
    room.applyClientInputs(world, t0);
    expect(world.cars[1].ai).toBeNull();
    expect(world.cars[1].ctrl.throttle).toBe(1.0);

    // 4 seconds elapse without any packet from client (heartbeat timeout)
    const tLate = t0 + 4000;
    room.applyClientInputs(world, tLate);
    // Should now gracefully fall back to AI controller
    expect(world.cars[1].ai).not.toBeNull();
    room.close();
  });

  it('connects 2 real peers: blocks 1-player start, syncs car/theme choices, and starts countdown once 2 racers are in', async () => {
    const hostRoom = new MultiplayerRoom();
    const clientRoom = new MultiplayerRoom();
    const roomId = 'SYNC99';

    let clientRaceStarted = false;
    let hostRaceStarted = false;

    hostRoom.subscribe({
      onStateChange: (state) => {
        if (state === 'countdown' || state === 'racing') hostRaceStarted = true;
      },
    });

    clientRoom.subscribe({
      onStateChange: (state) => {
        if (state === 'countdown' || state === 'racing') clientRaceStarted = true;
      },
    });

    // 1. Host creates room
    hostRoom.createRoom(roomId, {
      driverName: 'HostRacer',
      driverCode: 'HST',
      team: 'Titan Corsa',
      carModel: 'f1',
    });

    // Host cannot start alone (minimum 2 players)
    expect(hostRoom.canStartRace).toBe(false);
    expect(hostRoom.startCountdown()).toBe(false);

    // Host configures theme & track
    hostRoom.updateSettings({
      trackId: 'spa',
      weather: 'rain',
      timeOfDay: 'sunset',
      totalLaps: 3,
    });

    // 2. Client joins room
    clientRoom.joinRoom(roomId, {
      driverName: 'ChallengerTwo',
      driverCode: 'CH2',
      team: 'Velocity GP',
      carModel: 'roadster',
    });

    // Small delay for BroadcastChannel message dispatch
    await new Promise((r) => setTimeout(r, 60));

    // Both rooms should have 2 players
    expect(hostRoom.players).toHaveLength(2);
    expect(hostRoom.canStartRace).toBe(true);

    // Client updates their car choice in the lobby
    clientRoom.updatePlayer({
      carModel: 'pegasus',
      team: 'Pegasus',
    });

    await new Promise((r) => setTimeout(r, 60));

    // Host received client's updated car model
    const guestOnHost = hostRoom.players.find((p) => p.id === clientRoom.localPeerId);
    expect(guestOnHost?.carModel).toBe('pegasus');

    // Host starts countdown (now allowed with 2 players)
    expect(hostRoom.startCountdown()).toBe(true);

    await new Promise((r) => setTimeout(r, 60));

    // Both host and client are transitioned to countdown!
    expect(hostRaceStarted).toBe(true);
    expect(clientRaceStarted).toBe(true);
    expect(clientRoom.settings.trackId).toBe('spa');
    expect(clientRoom.settings.weather).toBe('rain');
    expect(clientRoom.settings.timeOfDay).toBe('sunset');

    hostRoom.close();
    clientRoom.close();
  });
});
