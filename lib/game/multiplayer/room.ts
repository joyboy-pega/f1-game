import {
  type CarSnapshot,
  type ClientInputPacket,
  type MultiplayerPacket,
  type PlayerInfo,
  type RoomSettings,
  type RoomSyncPacket,
  type ServerSnapshotPacket,
  deserializePacket,
  serializePacket,
} from './protocol';
import { SnapshotInterpolator } from './interpolator';
import { GameWorld } from '../sim/world';
import { createBrain } from '../sim/ai';
import { NEUTRAL_CONTROLS, type ControlState } from '../controls';

export type RoomRole = 'host' | 'client';
export type RoomState = 'idle' | 'lobby' | 'countdown' | 'racing' | 'ended';

export interface RoomEventListener {
  onStateChange?: (state: RoomState) => void;
  onPlayersChange?: (players: PlayerInfo[]) => void;
  onSettingsChange?: (settings: RoomSettings) => void;
  onChat?: (sender: string, text: string) => void;
}

export class MultiplayerRoom {
  roomId = '';
  localPeerId = '';
  role: RoomRole = 'client';
  state: RoomState = 'idle';
  settings: RoomSettings = {
    trackId: 'buddh',
    totalLaps: 5,
    weather: 'sunny',
    aiCount: 8,
  };
  players: PlayerInfo[] = [];
  interpolator = new SnapshotInterpolator();

  private channel: BroadcastChannel | null = null;
  private listeners: RoomEventListener[] = [];
  private peerHeartbeats = new Map<string, number>();
  private clientInputs = new Map<string, ControlState>();
  private countdownTimer = 0;
  private seq = 0;

  constructor() {
    this.localPeerId = 'peer_' + Math.random().toString(36).substring(2, 8);
  }

  subscribe(listener: RoomEventListener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyState(state: RoomState) {
    this.state = state;
    for (const l of this.listeners) l.onStateChange?.(state);
  }

  private notifyPlayers() {
    for (const l of this.listeners) l.onPlayersChange?.([...this.players]);
  }

  private notifySettings() {
    for (const l of this.listeners) l.onSettingsChange?.({ ...this.settings });
  }

  createRoom(roomId: string, initialPlayer: Partial<PlayerInfo>) {
    this.roomId = roomId;
    this.role = 'host';
    this.setupTransport(roomId);
    this.players = [
      {
        id: this.localPeerId,
        carId: 0,
        driverName: initialPlayer.driverName || 'Host Driver',
        driverCode: initialPlayer.driverCode || 'HST',
        team: initialPlayer.team || 'Scuderia',
        livery: initialPlayer.livery || { body: '#e10600', accent: '#121212', rim: '#c0c0c0', number: 1 },
        carModel: initialPlayer.carModel || 'f1',
        ready: true,
        isHost: true,
        latencyMs: 0,
      },
    ];
    this.notifyState('lobby');
    this.notifyPlayers();
    this.broadcastRoomSync();
  }

  joinRoom(roomId: string, player: Partial<PlayerInfo>) {
    this.roomId = roomId;
    this.role = 'client';
    this.setupTransport(roomId);
    this.localPlayerInfo = {
      id: this.localPeerId,
      carId: -1,
      driverName: player.driverName || 'Challenger',
      driverCode: player.driverCode || 'CHL',
      team: player.team || 'Racing',
      livery: player.livery || { body: '#ff8700', accent: '#0072bb', rim: '#1e1e1e', number: 2 },
      carModel: player.carModel || 'f1',
      ready: false,
      isHost: false,
      latencyMs: 0,
    };
    this.notifyState('lobby');
    // Announce join with full player info
    this.send({
      type: 'join',
      player: this.localPlayerInfo,
    });
    this.send({
      type: 'ping',
      timestamp: Date.now(),
    });
  }

  private localPlayerInfo: PlayerInfo | null = null;

  setReady(ready: boolean) {
    const p = this.players.find((x) => x.id === this.localPeerId);
    if (p) {
      p.ready = ready;
      this.notifyPlayers();
      if (this.role === 'host') {
        this.broadcastRoomSync();
      }
    }
  }

  updateSettings(patch: Partial<RoomSettings>) {
    if (this.role !== 'host') return;
    this.settings = { ...this.settings, ...patch };
    this.notifySettings();
    this.broadcastRoomSync();
  }

  startCountdown() {
    if (this.role !== 'host') return;
    this.notifyState('countdown');
    this.countdownTimer = 3.0;
    this.broadcastRoomSync();
  }

  sendInput(controls: ControlState, simTimestamp: number) {
    if (this.role === 'client') {
      this.send({
        type: 'input',
        peerId: this.localPeerId,
        seq: ++this.seq,
        timestamp: simTimestamp,
        controls,
      });
    }
  }

  /** Host-only: update sim cars and broadcast snapshot at 25 Hz. */
  broadcastSnapshot(world: GameWorld) {
    if (this.role !== 'host') return;
    const snapshots: CarSnapshot[] = world.cars.map((c) => ({
      carId: c.id,
      timestamp: world.raceTime,
      x: c.phys.x,
      y: c.phys.y,
      a: c.phys.a,
      vf: c.phys.vf,
      vl: c.phys.vl,
      yawRate: c.phys._veh ? c.phys._veh.yawRate : 0,
      steer: c.phys.steer,
      throttle: c.ctrl.throttle,
      brake: c.ctrl.brake,
      drsOpen: c.phys.drsOpen,
      isBoosting: c.phys.isBoosting,
      compound: c.compound,
      lap: c.timing.lapsCompleted + 1,
      position: c.position,
      gapToLeader: '',
      inPit: !!c.pit,
      finished: c.timing.finished,
    }));

    const packet: ServerSnapshotPacket = {
      type: 'snapshot',
      simTime: world.raceTime,
      cars: snapshots,
    };
    this.send(packet);
  }

  /** Host-only: applies client inputs to assigned car or falls back to AI. */
  applyClientInputs(world: GameWorld, nowMs: number) {
    if (this.role !== 'host') return;
    for (const player of this.players) {
      if (player.isHost) continue;
      const car = world.cars[player.carId];
      if (!car) continue;

      const lastBeat = this.peerHeartbeats.get(player.id) ?? nowMs;
      // If peer has disconnected for > 3000 ms, hand over to AI
      if (nowMs - lastBeat > 3000) {
        if (!car.ai) {
          car.ai = createBrain(player.carId);
        }
      } else {
        car.ai = null;
        const ctrl = this.clientInputs.get(player.id) ?? NEUTRAL_CONTROLS;
        car.ctrl = { ...ctrl };
      }
    }
  }

  private setupTransport(roomId: string) {
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(`f1_room_${roomId}`);
      this.channel.onmessage = (ev) => {
        const packet = deserializePacket(ev.data);
        if (packet) this.handlePacket(packet);
      };
    }
  }

  private send(packet: MultiplayerPacket) {
    if (this.channel) {
      this.channel.postMessage(serializePacket(packet));
    }
  }

  private broadcastRoomSync() {
    const packet: RoomSyncPacket = {
      type: 'room_sync',
      roomId: this.roomId,
      hostId: this.localPeerId,
      state: this.state,
      countdownLeft: this.countdownTimer,
      settings: this.settings,
      players: this.players,
    };
    this.send(packet);
  }

  handlePacket(packet: MultiplayerPacket) {
    switch (packet.type) {
      case 'room_sync': {
        if (this.role === 'client') {
          this.state = packet.state;
          this.settings = packet.settings;
          this.players = packet.players;
          this.notifyState(packet.state);
          this.notifySettings();
          this.notifyPlayers();
        }
        break;
      }
      case 'snapshot': {
        if (this.role === 'client') {
          for (const s of packet.cars) {
            this.interpolator.push(s);
          }
        }
        break;
      }
      case 'input': {
        if (this.role === 'host') {
          this.peerHeartbeats.set(packet.peerId, Date.now());
          this.clientInputs.set(packet.peerId, packet.controls);
        }
        break;
      }
      case 'join': {
        if (this.role === 'host') {
          const existing = this.players.find((p) => p.id === packet.player.id);
          if (!existing) {
            const assignedCarId = this.players.length;
            const newPlayer: PlayerInfo = { ...packet.player, carId: assignedCarId, ready: true };
            this.players.push(newPlayer);
            this.peerHeartbeats.set(newPlayer.id, Date.now());
            this.notifyPlayers();
          }
          this.broadcastRoomSync();
        }
        break;
      }
      case 'leave': {
        if (this.role === 'host') {
          this.players = this.players.filter((p) => p.id !== packet.peerId);
          this.notifyPlayers();
          this.broadcastRoomSync();
        }
        break;
      }
      case 'ping': {
        if (this.role === 'host') {
          this.send({
            type: 'pong',
            pingTimestamp: packet.timestamp,
            serverTimestamp: Date.now(),
          });
          this.broadcastRoomSync();
        }
        break;
      }
      case 'pong': {
        const rtt = Date.now() - packet.pingTimestamp;
        const local = this.players.find((p) => p.id === this.localPeerId);
        if (local) local.latencyMs = Math.round(rtt / 2);
        break;
      }
    }
  }

  close() {
    if (this.channel) {
      if (this.role === 'client') {
        this.send({ type: 'leave', peerId: this.localPeerId });
      }
      this.channel.close();
      this.channel = null;
    }
    this.state = 'idle';
    this.players = [];
    this.interpolator.reset();
  }
}

export const multiplayerRoom = new MultiplayerRoom();
