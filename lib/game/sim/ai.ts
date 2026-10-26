import { HW, type Difficulty, type WeatherType } from '../constants';
import { track } from '../track';
import { KMH_PER_UNIT } from '../units';
import { isCarInDrsZone } from '../physics';
import { CAR } from '../vehicle/params';
import { makeRng } from './rng';
import { snapRenderPose } from './interp';
import type { WorldCar, AIBrain } from './types';
import { getRacingLine, PROFILE_BRAKE_DECEL } from './racingLine';
import { sectorOf } from './race';

// Racing-line AI driver. It produces a ControlState so AI cars run through the exact same physics
// as the player: pure-pursuit steering on the optimal line, a braking-point speed scan from the line's
// corner limits, traffic awareness (follow / overtake / defend), driver errors, DRS and ERS.

export const CORNER_SAFETY = 0.72;
const SPEED_CAP = 840; // straight-line target cap before pace scaling

interface DifficultyTuning {
  pace: number;
  mistakes: number;
  ers: number;
  aggression: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultyTuning> = {
  rookie: { pace: 0.885, mistakes: 2.6, ers: 0.4, aggression: 0.6 },
  pro: { pace: 1.0, mistakes: 1.0, ers: 0.85, aggression: 1.0 },
  legend: { pace: 1.085, mistakes: 0.45, ers: 1.0, aggression: 1.15 },
};

export interface AIContext {
  cars: WorldCar[];
  difficulty: Difficulty;
  raceTime: number;
  weather: WeatherType;
  isRace: boolean;
  flags?: {
    scMode: 'none' | 'vsc' | 'sc';
    sectorYellow: [boolean, boolean, boolean];
  };
}

const WEATHER_GRIP: Record<WeatherType, number> = { sunny: 1, cloudy: 0.95, rain: 0.65, snow: 0.35, dynamic: 0.9 };

const CAR_R = 8.6;
const PASS_GAP = 2 * CAR_R + 8; // lateral distance kept while passing
const MAX_LAT = HW - 20;
const SHIFT_RATE = 48; // lateral units/s
const STEER_K_E = 1.6;
const STEER_K_H = 1.4;

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
  const L = track.current.length;
  let d = b - a;
  if (d > L / 2) d -= L;
  else if (d < -L / 2) d += L;
  return d;
}

const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);

/** Grip-driven scale for cornering speed (worn / cold / wrong tyres, rain, fuel load). */
export function gripSpeedFactor(car: WorldCar, weather: WeatherType): number {
  const g = car.phys.tires.frontGrip * WEATHER_GRIP[weather];
  const massScale = CAR.massKg / (CAR.massKg + (car.fuelKg ?? 0));
  return clamp(Math.pow(g, 0.9) * Math.pow(massScale, 0.22), 0.3, 1.1);
}

/** Marshals put a car that is stuck back on the racing line. */
export function respawnOnLine(car: WorldCar, speed = 120) {
  const N = track.current.N;
  const RL = getRacingLine();
  const p = car.phys;
  const i = (p.idx + 4) % N;
  p.x = RL.x[i];
  p.y = RL.y[i];
  p.a = RL.heading[i];
  p.vf = speed;
  p.vl = 0;
  p.vx = Math.cos(p.a) * speed;
  p.vy = Math.sin(p.a) * speed;
  p.idx = i;
  p.isDrifting = false;
  p.driftIntensity = 0;
  p.drsOpen = false;
  if (p._veh) {
    p._veh.x = p.x / 10;
    p._veh.y = p.y / 10;
    p._veh.yaw = p.a;
    p._veh.vx = p.vf / 10;
    p._veh.vy = 0;
    p._veh.yawRate = 0;
    p._veh.steer = 0;
    p._veh.prevAx = 0;
    p._veh.prevAy = 0;
  }
  snapRenderPose(car);
}

/** Distance (spline indices) to the next sizeable corner on the racing line, and its direction. */
function nextCorner(idx: number, maxIdx: number): { dist: number; dir: number } {
  const N = track.current.N;
  const lineCurv = getRacingLine().curv;
  for (let k = 4; k < maxIdx; k += 2) {
    const c = lineCurv[(idx + k) % N];
    if (Math.abs(c) > 0.0018) return { dist: k, dir: c > 0 ? 1 : -1 };
  }
  return { dist: -1, dir: 0 };
}

/**
 * Steering command (-1..1) to track the racing line shifted laterally by `shift`: curvature
 * feed-forward plus Stanley-style cross-track and heading feedback.
 */
export function lineSteer(car: WorldCar, shift: number): number {
  const N = track.current.N;
  const RL = getRacingLine();
  const p = car.phys;
  const idx = p.idx;
  const v = Math.max(0, p.vf);
  const u = Math.max(1.0, v / 10); // speed in m/s

  // Max steer angle (rad) matches vehicle model's speed-sensitive steering
  const steerCoeff = 2.6 + 2.0 * Math.max(0, 1 - u / 35);
  const maxSteerRad = Math.min(0.32, steerCoeff / Math.max(4.0, u));

  // Kinematic Ackermann feed-forward (wheelbase = 3.6 m = 36 units)
  const ahd = Math.min(6, 1 + Math.round((v * 0.08) / 24));
  const kappa = RL.curv[(idx + ahd) % N];
  const deltaFf = 36 * kappa;

  // Cross-track error (e in track units, e/10 in meters)
  const e = clamp(car.lateral - (RL.offset[idx] + shift), -50, 50);
  const deltaCross = -Math.atan2(1.2 * (e / 10), u + 2.0);

  // Track boundary repulsion: smooth gentle inward bias when near the track edge
  let deltaEdge = 0;
  const hw = track.current.halfWidth[idx];
  const latAbs = Math.abs(car.lateral);
  if (latAbs > hw - 22 && !car.inPit) {
    const excess = (latAbs - (hw - 22)) / 10; // meters into boundary zone
    const maxEdgeAngle = Math.min(0.18, 3.2 / u);
    deltaEdge = -Math.sign(car.lateral) * Math.min(maxEdgeAngle, excess * 0.07);
  }

  // Heading error
  let herr = RL.heading[idx] - p.a;
  herr = Math.atan2(Math.sin(herr), Math.cos(herr));
  const deltaHead = clamp(herr, -0.4, 0.4);

  // Yaw rate damping relative to path yaw rate
  const rPath = u * (kappa * 10);
  const rActual = p._veh ? p._veh.yawRate : 0;
  const rDamp = clamp(-0.12 * (rActual - rPath), -0.15, 0.15);

  const deltaTotal = deltaFf + 0.85 * deltaHead + deltaCross + deltaEdge + rDamp;
  return clamp(deltaTotal / maxSteerRad, -1, 1);
}

/** Highest speed allowed here such that every corner ahead can still be taken (braking-point scan). */
export function profileTarget(idx: number, pace: number, gripF: number, aBrake: number): number {
  const N = track.current.N;
  const RL = getRacingLine();
  const cap = SPEED_CAP * pace;
  let target = cap;
  let d = 0;
  for (let k = 0; k < 160; k++) {
    const i = (idx + k) % N;
    const vc = Math.min(cap, RL.cornerSpeed[i] * CORNER_SAFETY * pace * gripF);
    // Low and medium speed corners have less aero downforce, so need more braking distance
    const effBrake = vc < 350 ? aBrake * 0.34 : vc < 480 ? aBrake * 0.46 : aBrake * 0.65;
    const allowed = Math.sqrt(vc * vc + 2 * effBrake * d);
    if (allowed < target) target = allowed;
    d += RL.seg[i];
    if (d > 4200) break;
  }
  return target;
}

export function driveAI(car: WorldCar, ctx: AIContext, dt: number): void {
  const N = track.current.N;
  const RL = getRacingLine();
  const PIT = track.current.pit;
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
  const hw = track.current.halfWidth[idx];
  const MAX_LAT = hw - 20;
  const baseOff = RL.offset[idx];
  const planned = baseOff + brain.shift;
  const isSC = ctx.flags?.scMode === 'sc';

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
    const oPlan = o.ai ? RL.offset[o.phys.idx] + o.ai.shift : o.lateral;
    const overlap = Math.min(Math.abs(dl), Math.abs(o.lateral - car.lateral), Math.abs(oPlan - planned), Math.abs(oPlan - car.lateral));
    const scanDist = isSC ? 3500 : 700;
    const overlapMax = (t < 35 || Math.abs(RL.curv[idx]) > 0.0020) ? 36 : 22;
    if (ds > 0 && ds < scanDist && ds < aheadGap && (isSC || overlap < overlapMax)) {
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
  const curvHere = Math.abs(RL.curv[idx]);

  const nc = nextCorner(idx, 16);
  const cornerSoon = curvHere > 0.0018 || nc.dist > 0 || brain.targetSpeed < v - 30;

  // end of an overtake
  const sec = sectorOf(myS);
  const yellowInSector = !!(ctx.flags?.sectorYellow && ctx.flags.sectorYellow[sec]);
  const noOvertake = (ctx.flags?.scMode && ctx.flags.scMode !== 'none') || yellowInSector;

  if (brain.passSide !== 0) {
    const pc = ctx.cars[brain.passCarId as number] as WorldCar | undefined;
    const pds = pc ? arcDelta(myS, pc.timing.lastS) : -999;
    if (noOvertake || !pc || pds < -75 || t - brain.passStart > 9 || !!pc.pit !== !!car.pit || (cornerSoon && pds > 15)) {
      brain.passSide = 0;
    } else {
      shiftTarget = clamp(pc.lateral + brain.passSide * PASS_GAP, -MAX_LAT, MAX_LAT) - baseOff;
    }
  }

  // Blue flag: yield racing line to faster car closing behind
  if (car.blueFlag) {
    const outsideSide = car.lateral >= 0 ? 1 : -1;
    shiftTarget = outsideSide * (track.current.halfWidth[idx] - 15) - baseOff;
  }

  // freeSpeed is evaluated below; decisions use last step's target
  brain.decisionTimer -= dt;
  if (ahead && brain.passSide === 0 && !noOvertake && brain.decisionTimer <= 0 && ctx.isRace && t > 10 && !cornerSoon) {
    brain.decisionTimer = 0.35;
    const held = aheadGap < 320 && aheadGap > 25 && brain.targetSpeed > ahead.phys.vf + 4;
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
  if (curvHere > 0.0018 && !hasNeighbour && brain.mistakeKind !== 2) shiftTarget = 0;

  if (brain.mistakeKind === 2) shiftTarget += brain.mistakeShift;

  // heading to the pits: move to the pit-lane side before the entry
  if (car.pitRequest) {
    const du = (PIT.entryIdx - idx + N) % N;
    if (du <= 55) {
      const f = 1 - du / 55;
      const s = f * f * (3 - 2 * f);
      shiftTarget = (PIT.side * (hw - 18) - baseOff) * s;
    }
  }

  // never squeeze a car alongside
  const lo = Math.min(MAX_LAT, Math.max(-MAX_LAT, lowBound));
  const hi = Math.max(-MAX_LAT, Math.min(MAX_LAT, highBound));
  const finalAbs = clamp(baseOff + shiftTarget, Math.min(lo, hi), Math.max(lo, hi));
  shiftTarget = lowBound > highBound ? car.lateral - baseOff : finalAbs - baseOff;
  const dShift = shiftTarget - brain.shift;
  brain.shift += clamp(dShift, -SHIFT_RATE * dt, SHIFT_RATE * dt);
  brain.shift = clamp(baseOff + brain.shift, -MAX_LAT, MAX_LAT) - baseOff;

  // ---- steering ------------------------------------------------------------------------------
  ctrl.steer = lineSteer(car, brain.shift);
  ctrl.analogSteer = true;

  // ---- speed target: braking-point scan along the line -------------------------------------
  const lockup = brain.mistakeKind === 1 && t < brain.mistakeUntil;
  const massScale = CAR.massKg / (CAR.massKg + (car.fuelKg ?? 0));
  const aBrake = PROFILE_BRAKE_DECEL * (0.80 + skill.cornerBrake * 0.15) * Math.pow(massScale, 0.5);
  let target = profileTarget(idx, pace, gripF, aBrake);
  if (!car.surface.onTrack && !car.inPit) target = Math.min(target, 180);

  // Flags & Safety Car limits (PLAN-v3 §8 R3)
  if (ctx.flags?.scMode === 'vsc') {
    target = Math.min(target, 500); // 180 km/h cap for VSC delta
  } else if (ctx.flags?.scMode === 'sc') {
    const isLeader = car.position === 1;
    if (isLeader) {
      target = Math.min(target, 388); // 140 km/h Safety Car pace for leader
    } else if (ahead) {
      const targetGapUnits = 420; // ~42m = ~1.08s at 140 km/h (< 1.5s)
      if (aheadGap > targetGapUnits) {
        target = Math.min(520, ahead.phys.vf + (aheadGap - targetGapUnits) * 0.5);
      } else {
        target = Math.min(target, ahead.phys.vf * 0.94);
      }
    } else {
      target = Math.min(target, 520); // Catching the SC pack
    }
  } else if (yellowInSector) {
    target = Math.min(target, target * 0.70); // 30% lift in yellow flag sector
  }

  if (car.blueFlag) {
    target = Math.min(target, 400); // Lift to let faster car pass smoothly
  }

  // pit entry: arrive at the speed limit
  if (car.pitRequest) {
    const du = (PIT.entryIdx - idx + N) % N;
    if (du < 120) {
      const lim = (PIT.speedLimitKmh / KMH_PER_UNIT) * 0.95;
      const dist = du * 24;
      target = Math.min(target, Math.sqrt(lim * lim + 2 * (aBrake * 0.70) * dist));
    }
  }
  brain.targetSpeed = target;

  // traffic: do not drive into the back of the car in front (bodies overlap laterally)
  if (ahead && !isSC) {
    const gmin = t < 35 ? 96 : 76;
    const av = ahead.phys.vf;
    // brake lag eats distance: charge it against the room before computing a stopping speed
    const room = Math.max(0, aheadGap - gmin - 0.3 * Math.max(0, v - av));
    const followCap = av + Math.sqrt(2 * 700 * room);
    target = Math.min(target, aheadGap < gmin ? av * 0.93 : followCap);
  }
  // side by side into a corner: the car on the outside gives way to the inside one
  const inOrNearCorner = Math.abs(RL.curv[idx]) > 0.0020 || (nc.dist > 0 && nc.dist < 26);
  const cornerDir = nc.dir !== 0 ? nc.dir : (RL.curv[idx] > 0 ? 1 : -1);
  if (inOrNearCorner && cornerDir !== 0) {
    for (let n = 0; n < ctx.cars.length; n++) {
      const o = ctx.cars[n];
      if (o === car || !!o.pit !== !!car.pit) continue;
      const ds = arcDelta(myS, o.timing.lastS);
      if (ds > -35 && ds < 55 && Math.abs(o.lateral - car.lateral) < 45 && (o.lateral - car.lateral) * cornerDir > 0) {
        target = Math.min(target, Math.max(50, o.phys.vf * 0.90));
      }
    }
  }

  // ---- longitudinal controls ----------------------------------------------------------------
  const over = v - target;
  let brakeCmd = 0;
  let throttleCmd = 0;
  if (over > 1) {
    brakeCmd = clamp(over / 6, 0, 1);
  } else {
    throttleCmd = clamp((target - v) / 18 + 0.1, 0, 1) * (0.93 + 0.07 * skill.accel);
  }
  // Lower-consistency drivers sometimes lock up / run wide under heavy braking
  const braking = brakeCmd > 0.5;
  if (braking && !brain.wasBraking && brain.mistakeKind === 0 && v > 300) {
    const pm = t < 30 ? 0 : (1 - skill.consistency) * 0.25 * tun.mistakes;
    if (rng() < pm) {
      if (rng() < 0.5) {
        brain.mistakeKind = 1;
        brain.mistakeUntil = t + 0.5;
      } else {
        const corner = nextCorner(idx, 30);
        brain.mistakeKind = 2;
        brain.mistakeUntil = t + 1.2;
        // run wide: toward the outside of the corner
        brain.mistakeShift = (corner.dir === 0 ? 1 : -corner.dir) * (3 + rng() * 4);
      }
    }
  }
  brain.wasBraking = braking;
  if (lockup && brakeCmd > 0) brakeCmd *= 0.88;

  // traction: limit throttle under high lateral acceleration and rear tyre slip to prevent power oversteer
  const currentAy = p._veh ? Math.abs(p._veh.prevAy) / 9.81 : (Math.abs(ctrl.steer) * v * 0.004);
  if (currentAy > 1.4) {
    const ayLimit = Math.max(0.25, 1.0 - (currentAy - 1.4) / 1.6);
    throttleCmd = Math.min(throttleCmd, ayLimit);
  }
  const rearSlip = p.wheelSlipRear ?? 0;
  if (rearSlip > 0.12) {
    const tcFactor = Math.max(0.15, 1.0 - (rearSlip - 0.12) / 0.25);
    throttleCmd *= tcFactor;
  }
  // edge of track: if near the boundary, modulate throttle to keep car on asphalt
  const edgeDist = hw - Math.abs(car.lateral);
  const T = track.current;
  const vTrackLat = p.vx * T.nx[idx] + p.vy * T.ny[idx];
  if (edgeDist < 20 && car.lateral * vTrackLat > 0 && !car.inPit) {
    const edgeLimit = Math.max(0, edgeDist / 20);
    throttleCmd = Math.min(throttleCmd, edgeLimit);
  }
  if (!car.surface.onTrack && !car.inPit) {
    throttleCmd = Math.min(throttleCmd, 0.75);
  }
  if (v < 300 && Math.abs(ctrl.steer) > 0.25) {
    const steerLimit = Math.max(0.20, 1.0 - 0.80 * (Math.abs(ctrl.steer) - 0.25) / 0.75);
    throttleCmd = Math.min(throttleCmd, steerLimit);
  }

  ctrl.throttle = throttleCmd;
  ctrl.brake = brakeCmd;
  ctrl.handbrake = false;

  // ---- DRS & ERS -----------------------------------------------------------------------------
  ctrl.drsToggleRequested =
    car.drsAvailable && !p.drsOpen && isCarInDrsZone(idx) && v > 200 && brakeCmd === 0 && Math.abs(ctrl.steer) < 0.2;

  let straight = true;
  for (let k = 3; k < 14; k += 3) if (Math.abs(RL.curv[(idx + k) % N]) > 0.0016) straight = false;
  const attacking = !!ahead && aheadGap < 400;
  const charge = p.ersCharge;
  const wantBoost = straight && throttleCmd > 0.85 && (charge > 60 / tun.ers + 5 || (attacking && charge > 15) || (car.drsAvailable && charge > 25));
  if (brain.ersOn) brain.ersOn = straight && throttleCmd > 0.6 && charge > 6;
  else brain.ersOn = wantBoost;
  ctrl.ersBoost = brain.ersOn;

  // ---- marshals ------------------------------------------------------------------------------
  const speedThresh = !car.surface.onTrack ? 60 : 20;
  if (v < speedThresh && t > 6 && !car.pit) {
    brain.stuckTime += dt;
    const thresh = !car.surface.onTrack ? 1.5 : 3.5;
    if (brain.stuckTime > thresh) {
      respawnOnLine(car);
      brain.stuckTime = 0;
    }
  } else brain.stuckTime = 0;
}
