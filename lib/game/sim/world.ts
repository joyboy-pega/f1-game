import { DRIVER_ROSTER, MAX_AI_CARS, HW, type DriverProfile, type TyreCompound } from '../constants';
import { DEFAULT_TRACK_ID, isTrackLoaded, setActiveTrack, track } from '../track';
import { NEUTRAL_CONTROLS, type ControlState } from '../controls';
import {
  DEFAULT_SETTINGS,
  formatLapTime,
  type ClassificationRow,
  type GameSettings,
  type HudSnapshot,
  type RacePhase,
  type RaceResults,
  type SectorStatus,
  type TimingRow,
} from '../gameState';
import { createInitialCarState, findNearestTrackPoint, updateCarPhysics, type PhysicsExtras } from '../physics';
import { createBrain, driveAI } from './ai';
import { applyAssists } from './assists';
import { CollisionSystem } from './collisions';
import { FlagsManager } from './flags';
import { WeatherManager } from './weather';
import { updateDrsAvailability, updateSlipstream } from './drs';
import { aiPitStrategy, checkPitEntry, cycleNextCompound, driveInPit, togglePitRequest, type PitContext } from './pit';
import { updateTrackLimits, type LimitsContext } from './penalties';
import { wetnessFor } from './tyres';
import {
  checkJumpStart,
  checkPitSpeeding,
  checkTwoCompoundRule,
  calculateChampionshipPoints,
  compoundToBit,
  EngineerManager,
} from './rules';
import { EventBus } from './events';
import { gaussian, makeRng } from './rng';
import { snapRenderPose } from './interp';
import {
  advanceTiming,
  arcPosition,
  type ArcPos,
  type TimingContext,
  createOverallBests,
  createTiming,
  formatGap,
  gridSlotIndex,
  liveDelta,
  sortRunningOrder,
  sortQualifyingOrder,
  type OverallBests,
} from './race';
import type { WorldCar } from './types';

export const FIXED_DT = 1 / 120;
const MAX_SUBSTEPS = 10;
const GRID_HOLD = 1.0; // seconds on the grid before the first light
const LIGHT_INTERVAL = 1.0;
const POSITION_DEBOUNCE = 0.5;

/** Scratch for makeCar (setup-time only). */
const scratchArc: ArcPos = { s: 0, lateral: 0 };

export function makeCar(id: number, isPlayer: boolean, idx: number, lateral: number, compound: TyreCompound): WorldCar {
  const phys = createInitialCarState(idx, lateral);
  const { s } = arcPosition(phys, scratchArc);
  return {
    id,
    isPlayer,
    driver: { name: '', code: '', team: '', livery: { body: '#fff', accent: '#000', rim: '#ccc', number: 0 } },
    skill: null,
    phys,
    prevX: phys.x,
    prevY: phys.y,
    prevA: phys.a,
    ctrl: { ...NEUTRAL_CONTROLS },
    compound,
    timing: createTiming(s, true),
    ai: null,
    surface: { onTrack: true, gravel: false, dist: Math.abs(lateral) },
    lateral,
    inPit: false,
    drsAvailable: false,
    pitRequest: false,
    nextCompound: compound === 'soft' ? 'medium' : 'soft',
    position: 1,
    stats: { topSpeedKmh: 0, drsUses: 0, ersUses: 0, overtakes: 0 },
    pit: null,
    damage: 0,
    fuelKg: 10,
    lastCollisionTime: -99,
    draft: 0,
    limits: { offTime: 0, counted: false, lastCornerId: -1, exempt: false, cutStartS: -1, cutStartTime: -1 },
    blueFlag: false,
    blueFlagTime: 0,
    drsDetect: { lastG: -1, zoneActive: -1 },
    offTrackTime: 0,
    jumpStart: false,
    compoundsUsedMask: compoundToBit(compound),
    engineMode: 'standard',
    ersMode: 'balanced',
    pitSpeedingPenalized: false,
  };
}

export class GameWorld {
  cars: WorldCar[] = [];
  player!: WorldCar;
  order: WorldCar[] = [];
  settings: GameSettings = DEFAULT_SETTINGS;
  isQualifying = false;
  qualifyingFormat: 'oneshot' | 'short' = 'oneshot';
  qualifyingTimeRemaining = 720;
  qualifyingCompleteEmitted = false;
  phase: RacePhase = 'grid';
  phaseTime = 0;
  raceTime = 0;
  lightsLit = 0;
  paused = false;
  /** Increments on every setup() so renderers can rebuild per-car objects. */
  raceId = 0;
  /** Fraction of a fixed step left in the accumulator after the last step() (0..1); drives render interpolation. */
  alpha = 0;
  chequered = false;
  finishCount = 0;
  overall: OverallBests = createOverallBests();
  readonly events = new EventBus();
  readonly flags = new FlagsManager();
  readonly weather = new WeatherManager();
  readonly engineer = new EngineerManager();
  /** Set before setup() to make a race reproducible (tests); null = random. */
  seed: number | null = null;
  /** Replaced by a seeded generator in setup(); the constructor runs setup() before anything can read it. */
  rand: () => number = makeRng(0);

  private collisions = new CollisionSystem();
  // Reused every fixed step so the hot loop allocates nothing (R7). Filled in place before each use.
  private readonly arc: ArcPos = { s: 0, lateral: 0 };
  private readonly extras: PhysicsExtras = {};
  private readonly timingCtx: TimingContext = {
    raceTime: 0,
    dt: FIXED_DT,
    standingStart: false,
    overall: createOverallBests(),
    events: this.events,
  };
  private readonly limitsCtx: LimitsContext = { raceTime: 0, dt: FIXED_DT, events: this.events, enabled: false };
  private acc = 0;
  private pendingDrs = false;
  private pendingBiasUp = false;
  private pendingBiasDown = false;
  private pendingPit = false;
  private pendingReset = false;
  private pendingCompound = false;
  private lightsHold = 1.2;
  private shownPosition = 1;
  private candidatePosition = 1;
  private candidateTime = 0;

  constructor() {
    this.setup(DEFAULT_SETTINGS);
  }

  get isRace() {
    return this.settings.mode === 'race';
  }

  updateSettings(patch: Partial<GameSettings>) {
    this.settings = { ...this.settings, ...patch };
  }

  setup(settings: GameSettings) {
    this.settings = settings;
    // Everything below (grid, cars, timing) is built against the active track, so switch it first.
    // (A lazy track must have been loaded with ensureTrack first; otherwise fall back to the default.)
    setActiveTrack(isTrackLoaded(settings.trackId) ? settings.trackId : DEFAULT_TRACK_ID);
    // The ONLY Math.random in sim code (R6): picks a fresh seed when the caller did not supply one.
    this.rand = makeRng(this.seed ?? Math.floor(Math.random() * 4294967296));
    this.raceId++;
    this.events.clear();
    this.overall = createOverallBests();
    this.phaseTime = 0;
    this.raceTime = 0;
    this.lightsLit = 0;
    this.lightsHold = 0.6 + this.rand() * 1.6;
    this.chequered = false;
    this.finishCount = 0;
    this.acc = 0;
    this.clearPending();
    this.paused = false;
    this.collisions.reset();
    this.flags.reset();
    this.engineer.reset();
    this.weather.reset(!!settings.dynamicWeather || settings.weather === 'dynamic', settings.weather, this.seed ?? 42);

    this.isQualifying = settings.mode === 'qualifying';
    this.qualifyingFormat = settings.qualifyingFormat || 'oneshot';
    this.qualifyingTimeRemaining = this.qualifyingFormat === 'short' ? 720 : 180;
    this.qualifyingCompleteEmitted = false;

    const race = this.isRace;
    const qualifying = this.isQualifying;
    const isMultiCar = race || qualifying;
    const aiCount = isMultiCar ? Math.max(0, Math.min(MAX_AI_CARS, settings.aiCount)) : 0;
    const carCount = aiCount + 1;

    let playerSlot = 0;
    let grid: DriverProfile[] = [];

    if (race && settings.qualifyingGrid && settings.qualifyingGrid.length > 0) {
      // Set grid from qualifying results (PLAN-v3 §8 R2)
      const qGrid = settings.qualifyingGrid;
      const playerPos = qGrid.indexOf('player');
      playerSlot = playerPos >= 0 ? Math.min(carCount - 1, playerPos) : Math.max(0, Math.min(carCount - 1, settings.gridPosition - 1));

      const aiDrivers = qGrid.filter((id) => id !== 'player');
      for (const code of aiDrivers) {
        const found = DRIVER_ROSTER.find((d) => d.code === code || d.id === code);
        if (found && grid.length < aiCount) grid.push(found);
      }
      if (grid.length < aiCount) {
        for (const d of DRIVER_ROSTER) {
          if (!grid.includes(d) && grid.length < aiCount) grid.push(d);
        }
      }
    } else if (race) {
      playerSlot = Math.max(0, Math.min(carCount - 1, settings.gridPosition - 1));
      // "Qualifying": the fastest drivers usually, but not always, start at the front.
      grid = DRIVER_ROSTER.slice(0, aiCount)
        .map((d) => ({ d, key: d.skill.pace + gaussian(this.rand) * 0.03 }))
        .sort((a, b) => b.key - a.key)
        .map((e) => e.d);
    } else if (qualifying) {
      playerSlot = 0;
      grid = DRIVER_ROSTER.slice(0, aiCount);
    }

    const cars: WorldCar[] = [];
    let aiIdx = 0;
    for (let slot = 0; slot < carCount; slot++) {
      const isPlayer = slot === playerSlot;
      // Staggered 2-wide grid; solo modes start further back for a rolling out-lap
      let idx: number;
      let lateral = 0;
      if (race) {
        idx = gridSlotIndex(slot);
        const hw = track.current.halfWidth[idx];
        lateral = (slot % 2 === 0 ? -1 : 1) * hw * 0.42;
      } else if (qualifying) {
        const spread = Math.floor(track.current.N / Math.max(1, carCount));
        idx = (track.current.N - 80 - slot * spread + track.current.N * 4) % track.current.N;
      } else {
        idx = (track.current.N - 80) % track.current.N;
      }

      const compound: TyreCompound = isPlayer ? settings.startCompound : qualifying ? 'soft' : aiIdx % 3 === 2 ? 'medium' : 'soft';
      const car = makeCar(cars.length, isPlayer, idx, lateral, compound);
      car.fuelKg = race ? Math.min(105, settings.totalLaps * 1.8 + 2.0) : qualifying ? 12 : 10;
      if (!race) {
        car.phys.vf = 550; // ~198 km/h rolling approach
        car.phys.kmh = 198;
        car.phys.gear = 6;
        car.phys.rpm = 10500;
      }
      if (isPlayer) {
        car.driver = { name: settings.driverName, code: settings.driverCode, team: 'Player', livery: settings.livery };
      } else {
        const d = grid[aiIdx++];
        car.driver = { name: d.name, code: d.code, team: d.team, livery: d.livery };
        car.skill = d.skill;
        car.ai = createBrain(slot, Math.floor(this.rand() * 4294967296));
      }
      car.position = slot + 1;
      cars.push(car);
    }

    this.cars = cars;
    this.player = cars[playerSlot];
    if (settings.setup) {
      this.player.phys.brakeBias = settings.setup.brakeBias / 100;
    }
    this.order = [...cars];
    this.shownPosition = this.candidatePosition = playerSlot + 1;
    this.candidateTime = 0;

    if (race) {
      this.phase = 'grid';
    } else {
      this.phase = 'racing';
    }
  }

  /**
   * Advance by one rendered frame. Splits into fixed steps; edge-triggered requests apply on the first step only.
   * A frame can run zero steps (refresh rate above 120 Hz), so triggers are latched in `pending*` until a step
   * actually consumes them; otherwise those presses would be lost.
   */
  step(frameDt: number, input: ControlState) {
    if (this.paused) {
      this.clearPending();
      return;
    }
    this.latchTriggers(input);
    this.acc = Math.min(this.acc + frameDt, FIXED_DT * MAX_SUBSTEPS);
    let first = true;
    while (this.acc >= FIXED_DT) {
      this.acc -= FIXED_DT;
      const c = this.player.ctrl;
      Object.assign(c, input);
      c.drsToggleRequested = first && this.pendingDrs;
      c.brakeBiasUp = first && this.pendingBiasUp;
      c.brakeBiasDown = first && this.pendingBiasDown;
      c.pitStopRequested = first && this.pendingPit;
      c.resetRequested = first && this.pendingReset;
      c.compoundCycleRequested = first && this.pendingCompound;
      if (first) this.clearPending();
      first = false;
      this.fixedStep(FIXED_DT);
    }
    this.alpha = this.acc / FIXED_DT;
  }

  private latchTriggers(input: ControlState) {
    this.pendingDrs ||= input.drsToggleRequested;
    this.pendingBiasUp ||= input.brakeBiasUp;
    this.pendingBiasDown ||= input.brakeBiasDown;
    this.pendingPit ||= input.pitStopRequested;
    this.pendingReset ||= input.resetRequested;
    this.pendingCompound ||= input.compoundCycleRequested;
  }

  private clearPending() {
    this.pendingDrs = this.pendingBiasUp = this.pendingBiasDown = false;
    this.pendingPit = this.pendingReset = this.pendingCompound = false;
  }

  private fixedStep(dt: number) {
    this.phaseTime += dt;

    if (this.phase === 'grid' || this.phase === 'lights') {
      this.updateStart(dt);
      return;
    }

    this.raceTime += dt;
    const s = this.settings;
    const pl = this.player;
    const pc = pl.ctrl;
    this.weather.update(dt, this.cars, this.events, this.raceTime);
    const baseWetness = wetnessFor(s.weather);
    const trackWetness = this.weather.getTrackWetness(baseWetness);

    if (pc.resetRequested && !pl.pit) this.resetPlayer();
    if (pc.pitStopRequested && !pl.pit && !pl.timing.finished) {
      togglePitRequest(pl);
      this.events.emit({ type: 'pitPlan', carId: pl.id, box: pl.pitRequest, compound: pl.nextCompound });
    }
    if (pc.compoundCycleRequested && !pl.pit) {
      cycleNextCompound(pl);
      this.events.emit({ type: 'pitPlan', carId: pl.id, box: pl.pitRequest, compound: pl.nextCompound });
    }

    const effWeather = this.weather.isDynamic ? (trackWetness > 0.4 ? 'rain' : trackWetness > 0.1 ? 'cloudy' : 'sunny') : s.weather;
    const aiCtx = {
      cars: this.cars,
      difficulty: s.difficulty,
      raceTime: this.raceTime,
      weather: effWeather,
      isRace: this.isRace,
      flags: {
        scMode: this.flags.state.scMode,
        sectorYellow: this.flags.state.sectorYellow,
      },
    };
    const pitCtx: PitContext = {
      cars: this.cars,
      raceTime: this.raceTime,
      events: this.events,
      rand: this.rand,
      wetness: trackWetness,
      isRace: this.isRace,
      totalLaps: s.totalLaps,
    };
    const strategyTick = Math.floor(this.raceTime) !== Math.floor(this.raceTime - dt);

    updateSlipstream(this.cars, dt);

    const tctx = this.timingCtx;
    tctx.raceTime = this.raceTime;
    tctx.dt = dt;
    tctx.standingStart = this.isRace;
    tctx.overall = this.overall;

    for (const car of this.cars) {
      const p = car.phys;
      const idxBefore = p.idx;
      car.prevX = p.x;
      car.prevY = p.y;
      car.prevA = p.a;

      // Who is driving: pit-lane controller, AI, or the human (with optional assists)
      if (car.pit) {
        driveInPit(car, pitCtx, dt);
        checkPitSpeeding(car, this.events);
      } else if (car.ai) {
        if (strategyTick && !car.isPlayer) aiPitStrategy(car, pitCtx);
        driveAI(car, aiCtx, dt);
      } else if (car.isPlayer && s.assists) applyAssists(car, s.assists, effWeather);

      const wasDrs = p.drsOpen;
      const wasErs = p.isBoosting;
      const biasBefore = p.brakeBias;

      const extras = this.extras;
      extras.compound = car.compound;
      extras.wetness = this.weather.getCarWetness(car, trackWetness);
      extras.drsAvailable = car.drsAvailable;
      extras.draft = car.draft;
      extras.inPit = !!car.pit;
      extras.frontDamage = car.damage;
      extras.aeroPreset = car.isPlayer ? this.settings.setup?.aeroPreset : undefined;
      extras.regulations = this.settings.regulations;

      if (car.fuelKg > 0) {
        const deltaFuel = (0.0015 + 0.0263 * Math.max(0, car.ctrl.throttle)) * dt;
        car.fuelKg = Math.max(0, car.fuelKg - deltaFuel);
      }
      extras.fuelKg = car.fuelKg;
      const r = car.isPlayer
        ? updateCarPhysics(p, car.ctrl, dt, s.weather, s.steeringSensitivity, s.brakeForce, s.tireWearRate, extras)
        : updateCarPhysics(p, car.ctrl, dt, s.weather, 1, 1, s.tireWearRate, extras);
      car.surface.onTrack = r.onTrack;
      car.surface.gravel = r.gravel;
      car.surface.dist = r.nearestDist;
      if (!r.onTrack) car.offTrackTime += dt;

      if (p.drsOpen && !wasDrs) car.stats.drsUses++;
      if (p.isBoosting && !wasErs) car.stats.ersUses++;
      if (p.kmh > car.stats.topSpeedKmh) car.stats.topSpeedKmh = p.kmh;
      if (car.isPlayer) {
        if (p.drsOpen !== wasDrs) this.events.emit({ type: 'drs', carId: car.id, open: p.drsOpen, reason: r.drsClosedReason });
        if (p.isBoosting !== wasErs) this.events.emit({ type: 'ers', carId: car.id, active: p.isBoosting });
        if (p.brakeBias !== biasBefore) this.events.emit({ type: 'bias', carId: car.id, bias: p.brakeBias });
      }

      const arc = arcPosition(p, this.arc);
      car.lateral = arc.lateral;
      const res = advanceTiming(car, arc.s, tctx);
      if (res.lapCompleted && this.isRace && !car.timing.finished) {
        if (car.timing.lapsCompleted >= s.totalLaps || this.chequered) this.finishCar(car, res.crossTime);
      }

      checkPitEntry(car, idxBefore, pitCtx);
    }

    if (this.isRace && this.phase === 'racing') {
      this.engineer.update(this.player, this.cars, this.events, dt);
    }

    // Car-to-car contact, then judge track limits on the corrected positions
    this.collisions.resolve(this.cars, this.raceTime, this.events, s.damage);
    const lctx = this.limitsCtx;
    lctx.raceTime = this.raceTime;
    lctx.dt = dt;
    lctx.enabled = true;
    for (const car of this.cars) updateTrackLimits(car, lctx);

    this.updateOrder(dt);
    this.flags.update(dt, this.cars, this.events, this.raceTime, this.isRace, this.phase);
    updateDrsAvailability(this.cars, {
      isRace: this.isRace && this.flags.state.scMode === 'none',
      order: this.order,
    });

    if (this.isQualifying && !this.qualifyingCompleteEmitted) {
      if (this.qualifyingFormat === 'oneshot') {
        if (this.player.timing.lapsCompleted >= 1 || this.player.timing.finished) {
          this.qualifyingCompleteEmitted = true;
          this.phase = 'finished';
          const gridOrder = this.order.map((c) => (c.isPlayer ? 'player' : c.driver.code));
          this.events.emit({ type: 'qualifyingComplete', grid: gridOrder });
        }
      } else if (this.qualifyingFormat === 'short') {
        this.qualifyingTimeRemaining -= dt;
        if (this.qualifyingTimeRemaining <= 0) {
          this.qualifyingCompleteEmitted = true;
          this.phase = 'finished';
          const gridOrder = this.order.map((c) => (c.isPlayer ? 'player' : c.driver.code));
          this.events.emit({ type: 'qualifyingComplete', grid: gridOrder });
        }
      }
    }
  }

  private updateStart(dt: number) {
    if (this.isRace) {
      checkJumpStart(this.player, this.phase, this.events);
    }

    // Cars are held on the grid; engines can still be revved.
    for (const car of this.cars) {
      const p = car.phys;
      const throttle = car.isPlayer ? car.ctrl.throttle : 0.25 + 0.2 * Math.sin(this.phaseTime * 3 + car.id);
      p.rpm += (4000 + throttle * 7500 - p.rpm) * Math.min(1, 10 * dt);
      p.gear = 'N';
    }
    if (this.phase === 'grid') {
      if (this.phaseTime >= GRID_HOLD) {
        this.phase = 'lights';
        this.phaseTime = 0;
      }
      return;
    }
    const lit = Math.min(5, Math.floor(this.phaseTime / LIGHT_INTERVAL) + 1);
    if (lit !== this.lightsLit && this.phaseTime < 5 * LIGHT_INTERVAL) {
      this.lightsLit = lit;
      this.events.emit({ type: 'lightsOn', count: lit });
    }
    if (this.phaseTime >= 5 * LIGHT_INTERVAL + this.lightsHold) {
      this.lightsLit = 0;
      this.phase = 'racing';
      this.phaseTime = 0;
      this.raceTime = 0;
      for (const car of this.cars) {
        car.timing.lapStartTime = 0;
        car.timing.sectorStartTime = null;
      }
      this.events.emit({ type: 'lightsOut' });
    }
  }

  private finishCar(car: WorldCar, at: number) {
    car.timing.finished = true;
    car.timing.finishTime = at;
    const baseWetness = wetnessFor(this.settings.weather);
    const isDry = this.settings.weather !== 'rain' && this.settings.weather !== 'dynamic' && this.weather.getTrackWetness(baseWetness) < 0.1;
    checkTwoCompoundRule(car, this.settings.totalLaps, isDry, this.events);
    this.finishCount++;
    if (!this.chequered) {
      this.chequered = true;
      this.events.emit({ type: 'chequered' });
    }
    this.events.emit({ type: 'finish', carId: car.id, position: this.finishCount });
    if (car.isPlayer) this.phase = 'finished';
  }

  private updateOrder(dt: number) {
    if (this.isQualifying) {
      sortQualifyingOrder(this.order);
    } else {
      sortRunningOrder(this.order);
    }
    for (let i = 0; i < this.order.length; i++) this.order[i].position = i + 1;
    const pos = this.player.position;
    if (pos !== this.candidatePosition) {
      this.candidatePosition = pos;
      this.candidateTime = 0;
    } else if (pos !== this.shownPosition) {
      this.candidateTime += dt;
      if (this.candidateTime >= POSITION_DEBOUNCE) {
        if (pos < this.shownPosition) this.player.stats.overtakes += this.shownPosition - pos;
        this.events.emit({ type: 'positionChange', carId: this.player.id, from: this.shownPosition, to: pos });
        this.shownPosition = pos;
      }
    }
  }

  /** Put the player back on the centreline at the nearest point, stationary. */
  resetPlayer() {
    const p = this.player.phys;
    const [ni] = findNearestTrackPoint(p.x, p.y, p.idx);
    const fresh = createInitialCarState(ni, 0);
    p.x = fresh.x;
    p.y = fresh.y;
    p.a = fresh.a;
    p.vx = p.vy = p.vf = p.vl = 0;
    p.idx = ni;
    p.isDrifting = false;
    p.driftIntensity = 0;
    p.drsOpen = false;
    snapRenderPose(this.player);
    this.events.emit({ type: 'reset', carId: this.player.id });
  }

  // ---------------------------------------------------------------- snapshots

  buildHud(): HudSnapshot {
    const pl = this.player;
    const t = pl.timing;
    const leader = this.order[0];
    const totalLaps = this.isRace ? this.settings.totalLaps : Math.max(1, t.lapsCompleted + 1);

    const sectors = [0, 1, 2].map((k) => {
      const time = t.sectorTimes[k];
      if (time === null) return { time: null, status: 'none' as SectorStatus };
      const ob = this.overall.bestSectors[k];
      const pb = t.bestSectors[k];
      const status: SectorStatus = ob !== null && time <= ob ? 'overall' : pb !== null && time <= pb ? 'personal' : 'slower';
      return { time, status };
    });

    const order: TimingRow[] = this.order.map((c, i) => ({
      position: i + 1,
      carId: c.id,
      code: c.driver.code,
      name: c.driver.name,
      team: c.driver.team,
      color: c.driver.livery.body,
      isPlayer: c.isPlayer,
      gapToLeader: i === 0 ? 'LEADER' : formatGap(c.timing, leader.timing),
      interval: i === 0 ? '' : formatGap(c.timing, this.order[i - 1].timing),
      lap: Math.max(1, c.timing.lapsCompleted + 1),
      bestLap: c.timing.bestLap,
      lastLap: c.timing.lastLap,
      compound: c.compound,
      inPit: c.inPit,
      finished: c.timing.finished,
      penaltySec: c.timing.penaltySec,
    }));

    return {
      lap: Math.max(1, Math.min(totalLaps, t.lapsCompleted + 1)),
      totalLaps,
      position: pl.position,
      carCount: this.cars.length,
      raceTime: this.raceTime,
      currentLapTime: t.lapStartTime !== null && this.phase !== 'grid' && this.phase !== 'lights' ? this.raceTime - t.lapStartTime : 0,
      lastLap: t.lastLap,
      bestLap: t.bestLap,
      deltaToBest: liveDelta(t),
      sectors,
      currentSector: t.currentSector,
      order,
      penaltySec: t.penaltySec,
      trackLimitWarnings: t.trackLimitWarnings,
      compound: pl.compound,
      drsAvailable: pl.drsAvailable,
      boxRequested: pl.pitRequest,
      nextCompound: pl.nextCompound,
      inPitLane: pl.inPit,
      tyreWear: pl.phys.tires.avgWear,
    };
  }

  buildResults(): RaceResults {
    const finished = this.cars
      .filter((c) => c.timing.finished)
      .sort((a, b) => (a.timing.finishTime! + a.timing.penaltySec) - (b.timing.finishTime! + b.timing.penaltySec));
    const running = this.order.filter((c) => !c.timing.finished);
    const ordered = [...finished, ...running];
    const winner = finished[0];
    const winnerTime = winner ? winner.timing.finishTime! + winner.timing.penaltySec : null;

    const pointsMap = calculateChampionshipPoints(ordered, this.overall.bestLapCarId ?? undefined);

    const classification: ClassificationRow[] = ordered.map((c, i) => {
      const total = c.timing.finished ? c.timing.finishTime! + c.timing.penaltySec : null;
      let gapText: string;
      if (i === 0 && total !== null) gapText = formatLapTime(total);
      else if (total !== null && winnerTime !== null) gapText = `+${(total - winnerTime).toFixed(3)}`;
      else gapText = winner ? formatGap(c.timing, winner.timing) : 'DNF';
      return {
        position: i + 1,
        carId: c.id,
        code: c.driver.code,
        name: c.driver.name,
        team: c.driver.team,
        color: c.driver.livery.body,
        isPlayer: c.isPlayer,
        totalTime: total,
        gapText,
        bestLap: c.timing.bestLap,
        laps: Math.max(0, c.timing.lapsCompleted),
        pitStops: c.timing.pitStops,
        penaltySec: c.timing.penaltySec,
        points: pointsMap.get(c.id) ?? 0,
      };
    });

    const fl = this.overall.bestLapCarId !== null ? this.cars[this.overall.bestLapCarId] : null;
    const pl = this.player;
    return {
      mode: this.settings.mode,
      classification,
      playerPosition: classification.find((r) => r.isPlayer)?.position ?? pl.position,
      playerLapTimes: [...pl.timing.lapTimes],
      fastestLap: fl && this.overall.bestLap !== null ? { carId: fl.id, code: fl.driver.code, time: this.overall.bestLap } : null,
      topSpeed: pl.stats.topSpeedKmh,
      overtakes: pl.stats.overtakes,
      drsUses: pl.stats.drsUses,
      ersUses: pl.stats.ersUses,
      totalTime: pl.timing.finishTime ?? this.raceTime,
    };
  }
}

export const world = new GameWorld();

