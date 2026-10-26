import type { ControlState } from '../controls';
import type { Livery, TyreCompound, VehicleModelType, WeatherType } from '../constants';

export interface PlayerInfo {
  id: string; // peer id
  carId: number;
  driverName: string;
  driverCode: string;
  team: string;
  livery: Livery;
  carModel: VehicleModelType;
  ready: boolean;
  isHost: boolean;
  latencyMs: number;
}

export interface RoomSettings {
  trackId: string;
  totalLaps: number;
  weather: WeatherType;
  aiCount: number;
}

export interface CarSnapshot {
  carId: number;
  timestamp: number; // server sim time
  x: number;
  y: number;
  a: number; // heading angle
  vf: number; // forward velocity
  vl: number; // lateral velocity
  yawRate: number;
  steer: number;
  throttle: number;
  brake: number;
  drsOpen: boolean;
  isBoosting: boolean;
  compound: TyreCompound;
  lap: number;
  position: number;
  gapToLeader: string;
  inPit: boolean;
  finished: boolean;
}

export interface ClientInputPacket {
  type: 'input';
  peerId: string;
  seq: number;
  timestamp: number;
  controls: ControlState;
}

export interface ServerSnapshotPacket {
  type: 'snapshot';
  simTime: number;
  cars: CarSnapshot[];
}

export interface RoomSyncPacket {
  type: 'room_sync';
  roomId: string;
  hostId: string;
  state: 'idle' | 'lobby' | 'countdown' | 'racing' | 'ended';
  countdownLeft?: number;
  settings: RoomSettings;
  players: PlayerInfo[];
}

export interface PingPacket {
  type: 'ping';
  timestamp: number;
}

export interface PongPacket {
  type: 'pong';
  pingTimestamp: number;
  serverTimestamp: number;
}

export type MultiplayerPacket =
  | ClientInputPacket
  | ServerSnapshotPacket
  | RoomSyncPacket
  | PingPacket
  | PongPacket;

export function serializePacket(packet: MultiplayerPacket): string {
  return JSON.stringify(packet);
}

export function deserializePacket(raw: string): MultiplayerPacket | null {
  try {
    return JSON.parse(raw) as MultiplayerPacket;
  } catch {
    return null;
  }
}
