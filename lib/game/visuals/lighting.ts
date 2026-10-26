// Time-of-day x weather lighting presets. Pure data (no three) so any
// workstream can read it: `useLighting()` in components, `getLighting()` anywhere.
import { useMemo } from 'react';
import type { TimeOfDay, WeatherType } from '@/lib/game/constants';
import { useGameStore } from '@/lib/game/store';

export interface Lighting {
  tod: TimeOfDay;
  weather: WeatherType;
  /** Unit vector pointing from the scene towards the sun/moon (three.js axes). */
  sunDir: [number, number, number];
  sunColor: string;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  fogColor: string;
  fogDensity: number;
  skyZenith: string;
  skyHorizon: string;
  skyGround: string;
  exposure: number;
  /** 0 = daylight, 1 = full night (floodlights, stars, lit windows). */
  nightFactor: number;
  /** 0 = dry, 1 = soaked tarmac (darker, glossier). */
  wetness: number;
  /** 0 clear .. 1 solid overcast. */
  cloudCover: number;
  starIntensity: number;
  /** Scale for scene.environmentIntensity (IBL). */
  envIntensity: number;
  snow: boolean;
  /** Sun (not moon) is the key light and visible disc should be drawn. */
  sunVisible: boolean;
}

type RGB = [number, number, number];
const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (c: RGB) =>
  '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a: string, b: string, t: number) => {
  const x = hex(a), y = hex(b);
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
};
/** Desaturate towards luma and scale brightness. */
const grey = (c: string, amount: number, bright: number) => {
  const x = hex(c);
  const l = x[0] * 0.3 + x[1] * 0.59 + x[2] * 0.11;
  return toHex([
    (x[0] + (l - x[0]) * amount) * bright,
    (x[1] + (l - x[1]) * amount) * bright,
    (x[2] + (l - x[2]) * amount) * bright,
  ]);
};
const norm = (v: [number, number, number]): [number, number, number] => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** Rotates a sun direction vector in the XZ plane around Y by azimuth degrees (PLAN-v3 §7 G4). */
export function rotateSunByAzimuth(dir: [number, number, number], deg = 0): [number, number, number] {
  if (!deg) return dir;
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const x = dir[0] * cos - dir[2] * sin;
  const z = dir[0] * sin + dir[2] * cos;
  return [x, dir[1], z];
}

interface Base extends Omit<Lighting, 'tod' | 'weather' | 'wetness' | 'cloudCover' | 'snow'> {
  cloudCover: number;
}

// Track runs towards +x; +z is the driver's right on the main straight.
const BASE: Record<TimeOfDay, Base> = {
  day: {
    sunDir: norm([-0.5, 0.78, -0.42]),
    sunColor: '#fff1d8',
    sunIntensity: 2.6,
    hemiSky: '#cfe2ff',
    hemiGround: '#6f6a52',
    hemiIntensity: 0.55,
    fogColor: '#b9d4ee',
    fogDensity: 0.00011,
    skyZenith: '#2f74d0',
    skyHorizon: '#b4d3ef',
    skyGround: '#a9c4d8',
    exposure: 1.0,
    nightFactor: 0,
    cloudCover: 0.28,
    starIntensity: 0,
    envIntensity: 0.9,
    sunVisible: true,
  },
  sunset: {
    sunDir: norm([0.5, 0.14, -0.85]),
    sunColor: '#ff9a4a',
    sunIntensity: 2.8,
    hemiSky: '#7f86c8',
    hemiGround: '#5a4438',
    hemiIntensity: 0.5,
    fogColor: '#e9a577',
    fogDensity: 0.00016,
    skyZenith: '#27407f',
    skyHorizon: '#ff9c5c',
    skyGround: '#c98a63',
    exposure: 1.05,
    nightFactor: 0.4,
    cloudCover: 0.4,
    starIntensity: 0.15,
    envIntensity: 0.8,
    sunVisible: true,
  },
  night: {
    sunDir: norm([-0.3, 0.7, -0.65]),
    sunColor: '#9db4ff',
    sunIntensity: 1.1,
    hemiSky: '#6f86c8',
    hemiGround: '#2b3452',
    hemiIntensity: 1.6,
    fogColor: '#0c1428',
    fogDensity: 0.00014,
    skyZenith: '#02050f',
    skyHorizon: '#14223f',
    skyGround: '#0a1222',
    exposure: 1.5,
    nightFactor: 1,
    cloudCover: 0.2,
    starIntensity: 1,
    envIntensity: 0.9,
    sunVisible: false,
  },
};

export function getLighting(tod: TimeOfDay, weather: WeatherType): Lighting {
  const b = BASE[tod];
  const out: Lighting = { ...b, tod, weather, wetness: 0, snow: false, sunDir: [...b.sunDir] };
  const night = tod === 'night';
  switch (weather) {
    case 'cloudy': {
      out.cloudCover = 0.8;
      out.sunIntensity *= 0.35;
      out.hemiIntensity *= 1.45;
      out.fogDensity *= 1.8;
      out.skyZenith = grey(b.skyZenith, 0.6, 0.85);
      out.skyHorizon = grey(b.skyHorizon, 0.6, 0.92);
      out.skyGround = grey(b.skyGround, 0.5, 0.9);
      out.fogColor = grey(b.fogColor, 0.6, 0.92);
      out.hemiSky = grey(b.hemiSky, 0.4, 1);
      out.envIntensity *= 0.9;
      out.starIntensity *= 0.2;
      break;
    }
    case 'rain': {
      out.cloudCover = 1;
      out.sunIntensity *= 0.16;
      out.hemiIntensity *= 1.2;
      out.fogDensity *= 3.2;
      out.skyZenith = grey(b.skyZenith, 0.75, night ? 0.9 : 0.5);
      out.skyHorizon = grey(b.skyHorizon, 0.75, night ? 0.9 : 0.62);
      out.skyGround = grey(b.skyGround, 0.7, 0.6);
      out.fogColor = grey(b.fogColor, 0.75, night ? 0.9 : 0.6);
      out.hemiSky = grey(b.hemiSky, 0.5, 0.8);
      out.hemiGround = grey(b.hemiGround, 0.5, 0.8);
      out.wetness = 1;
      out.envIntensity *= 0.85;
      out.starIntensity = 0;
      out.exposure *= 1.05;
      break;
    }
    case 'snow': {
      out.cloudCover = 0.9;
      out.sunIntensity *= 0.4;
      out.hemiIntensity *= 1.6;
      out.fogDensity *= 2.4;
      out.skyZenith = grey(b.skyZenith, 0.5, night ? 1 : 0.95);
      out.skyHorizon = mix(grey(b.skyHorizon, 0.7, 1), night ? '#1c2a44' : '#e6edf5', 0.5);
      out.skyGround = mix(b.skyGround, night ? '#1c2a44' : '#e6edf5', 0.6);
      out.fogColor = mix(grey(b.fogColor, 0.6, 1), night ? '#1c2a44' : '#dfe8f2', 0.6);
      out.hemiGround = night ? '#3a4660' : '#c8d4e2';
      out.wetness = 0.25;
      out.snow = true;
      out.starIntensity *= 0.3;
      break;
    }
    default:
      break;
  }
  return out;
}

/** Non-hook getter reading the current persisted settings. */
export function getCurrentLighting(): Lighting {
  const s = useGameStore.getState().settings;
  return getLighting(s.timeOfDay, s.weather);
}

/** Reactive lighting preset for the current settings (memoised per tod x weather). */
export function useLighting(): Lighting {
  const tod = useGameStore((s) => s.settings.timeOfDay);
  const weather = useGameStore((s) => s.settings.weather);
  return useMemo(() => getLighting(tod, weather), [tod, weather]);
}
