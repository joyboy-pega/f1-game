import { AIConfig, AI_CONFIGS, WeatherType, CameraViewMode, VehicleModelType } from './constants';

export type { WeatherType, CameraViewMode, VehicleModelType };

export type RaceState = 'idle' | 'lights' | 'run' | 'paused' | 'finished';

export interface ToastMessage {
  id: string;
  type: 'overtake' | 'lap' | 'bias' | 'tire' | 'drs';
  title: string;
  subtitle?: string;
  duration: number; // in seconds
}

export interface RaceOrderRow {
  position: number;
  name: string;
  isPlayer: boolean;
  color: string;
  gapText: string;
}

export interface RaceStatistics {
  position: number;
  totalTime: number;
  bestLap: number | null;
  lastLap: number | null;
  topSpeed: number;
  overtakeCount: number;
  drsUseCount: number;
  ersUseCount: number;
  lapTimes: number[];
}

export function formatLapTime(seconds: number | null): string {
  if (seconds === null || isNaN(seconds) || seconds <= 0) return '--:--.---';
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}

export interface GameSettings {
  weather: WeatherType;
  carModel: VehicleModelType;
  cameraView: CameraViewMode;
  audioEnabled: boolean;
  volume: number;
  steeringSensitivity: number;
  brakeForce: number;
  tireWearRate: number;
  totalLaps: number;
  bodyColor: string;
  accentColor: string;
  rimColor: string;
}

export const DEFAULT_SETTINGS: GameSettings = {
  weather: 'sunny',
  carModel: 'f1',
  cameraView: 'chase',
  audioEnabled: true,
  volume: 0.75,
  steeringSensitivity: 1.0,
  brakeForce: 1.0,
  tireWearRate: 1.0,
  totalLaps: 5,
  bodyColor: '#e10600',
  accentColor: '#121212',
  rimColor: '#c0c0c0',
};
