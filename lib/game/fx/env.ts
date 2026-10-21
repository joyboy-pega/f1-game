import type { TimeOfDay, WeatherType } from '../constants';

export interface FxEnv {
  /** Ambient brightness multiplier for unlit particle colours (night sprites must not glow). */
  light: number;
  /** Tyre smoke / spray base colour, 0..1. */
  smoke: readonly [number, number, number];
  spray: readonly [number, number, number];
  /** Wet asphalt: marks are fainter, spray is emitted. */
  wet: boolean;
  snow: boolean;
  /** 0..1 how heavy the spray rooster tail is. */
  sprayAmount: number;
}

const TOD_LIGHT: Record<TimeOfDay, number> = { day: 1, sunset: 0.78, night: 0.34 };
const WEATHER_LIGHT: Record<WeatherType, number> = { sunny: 1, cloudy: 0.88, rain: 0.72, snow: 1.05 };

export function getFxEnv(weather: WeatherType, tod: TimeOfDay): FxEnv {
  const light = Math.min(1.1, TOD_LIGHT[tod] * WEATHER_LIGHT[weather]);
  switch (weather) {
    case 'rain':
      return { light, smoke: [0.74, 0.79, 0.86], spray: [0.8, 0.86, 0.93], wet: true, snow: false, sprayAmount: 1 };
    case 'snow':
      return { light, smoke: [0.95, 0.97, 1], spray: [0.97, 0.98, 1], wet: false, snow: true, sprayAmount: 0.45 };
    case 'cloudy':
      return { light, smoke: [0.84, 0.86, 0.88], spray: [0.8, 0.85, 0.9], wet: false, snow: false, sprayAmount: 0 };
    default:
      return { light, smoke: [0.93, 0.93, 0.92], spray: [0.85, 0.9, 0.95], wet: false, snow: false, sprayAmount: 0 };
  }
}
