import { Ambience } from './audio/ambience';
import { AIEngineBank } from './audio/aiEngine';
import type { AudioCore, Buses } from './audio/core';
import { PlayerEngine } from './audio/engine';
import { CAMERA_MIX, clamp01 } from './audio/helpers';
import { NoiseBank } from './audio/noise';
import { Sfx } from './audio/sfx';
import { SurfaceLayers } from './audio/surface';
import { createAudioFrame, type AudioFrame } from './audio/types';

/** Static per-bus loudness; the final balance before the master limiter. */
const BUS_LEVEL = { engine: 0.9, ai: 0.85, tyre: 0.75, amb: 1.0, sfx: 1.0, ui: 0.9 } as const;
const PAUSE_DUCK = 0.04;

/**
 * Procedural WebAudio mixer for the whole game. Pure synthesis, no samples.
 *
 *   layers -> buses (engine/ai/tyre/amb/sfx/ui) -> preMaster -> duck (pause) -> limiter -> master (volume/mute) -> out
 *
 * `init()` must run inside a user gesture (RacingGame wires it). Everything else is a safe
 * no-op until then, so callers never need to check readiness. Per-frame input arrives through
 * `update(frame)` (see components/game/AudioBridge.tsx); event cues go through
 * `lib/game/audio/events.ts`.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private core: AudioCore | null = null;
  private master: GainNode | null = null;
  private duck: GainNode | null = null;

  private _player: PlayerEngine | null = null;
  private _surface: SurfaceLayers | null = null;
  private _ai: AIEngineBank | null = null;
  private _ambience: Ambience | null = null;
  private _sfx: Sfx | null = null;

  private enabled = true;
  private volume = 0.75;
  /** The game scene is mounted (false after leaving /game so engines don't drone on). */
  private active = true;
  private paused = false;
  private results = false;

  private prevSparks = 0;
  private wallCooldown = 0;
  private pitTimer = 0;
  private lastFrameRef: AudioFrame = createAudioFrame(0);

  get ready() {
    return !!this.core && this.ctx!.state === 'running';
  }
  get sfx() {
    return this._sfx;
  }
  get ambience() {
    return this._ambience;
  }
  get playerEngine() {
    return this._player;
  }
  get lastFrame() {
    return this.lastFrameRef;
  }
  get context() {
    return this.ctx;
  }

  public init() {
    if (typeof window === 'undefined') return;
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    try {
      const ctx = new Ctor({ latencyHint: 'interactive' });
      this.ctx = ctx;

      const noise = new NoiseBank(ctx);
      const mk = (g: number) => {
        const n = ctx.createGain();
        n.gain.value = g;
        return n;
      };
      const bus: Buses = {
        engine: mk(BUS_LEVEL.engine),
        ai: mk(BUS_LEVEL.ai),
        tyre: mk(BUS_LEVEL.tyre),
        amb: mk(BUS_LEVEL.amb),
        sfx: mk(BUS_LEVEL.sfx),
        ui: mk(BUS_LEVEL.ui),
      };

      const preMaster = mk(1);
      for (const b of Object.values(bus)) b.connect(preMaster);
      const duck = (this.duck = mk(1));
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -14;
      limiter.knee.value = 10;
      limiter.ratio.value = 6;
      limiter.attack.value = 0.004;
      limiter.release.value = 0.2;
      const master = (this.master = mk(0.0001));
      preMaster.connect(duck).connect(limiter).connect(master).connect(ctx.destination);

      const core: AudioCore = { ctx, noise, bus };
      this.core = core;
      this._player = new PlayerEngine(core);
      this._surface = new SurfaceLayers(core);
      this._ai = new AIEngineBank(core);
      this._ambience = new Ambience(core);
      this._sfx = new Sfx(core);

      this.applyMaster(0.4);
      this.applyMix();

      // A hidden tab stops rAF, which would freeze the engine drone: suspend instead.
      document.addEventListener('visibilitychange', this.onVisibility);
    } catch {
      this.ctx = null;
      this.core = null;
    }
  }

  private onVisibility = () => {
    if (!this.ctx) return;
    if (document.hidden) this.ctx.suspend().catch(() => {});
    else this.ctx.resume().catch(() => {});
  };

  private masterTarget() {
    return this.enabled ? Math.pow(this.volume, 1.5) * 0.9 : 0;
  }

  private applyMaster(tc = 0.05) {
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(Math.max(0.0001, this.masterTarget()), this.ctx.currentTime, tc);
  }

  /** Pause ducking, results fade and scene-active gating. */
  private applyMix() {
    if (!this.ctx || !this.core || !this.duck) return;
    const now = this.ctx.currentTime;
    const { bus } = this.core;
    const live = this.active && !this.results ? 1 : 0;
    const scene = this.active ? 1 : 0;
    const tcFast = this.active ? 0.08 : 0.15;
    bus.engine.gain.setTargetAtTime(BUS_LEVEL.engine * live, now, this.results ? 0.5 : tcFast);
    bus.ai.gain.setTargetAtTime(BUS_LEVEL.ai * live, now, this.results ? 0.5 : tcFast);
    bus.tyre.gain.setTargetAtTime(BUS_LEVEL.tyre * live, now, this.results ? 0.4 : tcFast);
    bus.amb.gain.setTargetAtTime(BUS_LEVEL.amb * scene * (this.results ? 0.6 : 1), now, 0.5);
    bus.sfx.gain.setTargetAtTime(BUS_LEVEL.sfx * scene, now, 0.1);
    bus.ui.gain.setTargetAtTime(BUS_LEVEL.ui * scene, now, 0.1);
    this.duck.gain.setTargetAtTime(this.paused ? PAUSE_DUCK : 1, now, this.paused ? 0.12 : 0.25);
  }

  /** Scene mounted/unmounted (AudioBridge). Unmounted fades everything out. */
  public setActive(on: boolean) {
    this.active = on;
    if (on) {
      this._player?.reset();
      this._ai?.reset();
      this.prevSparks = 0;
    }
    this.applyMix();
  }

  /** Per-frame update. Safe before init() and while the context is suspended. */
  public update(f: AudioFrame) {
    this.lastFrameRef = f;
    if (!this.core || !this.ctx || this.ctx.state !== 'running') return;

    if (f.paused !== this.paused || f.results !== this.results) {
      this.paused = f.paused;
      this.results = f.results;
      this.applyMix();
    }

    // Frozen sim while paused: dt = 0 stops crackle/limiter/birds from free-running.
    const dt = f.paused ? 0 : Math.min(0.1, f.dt);
    const mix = CAMERA_MIX[f.camera] ?? CAMERA_MIX.chase;
    const p = f.player;

    this._player!.update(p, dt, mix);
    this._surface!.update(p, dt, mix);
    this._ai!.update(f, dt);
    this._ambience!.update({
      dt,
      idx: p.idx,
      kmh: p.kmh,
      weather: f.weather,
      timeOfDay: f.timeOfDay,
      running: !f.paused,
    });

    // Barrier strike: rising edge of guardRailSparks.
    this.wallCooldown -= dt;
    if (p.sparks > 0.4 && this.prevSparks <= 0.05 && this.wallCooldown <= 0 && !f.paused) {
      this._sfx!.wallHit(clamp01(0.25 + p.kmh / 260));
      this.wallCooldown = 0.35;
    }
    this.prevSparks = p.sparks;

    // Pit limiter beeps.
    if (p.inPit && !f.paused && !f.results) {
      this.pitTimer -= dt;
      if (this.pitTimer <= 0) {
        this._sfx!.pitLimiterTick();
        this.pitTimer = 0.5;
      }
    } else {
      this.pitTimer = 0;
    }
  }

  /** Distance (sim units) from the player to AI car `id` in the latest frame, or Infinity. */
  public distanceToPlayer(id: number): number {
    const f = this.lastFrameRef;
    for (let i = 0; i < f.aiCount; i++) {
      if (f.ai[i].id === id) return Math.hypot(f.ai[i].x - f.player.x, f.ai[i].y - f.player.y);
    }
    return Infinity;
  }

  public toggleAudio(): boolean {
    this.enabled = !this.enabled;
    this.applyMaster(0.1);
    return this.enabled;
  }

  public setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    this.applyMaster(0.05);
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  // --- legacy API (kept so older call sites keep compiling; AudioBridge owns the wiring now) ---

  /** @deprecated engine audio is driven by AudioBridge. */
  public updateEngine(..._args: unknown[]) {}
  /** @deprecated ERS audio is driven by AudioBridge. */
  public updateErs(..._args: unknown[]) {}
  /** @deprecated use events.ts via AudioBridge. */
  public playDrsTone(open: boolean) {
    this._sfx?.drs(open);
  }
  /** @deprecated use events.ts via AudioBridge. */
  public playBiasTick() {
    this._sfx?.biasTick();
  }
  /** @deprecated use events.ts via AudioBridge. */
  public playPitSound() {
    this._sfx?.pitStop();
  }
}

export const audio = new AudioManager();
