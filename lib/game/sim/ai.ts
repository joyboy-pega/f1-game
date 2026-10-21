import {
  N,
  HW,
  TRACK_LENGTH,
  PIT_LANE,
  normals,
  trackSplinePoints,
  type Difficulty,
  type WeatherType,
} from '../constants';
import { isCarInDrsZone } from '../physics';
import { makeRng } from './rng';
import type { WorldCar, AIBrain } from './types';
import {
  lineOffset,
  lineX,
  lineY,
  lineHeading,
  lineCurv,
  lineSeg,
  lineCornerSpeed,
  PROFILE_BRAKE_DECEL,
} from './racingLine';

// Racing-line AI driver. It produces a ControlState so AI cars run through the exact same physics
// as the player: pure-pursuit steering on the optimal line, a braking-point speed scan from the line's
// corner limits, traffic awareness (follow / overtake / defend), driver errors, DRS and ERS.

export const CORNER_SAFETY = 0.92;
const SPEED_CAP = 840; // straight-line target cap before pace scaling

interface DifficultyTuning {
  pace: number;
  mistakes: number;
  ers: number;
  aggression: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultyTuning> = {
  rookie: { pace: 0.915, mistakes: 2.6, ers: 0.4, aggression: 0.6 },
  pro: { pace: 1.0, mistakes: 1.0, ers: 0.85, aggression: 1.0 },
  legend: { pace: 1.085, mistakes: 0.45, ers: 1.0, aggression: 1.15 },
};

export interface AIContext {
  cars: WorldCar[];
  difficulty: Difficulty;
  raceTime: number;
  weather: WeatherType;
  isRace: boolean;
}

const WEATHER_GRIP: Record<WeatherType, number> = { sunny: 1, cloudy: 0.95, rain: 0.65, snow: 0.35 };

const CAR_R = 8.6;
const PASS_GAP = 2 * CAR_R + 10; // lateral distance kept while passing
const MAX_LAT = HW - 11;
const SHIFT_RATE = 48; // lateral units/s
const STEER_K_E = 1.6;
const STEER_K_H = 3.5;

export function createBrain(slot: number, seed: number = slot * 7919 + 17): AIBrain {
  const rng = makeRng(seed);
  return {
    wearLimit: 0.55 + rng() * 0.1,
    plannedStopFrac: 0.4 + rng() * 0.2,
    lastStopLap: 0,
    lane: 0,
    targetSpeed: 0,
    noisePhase: slot * 1.7,
    rng,
    shift: 0,
    passSide: 0,
    passStart: 0,
    decisionTimer: 0,
    defendUntil: 0,
    defendCooldown: 0,
    defendShift: 0,
    mistakeKind: 0,
    mistakeUntil: 0,
    mistakeShift: 0,
    wasBraking: false,
    ersOn: false,
    stuckTime: 0,
    prevOffsetTarget: 0,
    passCarId: -1,
  };
}

/** Signed arc distance from a to b along the lap, in (-L/2, L/2]. */
export function arcDelta(a: number, b: number): number {
  let d = b - a;
  if (d > TRACK_LENGTH / 2) d -= TRACK_LENGTH;
  else if (d < -TRACK_LENGTH / 2) d += TRACK_LENGTH;
  return d;
}

const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);

/** Grip-driven scale for cornering speed (worn / cold / wrong tyres, rain). */
export function gripSpeedFactor(car: WorldCar, weather: WeatherType): number {
  const g = car.phys.tires.frontGrip * WEATHER_GRIP[weather];
  return clamp(Math.pow(g, 0.9), 0.3, 1.1);
}

/** Marshals put a car that is stuck back on the racing line. */
export function respawnOnLine(car: WorldCar, speed = 120) {
  const p = car.phys;
  const i = (p.idx + 4) % N;
  p.x = lineX[i];
  p.y = lineY[i];
  p.a = lineHeading[i];
  p.vf = speed;
  p.vl = 0;
  p.vx = Math.cos(p.a) * speed;
  p.vy = Math.sin(p.a) * speed;
  p.idx = i;
  p.isDrifting = false;
  p.driftIntensity = 0;
  p.drsOpen = false;
}

/** Distance (spline indices) to the next sizeable corner on the racing line, and its direction. */
function nextCorner(idx: number, maxIdx: number): { dist: number; dir: number } {
  for (let k = 4; k < maxIdx; k += 2) {
    const c = lineCurv[(idx + k) % N];
    if (Math.abs(c) > 0.0028) return { dist: k, dir: c > 0 ? 1 : -1 };
  }
  return { dist: -1, dir: 0 };
}

/**
 * Steering command (-1..1) to track the racing line shifted laterally by `shift`: curvature
 * feed-forward plus Stanley-style cross-track and heading feedback.
 */
export function lineSteer(car: WorldCar, shift: number): number {
  const p = car.phys;
  const idx = p.idx;
  const v = Math.max(0, p.vf);
  const ahd = Math.min(6, 1 + Math.round((v * 0.07) / 24));
  const kappa = lineCurv[(idx + ahd) % N];
  const e = car.lateral - (lineOffset[idx] + shift);
  const velAng = v > 40 ? Math.atan2(p.vy, p.vx) : p.a;
  const wantAng = lineHeading[idx] - Math.atan2(STEER_K_E * e, v + 40);
  let herr = wantAng - velAng;
  herr = Math.atan2(Math.sin(herr), Math.cos(herr));
  const yawCmd = v * kappa + STEER_K_H * herr;
  const vv = Math.max(v, 60);
  const yawPerSteer = (2.6 * Math.max(0.3, p.tires.frontGrip) * Math.min(vv / 220, 1)) / (1 + vv / 620);
  return clamp(yawCmd / yawPerSteer, -1, 1);
}

/** Highest speed allowed here such that every corner ahead can still be taken (braking-point scan). */
export function profileTarget(idx: number, pace: number, gripF: number, aBrake: number): number {
  const cap = SPEED_CAP * pace;
  let target = cap;
  let d = 0;
  for (let k = 0; k < 40; k++) {
    const i = (idx + k) % N;
    const vc = Math.min(cap, lineCornerSpeed[i] * CORNER_SAFETY * pace * gripF);
    const allowed = Math.sqrt(vc * vc + 2 * aBrake * d);
    if (allowed < target) target = allowed;
    d += lineSeg[i];
    if (d > 1000) break;
  }
  return target;
}

export function driveAI(car: WorldCar, ctx: AIContext, dt: number): void {
  const brain = car.ai;
  const skill = car.skill;
  if (!brain || !skill) return;
  const p = car.phys;
  const ctrl = car.ctrl;
  const t = ctx.raceTime;
  const idx = p.idx;
  const v = Math.max(0, p.vf);
  const tun = DIFFICULTY[ctx.difficulty];
  const rng = brain.rng;
  const aggression = clamp(skill.aggression * tun.aggression, 0, 1);

  const skillPace = 1 + (skill.pace - 0.96) * 0.45;
  const wobble = 1 + (1 - skill.consistency) * 0.03 * Math.sin(t * 0.45 + brain.noisePhase);
  const pace = tun.pace * skillPace * wobble;
  const gripF = gripSpeedFactor(car, ctx.weather);

  const myS = car.timing.lastS;
  const baseOff = lineOffset[idx];
  const planned = baseOff + brain.shift;

  // ---- neighbours ---------------------------------------------------------------------------
  let ahead: WorldCar | null = null;
  let aheadGap = 1e9;
  let attacker: WorldCar | null = null;
  let attackerGap = -1e9;
  let hasNeighbour = false;
  let lowBound = -MAX_LAT;
  let highBound = MAX_LAT;
  for (let n = 0; n < ctx.cars.length; n++) {
    const o = ctx.cars[n];
    if (o === car || !!o.pit !== !!car.pit) continue;
    const ds = arcDelta(myS, o.timing.lastS);
    const dl = o.lateral - planned;
    // Compare current and intended lines: cars on converging paths count as being in the way
    const oPlan = o.ai ? lineOffset[o.phys.idx] + o.ai.shift : o.lateral;
    const overlap = Math.min(Math.abs(dl), Math.abs(o.lateral - car.lateral), Math.abs(oPlan - planned), Math.abs(oPlan - car.lateral));
    if (ds > 0 && ds < 700 && ds < aheadGap && overlap < 22) {
      ahead = o;
      aheadGap = ds;
    }
    if (ds < -15 && ds > -190 && ds > attackerGap) {
      attacker = o;
      attackerGap = ds;
    }
    if (ds > -44 && ds < 44) {
      hasNeighbour = true;
      const gap = 2 * CAR_R + 3;
      if (o.lateral > car.lateral) highBound = Math.min(highBound, o.lateral - gap);
      else lowBound = Math.max(lowBound, o.lateral + gap);
    }
  }

  // ---- driver errors ------------------------------------------------------------------------
  if (brain.mistakeKind !== 0 && t > brain.mistakeUntil) brain.mistakeKind = 0;

  // ---- lateral intent ---------------------------------------------------------------------
  let shiftTarget = 0;
  const curvHere = Math.abs(lineCurv[idx]);

  const nc = nextCorner(idx, 16);
  const cornerSoon = curvHere > 0.0035 || nc.dist > 0 || brain.targetSpeed < v - 20;

  // end of an overtake
  if (brain.passSide !== 0) {
    const pc = ctx.cars[brain.passCarId as number] as WorldCar | undefined;
    const pds = pc ? arcDelta(myS, pc.timing.lastS) : -999;
    if (!pc || pds < -75 || t - brain.passStart > 9 || !!pc.pit !== !!car.pit || (cornerSoon && pds > 15)) {
      brain.passSide = 0;
    } else {
      shiftTarget = clamp(pc.lateral + brain.passSide * PASS_GAP, -MAX_LAT, MAX_LAT) - baseOff;
    }
  }

  // freeSpeed is evaluated below; decisions use last step's target
  brain.decisionTimer -= dt;
  if (ahead && brain.passSide === 0 && brain.decisionTimer <= 0 && ctx.isRace && t > 10 && !cornerSoon) {
    brain.decisionTimer = 0.35;
    const held = aheadGap < 260 && aheadGap > 30 && brain.targetSpeed > ahead.phys.vf + 6;
    if (held && rng() < 0.2 + 0.8 * aggression) {
      const corner = nextCorner(idx, 30);
      let best: -1 | 1 = 1;
      let bestScore = -1e9;
      for (const side of [-1, 1] as const) {
        const tgt = ahead.lateral + side * PASS_GAP;
        if (Math.abs(tgt) > MAX_LAT) continue;
        if (side === 1 ? tgt > highBound - 1 : tgt < lowBound + 1) continue;
        let score = -Math.abs(tgt) * 0.02;
        if (corner.dir === side) score += 3;
        if (side === Math.sign(ahead.lateral - baseOff) * -1) score += 1;
        if (score > bestScore) {
          bestScore = score;
          best = side;
        }
      }
      if (bestScore > -1e8) {
        brain.passSide = best;
        brain.passStart = t;
        brain.passCarId = ahead.id;
        shiftTarget = clamp(ahead.lateral + best * PASS_GAP, -MAX_LAT, MAX_LAT) - baseOff;
      }
    }
  }

  // defending: cover the attacker's side once, then go back to the line
  if (ctx.isRace && brain.passSide === 0 && attacker && aggression > 0.5 && t > brain.defendCooldown && curvHere < 0.003) {
    const closing = attacker.phys.vf > v - 4;
    if (closing && attackerGap > -150 && Math.abs(attacker.lateral - car.lateral) > 5 && Math.abs(attacker.lateral) < MAX_LAT) {
      brain.defendUntil = t + 1.0;
      brain.defendCooldown = t + 5 + rng() * 4;
      brain.defendShift = clamp(attacker.lateral, -MAX_LAT, MAX_LAT) - baseOff;
    }
  }
  if (t < brain.defendUntil) shiftTarget = brain.defendShift;
  // in a corner everybody uses the line unless a car is alongside
  if (curvHere > 0.0035 && !hasNeighbour && brain.mistakeKind !== 2) shiftTarget = 0;

  if (brain.mistakeKind === 2) shiftTarget += brain.mistakeShift;

  // heading to the pits: move to the pit-lane side before the entry
  if (car.pitRequest) {
    const du = (PIT_LANE.entryIdx - idx + N) % N;
    if (du <= 55) {
      const f = 1 - du / 55;
      const s = f * f * (3 - 2 * f);
      shiftTarget = (PIT_LANE.side * (HW - 18) - baseOff) * s;
    }
  }

  // never squeeze a car alongside
  const finalAbs = clamp(baseOff + shiftTarget, Math.max(-MAX_LAT, lowBound), Math.min(MAX_LAT, highBound));
  shiftTarget = lowBound > highBound ? car.lateral - baseOff : finalAbs - baseOff;
  const dShift = shiftTarget - brain.shift;
  brain.shift += clamp(dShift, -SHIFT_RATE * dt, SHIFT_RATE * dt);

  // ---- steering ------------------------------------------------------------------------------
  ctrl.steer = lineSteer(car, brain.shift);
  ctrl.analogSteer = true;

  // ---- speed target: braking-point scan along the line -------------------------------------
  const lockup = brain.mistakeKind === 1 && t < brain.mistakeUntil;
  const aBrake = PROFILE_BRAKE_DECEL * (1.22 - skill.cornerBrake * 0.5);
  let target = profileTarget(idx, pace, gripF, aBrake);
  if (!car.surface.onTrack && !car.inPit) target = Math.min(target, 330);

  // pit entry: arrive at the speed limit
  if (car.pitRequest) {
    const du = (PIT_LANE.entryIdx - idx + N) % N;
    if (du < 120) {
      const lim = (PIT_LANE.speedLimitKmh / 0.37) * 0.97;
      const dist = du * 24;
      target = Math.min(target, Math.sqrt(lim * lim + 2 * aBrake * dist));
    }
  }
  brain.targetSpeed = target;

  // traffic: do not drive into the back of the car in front (bodies overlap laterally)
  if (ahead) {
    const gmin = 76;
    const av = ahead.phys.vf;
    // brake lag eats distance: charge it against the room before computing a stopping speed
    const room = Math.max(0, aheadGap - gmin - 0.3 * Math.max(0, v - av));
    const followCap = av + Math.sqrt(2 * 700 * room);
    target = Math.min(target, aheadGap < gmin ? av * 0.93 : followCap);
  }
  // side by side into a corner: the car on the outside gives way to the inside one
  if (nc.dist > 0 && nc.dist < 14) {
    for (let n = 0; n < ctx.cars.length; n++) {
      const o = ctx.cars[n];
      if (o === car || !!o.pit !== !!car.pit) continue;
      const ds = arcDelta(myS, o.timing.lastS);
      if (ds > -30 && ds < 50 && Math.abs(o.lateral - car.lateral) < 45 && (o.lateral - car.lateral) * nc.dir > 0) {
        target = Math.min(target, Math.max(60, o.phys.vf * 0.97));
      }
    }
  }

  // ---- longitudinal controls ----------------------------------------------------------------
  const over = v - target;
  let brakeCmd = 0;
  let throttleCmd = 0;
  if (over > 4) {
    brakeCmd = clamp(over / 28, 0, 1);
  } else {
    throttleCmd = clamp((target - v) / 22 + 0.12, 0, 1) * (0.93 + 0.07 * skill.accel);
  }
  // Lower-consistency drivers sometimes lock up / run wide under heavy braking
  const braking = brakeCmd > 0.5;
  if (braking && !brain.wasBraking && brain.mistakeKind === 0 && v > 300) {
    const pm = (1 - skill.consistency) * 0.55 * tun.mistakes;
    if (rng() < pm) {
      if (rng() < 0.5) {
        brain.mistakeKind = 1;
        brain.mistakeUntil = t + 0.9;
      } else {
        const corner = nextCorner(idx, 30);
        brain.mistakeKind = 2;
        brain.mistakeUntil = t + 2.2;
        // run wide: toward the outside of the corner
        brain.mistakeShift = (corner.dir === 0 ? 1 : -corner.dir) * (14 + rng() * 14);
      }
    }
  }
  brain.wasBraking = braking;
  if (lockup && brakeCmd > 0) brakeCmd *= 0.55;

  // traction: ease the throttle when exiting hard turns at low speed
  if (v < 260 && Math.abs(ctrl.steer) > 0.5) throttleCmd = Math.min(throttleCmd, 0.75);

  ctrl.throttle = throttleCmd;
  ctrl.brake = brakeCmd;
  ctrl.handbrake = false;

  // ---- DRS & ERS -----------------------------------------------------------------------------
  ctrl.drsToggleRequested =
    car.drsAvailable && !p.drsOpen && isCarInDrsZone(idx) && v > 200 && brakeCmd === 0 && Math.abs(ctrl.steer) < 0.2;

  let straight = true;
  for (let k = 3; k < 14; k += 3) if (Math.abs(lineCurv[(idx + k) % N]) > 0.0016) straight = false;
  const attacking = !!ahead && aheadGap < 400;
  const charge = p.ersCharge;
  const wantBoost = straight && throttleCmd > 0.85 && (charge > 60 / tun.ers + 5 || (attacking && charge > 15) || (car.drsAvailable && charge > 25));
  if (brain.ersOn) brain.ersOn = straight && throttleCmd > 0.6 && charge > 6;
  else brain.ersOn = wantBoost;
  ctrl.ersBoost = brain.ersOn;

  // ---- marshals ------------------------------------------------------------------------------
  if (v < 12 && t > 8 && !car.pit) {
    brain.stuckTime += dt;
    if (brain.stuckTime > 4) {
      respawnOnLine(car);
      brain.stuckTime = 0;
    }
  } else brain.stuckTime = 0;
}
