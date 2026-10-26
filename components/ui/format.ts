import type { GameMode, TyreCompound, WeatherType } from '@/lib/game/gameState';
import { useEffect, useState } from 'react';

export const COMPOUNDS: Record<TyreCompound, { letter: string; color: string; name: string }> = {
  soft: { letter: 'S', color: '#ff3b30', name: 'SOFT' },
  medium: { letter: 'M', color: '#ffd400', name: 'MEDIUM' },
  hard: { letter: 'H', color: '#f4f4ee', name: 'HARD' },
  inter: { letter: 'I', color: '#00d26a', name: 'INTER' },
  wet: { letter: 'W', color: '#2f8cff', name: 'WET' },
};

export const COMPOUND_ORDER: TyreCompound[] = ['soft', 'medium', 'hard', 'inter', 'wet'];

export const MODE_NAMES: Record<GameMode, string> = {
  race: 'GRAND PRIX',
  qualifying: 'QUALIFYING',
  timetrial: 'TIME TRIAL',
  practice: 'FREE PRACTICE',
  multiplayer: 'MULTIPLAYER',
};

export const WEATHER_LABEL: Record<WeatherType, string> = {
  sunny: 'SUNNY',
  cloudy: 'CLOUDY',
  rain: 'RAIN',
  snow: 'SNOW',
  dynamic: 'DYNAMIC',
};

export const LAP_RECORD = { time: 87.249, driver: 'Sebastian Vettel', year: 2011 };

export function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}TH`;
  switch (n % 10) {
    case 1:
      return `${n}ST`;
    case 2:
      return `${n}ND`;
    case 3:
      return `${n}RD`;
    default:
      return `${n}TH`;
  }
}

/** Running lap clock: always shows a value (0:00.000) rather than dashes. */
export function formatClock(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}

/** Tyre temperature to colour: cold blue, optimal green, hot orange to red. */
export function tempColor(t: number): string {
  if (t < 78) {
    const k = Math.max(0, Math.min(1, (t - 40) / 38));
    return `hsl(${205 + (1 - k) * 15} 90% ${38 + k * 8}%)`;
  }
  if (t <= 105) return 'hsl(142 80% 42%)';
  if (t <= 118) {
    const k = (t - 105) / 13;
    return `hsl(${142 - k * 105} 90% ${42 + k * 6}%)`;
  }
  const k = Math.min(1, (t - 118) / 27);
  return `hsl(${37 - k * 37} 95% ${48 - k * 6}%)`;
}

export function tempWord(t: number): string {
  if (t < 78) return 'COLD';
  if (t <= 105) return 'OPTIMAL';
  if (t <= 118) return 'WARM';
  return 'HOT';
}

/** True after the first client effect; use to avoid SSR/persisted-store hydration mismatches. */
export function useMounted(): boolean {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

export function isEditableTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}
