import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  DEFAULT_SETTINGS,
  EMPTY_HUD,
  type GameSettings,
  type HudSnapshot,
  type RacePhase,
  type RaceResults,
  type ToastMessage,
  type GameMode,
  type CameraViewMode,
} from './gameState';
import { world } from './sim/world';

export interface Records {
  /** Best lap per mode+weather key, e.g. "timetrial:sunny". */
  bestLaps: Record<string, number>;
  racesStarted: number;
  racesFinished: number;
  wins: number;
  podiums: number;
}

const EMPTY_RECORDS: Records = { bestLaps: {}, racesStarted: 0, racesFinished: 0, wins: 0, podiums: 0 };

export function recordKey(mode: GameMode, weather: string) {
  return `${mode}:${weather}`;
}

interface GameStore {
  settings: GameSettings;
  setSettings: (patch: Partial<GameSettings>) => void;
  resetSettings: () => void;

  records: Records;
  submitLap: (key: string, time: number) => boolean; // true = new record
  recordRace: (position: number, finished: boolean) => void;

  // --- session (not persisted) ---
  phase: RacePhase;
  lightsLit: number;
  paused: boolean;
  hud: HudSnapshot;
  results: RaceResults | null;
  toasts: ToastMessage[];
  /** Effective render quality (AUTO resolves through the performance governor). */
  quality: 'LOW' | 'MEDIUM' | 'HIGH';
  telemetryOpen: boolean;
  /** Increments on restart so the scene rebuilds. */
  sessionId: number;
  /** Post-race replay playback is active (owned by the replay workstream). */
  replayActive: boolean;

  setPhase: (p: RacePhase) => void;
  setLightsLit: (n: number) => void;
  setPaused: (p: boolean) => void;
  setHud: (h: HudSnapshot) => void;
  setResults: (r: RaceResults | null) => void;
  pushToast: (t: ToastMessage) => void;
  dismissToast: (id: string) => void;
  setQuality: (q: 'LOW' | 'MEDIUM' | 'HIGH') => void;
  toggleTelemetry: () => void;
  cycleCamera: () => void;
  newSession: () => void;
  setReplayActive: (on: boolean) => void;
}

const CAMERA_CYCLE: CameraViewMode[] = ['chase', 'tcam', 'cockpit', 'hood'];

const memoryStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

function getStorage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch {
    // ignore
  }
  return memoryStorage;
}

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      settings: DEFAULT_SETTINGS,
      setSettings: (patch) => {
        set((s) => ({
          settings: { ...s.settings, ...patch },
          ...(patch.showTelemetry !== undefined ? { telemetryOpen: patch.showTelemetry } : {}),
        }));
        world.updateSettings(patch);
      },
      resetSettings: () => {
        set({ settings: DEFAULT_SETTINGS });
        world.updateSettings(DEFAULT_SETTINGS);
      },

      records: EMPTY_RECORDS,
      submitLap: (key, time) => {
        const prev = get().records.bestLaps[key];
        if (prev !== undefined && prev <= time) return false;
        set((s) => ({ records: { ...s.records, bestLaps: { ...s.records.bestLaps, [key]: time } } }));
        return true;
      },
      recordRace: (position, finished) =>
        set((s) => ({
          records: {
            ...s.records,
            racesFinished: s.records.racesFinished + (finished ? 1 : 0),
            wins: s.records.wins + (finished && position === 1 ? 1 : 0),
            podiums: s.records.podiums + (finished && position <= 3 ? 1 : 0),
          },
        })),

      phase: 'grid',
      lightsLit: 0,
      paused: false,
      hud: EMPTY_HUD,
      results: null,
      toasts: [],
      quality: 'HIGH',
      telemetryOpen: DEFAULT_SETTINGS.showTelemetry,
      sessionId: 0,
      replayActive: false,

      setPhase: (phase) => set({ phase }),
      setLightsLit: (lightsLit) => set({ lightsLit }),
      setPaused: (paused) => set({ paused }),
      setHud: (hud) => set({ hud }),
      setResults: (results) => set({ results }),
      pushToast: (t) => {
        set((s) => ({ toasts: [...s.toasts.filter((x) => x.id !== t.id), t].slice(-4) }));
        setTimeout(() => get().dismissToast(t.id), t.duration * 1000);
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
      setQuality: (quality) => set({ quality }),
      toggleTelemetry: () =>
        set((s) => {
          const next = !s.telemetryOpen;
          return {
            telemetryOpen: next,
            settings: { ...s.settings, showTelemetry: next },
          };
        }),
      cycleCamera: () =>
        set((s) => {
          const i = CAMERA_CYCLE.indexOf(s.settings.cameraView);
          return { settings: { ...s.settings, cameraView: CAMERA_CYCLE[(i + 1) % CAMERA_CYCLE.length] } };
        }),
      newSession: () =>
        set((s) => ({
          sessionId: s.sessionId + 1,
          results: null,
          paused: false,
          toasts: [],
          hud: EMPTY_HUD,
          lightsLit: 0,
          replayActive: false,
          telemetryOpen: s.settings.showTelemetry,
          records: { ...s.records, racesStarted: s.records.racesStarted + 1 },
        })),
      setReplayActive: (replayActive) => set({ replayActive }),
    }),
    {
      name: 'buddh-gp',
      version: 1,
      storage: createJSONStorage(() => getStorage()),
      partialize: (s) => ({ settings: s.settings, records: s.records }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Pick<GameStore, 'settings' | 'records'>>;
        const mergedSettings = {
          ...DEFAULT_SETTINGS,
          ...p.settings,
          assists: { ...DEFAULT_SETTINGS.assists, ...p.settings?.assists },
        };
        if ((mergedSettings.carModel as string) === 'street') {
          mergedSettings.carModel = 'roadster';
        }
        return {
          ...current,
          settings: mergedSettings,
          telemetryOpen: mergedSettings.showTelemetry,
          records: { ...EMPTY_RECORDS, ...p.records },
        };
      },
      onRehydrateStorage: () => (state) => {
        if (state?.settings) {
          world.updateSettings(state.settings);
        }
      },
    }
  )
);
