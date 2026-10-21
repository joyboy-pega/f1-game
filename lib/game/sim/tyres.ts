import { TIRE_CONFIG, TYRE_COMPOUNDS, WEATHER_WETNESS, type TyreCompound, type WeatherType, type WetClass } from '../constants';

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

/** Default track wetness for a weather type. */
export function wetnessFor(weather: WeatherType): number {
  return WEATHER_WETNESS[weather];
}

/**
 * Grip of a tyre class relative to its dry grip at a given wetness (0..1).
 * Slicks collapse as soon as it is wet, inters peak in light/medium rain and
 * aquaplane in heavy rain, wets are poor on a dry track but best in heavy rain.
 */
export function wetGripFactor(cls: WetClass, wet: number): number {
  const w = clamp01(wet);
  switch (cls) {
    case 'slick':
      return 1 - 0.3 * clamp01(w / 0.55) - 0.25 * clamp01((w - 0.55) / 0.45);
    case 'inter':
      return 0.88 + 0.24 * smooth(w / 0.4) - 0.35 * clamp01((w - 0.4) / 0.6);
    case 'wet':
      return 0.8 + 0.3 * smooth(w / 0.8);
  }
}

/** The best compound for a given wetness. */
export function bestCompoundForWetness(wet: number): TyreCompound {
  if (wet < 0.12) return 'medium';
  return wet < 0.7 ? 'inter' : 'wet';
}

/** True when the compound is a poor match for the current wetness (strategy trigger). */
export function compoundMismatch(c: TyreCompound, wet: number): boolean {
  const cls = TYRE_COMPOUNDS[c].wetClass;
  if (cls === 'slick') return wet > 0.2;
  if (cls === 'inter') return wet < 0.12 || wet > 0.8;
  return wet < 0.35;
}

/** Grip from temperature relative to the compound window (1.0 inside the window). */
export function tempGrip(temp: number, window: [number, number]): number {
  const [lo, hi] = window;
  if (temp < lo) {
    const f = Math.min(1, (lo - temp) / Math.max(1, lo - TIRE_CONFIG.minTireTemperature));
    return 1 - (1 - TIRE_CONFIG.coldGripMultiplier) * Math.pow(f, 1.5);
  }
  if (temp > hi + 6) {
    const f = Math.min(1, (temp - hi - 6) / Math.max(1, TIRE_CONFIG.maxTireTemperature - hi - 6));
    return 1 - (1 - TIRE_CONFIG.overheatGripMultiplier) * Math.sqrt(f);
  }
  return 1;
}

export function wearGrip(wear: number): number {
  const w = clamp01(wear);
  return 1 - TIRE_CONFIG.wearGripLoss * Math.pow(w, TIRE_CONFIG.wearGripExponent);
}

/** How badly a wet-weather tyre is being abused on a dry track (0 = fine, 1 = fully dry). */
export function dryMisuse(cls: WetClass, wet: number): number {
  if (cls === 'slick') return 0;
  return 1 - clamp01(wet / 0.3);
}
