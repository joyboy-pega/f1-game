'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { HW } from '@/lib/game/constants';
import { track } from '@/lib/game/track';
import { standPlan } from '@/components/game/TrackProps';
import { CameraRig } from '@/lib/game/camera/rig';
import { findNearestTrackPoint } from '@/lib/game/physics';
import { surfaceHeight } from '@/lib/game/track/surface';
import { replay, resetReplay, type ReplayCamMode } from '@/lib/game/replay/state';
import { REC_COMPOUNDS, makeCarSample, recorder } from '@/lib/game/sim/recorder';
import { useGameStore } from '@/lib/game/store';
import { world } from '@/lib/game/sim/world';
import { frameAt } from '@/lib/game/visuals/trackData';

interface TvCam {
  pos: THREE.Vector3;
  idx: number;
}

const TV_COUNT = 26;
const AUTO_SEQUENCE: Exclude<ReplayCamMode, 'auto'>[] = ['tv', 'tv', 'heli', 'tv', 'onboard', 'tv', 'chase'];
const AUTO_SHOT_SECONDS = 7;

/**
 * Trackside cameras ringed outside the barrier. The pit side is full of garages, so cameras there
 * flip to the opposite side; any camera that would land inside a grandstand is raised above its roof.
 */
function buildTvCams(): TvCam[] {
  const cams: TvCam[] = [];
  const { N, pit: PIT_LANE } = track.current;
  const stands = standPlan();
  for (let k = 0; k < TV_COUNT; k++) {
    const idx = Math.floor((k / TV_COUNT) * N);
    const [x, z, , , nx, nz] = frameAt(idx);
    let side: 1 | -1 = k % 2 === 0 ? 1 : -1;
    const inPitStretch = idx >= PIT_LANE.entryIdx - 40 || idx <= PIT_LANE.exitIdx + 40;
    if (inPitStretch && side === PIT_LANE.side) side = (-side) as 1 | -1;
    let d = HW + 125 + (k % 3) * 28;
    let h = 14 + (k % 4) * 7;
    const stand = stands.find((s) => s.side === side && (((idx - Math.floor(s.from) + N) % N) < s.count + 8));
    if (stand) {
      d = stand.d0 + 70; // above the upper tiers
      h = 78;
    }
    const trackH = surfaceHeight(idx, side * d);
    cams.push({ pos: new THREE.Vector3(x + nx * side * d, h + trackH, z + nz * side * d), idx });
  }
  return cams;
}

const wrapDelta = (a: number, b: number) => {
  const N = track.current.N;
  return ((b - a + N + N / 2) % N) - N / 2;
};

/**
 * Plays the recording back into the live cars (so every renderer, effect and HUD just works) and
 * runs the TV director: trackside cameras, helicopter, onboard and chase, auto-cutting between them.
 */
export function ReplayDirector() {
  const active = useGameStore((s) => s.replayActive);
  const trackId = useGameStore((s) => s.settings.trackId);
  const { camera } = useThree();
  const rig = useMemo(() => new CameraRig(), []);
  const sample = useMemo(() => makeCarSample(), []);
  const tvCams = useMemo(buildTvCams, [trackId]);
  const st = useRef({ tvIdx: 0, hint: 0, autoClock: 0, autoStep: 0, heliAngle: 0, serial: -1, lookAt: new THREE.Vector3() });

  useEffect(() => {
    if (!active) return;
    resetReplay(world.player.id, recorder.startTime);
    rig.reset();
    st.current.autoClock = 0;
    st.current.autoStep = 0;
    st.current.tvIdx = -1;
  }, [active, rig]);

  useFrame((_, rawDt) => {
    if (!active) return;
    const dt = Math.min(0.1, rawDt);
    const s = st.current;

    // ---- playback clock
    if (replay.playing && !replay.ended) {
      replay.time += dt * replay.speed;
      if (replay.time >= recorder.duration) {
        replay.time = recorder.duration;
        replay.ended = true;
        replay.playing = false;
      }
    }

    // ---- write the recorded state into the live cars
    const loc = recorder.locate(replay.time);
    for (let k = 0; k < world.cars.length; k++) {
      const car = world.cars[k];
      recorder.readCar(loc, k, sample);
      const p = car.phys;
      p.x = sample.x;
      p.y = sample.y;
      p.a = sample.a;
      p.steer = sample.steer;
      p.vf = sample.vf;
      p.vl = sample.vl;
      p.vx = sample.vf * Math.cos(sample.a) - sample.vl * Math.sin(sample.a);
      p.vy = sample.vf * Math.sin(sample.a) + sample.vl * Math.cos(sample.a);
      p.kmh = sample.kmh;
      p.rpm = sample.rpm;
      p.gear = sample.gear === 0 ? 'N' : sample.gear;
      p.brakeInput = sample.brake;
      p.drsOpen = sample.drsOpen;
      p.isBoosting = sample.isBoosting;
      p.isDrifting = sample.isDrifting;
      p.driftIntensity = sample.drift;
      p.guardRailSparks = sample.sparks;
      p.pitch = 0;
      p.roll = 0;
      car.inPit = sample.inPit;
      car.compound = REC_COMPOUNDS[sample.compound] ?? car.compound;
      car.position = sample.position;
    }

    // ---- camera
    const target = world.cars[Math.min(replay.followId, world.cars.length - 1)];
    const tp = target.phys;
    const cam = camera as THREE.PerspectiveCamera;

    s.autoClock += dt;
    if (replay.camMode === 'auto' && s.autoClock >= AUTO_SHOT_SECONDS) {
      s.autoClock = 0;
      s.autoStep = (s.autoStep + 1) % AUTO_SEQUENCE.length;
    }
    const kind = replay.camMode === 'auto' ? AUTO_SEQUENCE[s.autoStep] : replay.camMode;
    replay.activeCam = kind;

    if (kind === 'onboard' || kind === 'chase') {
      replay.camLabel = kind === 'onboard' ? 'ONBOARD' : 'CHASE';
      rig.update(cam, tp, kind === 'onboard' ? 'tcam' : 'chase', dt, { lookBack: false, shakeScale: 0.25 });
      return;
    }

    const carY = tp.idx !== undefined ? surfaceHeight(tp.idx, 0) : 0;

    if (kind === 'heli') {
      replay.camLabel = 'HELI';
      s.heliAngle += dt * 0.16;
      cam.position.set(tp.x + Math.cos(s.heliAngle) * 280, carY + 140, tp.y + Math.sin(s.heliAngle) * 280);
      s.lookAt.set(tp.x, carY + 3.5, tp.y);
      cam.lookAt(s.lookAt);
      cam.fov += (36 - cam.fov) * Math.min(1, 4 * dt);
      cam.updateProjectionMatrix();
      return;
    }

    // TV: nearest camera just ahead of the car; cut when the car has passed it or it is too far
    const [ni] = findNearestTrackPoint(tp.x, tp.y, s.hint);
    s.hint = ni;
    let cur = s.tvIdx >= 0 ? tvCams[s.tvIdx] : null;
    const dist = cur ? cur.pos.distanceTo(new THREE.Vector3(tp.x, carY + 3.5, tp.y)) : 1e9;
    const passed = cur ? wrapDelta(cur.idx, ni) > 55 : true;
    if (!cur || passed || dist > 900 || s.serial !== replay.seekSerial) {
      let best = -1;
      let bestD = 1e9;
      for (let c = 0; c < tvCams.length; c++) {
        const ahead = wrapDelta(ni, tvCams[c].idx);
        if (ahead >= 25 && ahead < bestD) {
          bestD = ahead;
          best = c;
        }
      }
      if (best >= 0 && best !== s.tvIdx) {
        s.tvIdx = best;
        cur = tvCams[best];
      }
      s.serial = replay.seekSerial;
    }
    if (!cur) return;
    replay.camLabel = `TV ${s.tvIdx + 1}`;
    cam.position.copy(cur.pos);
    s.lookAt.set(tp.x, carY + 3.5, tp.y);
    cam.lookAt(s.lookAt);
    const d = cam.position.distanceTo(s.lookAt);
    const fovTarget = THREE.MathUtils.clamp((Math.atan(46 / Math.max(60, d)) * 2 * 180) / Math.PI, 9, 52);
    cam.fov += (fovTarget - cam.fov) * Math.min(1, 5 * dt);
    cam.updateProjectionMatrix();
  });

  return null;
}
