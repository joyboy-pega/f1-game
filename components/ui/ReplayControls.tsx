'use client';

import React, { useEffect, useRef } from 'react';
import { REPLAY_CAM_MODES, REPLAY_SPEEDS, cycleCamMode, replay, seekReplay, stepSpeed, togglePlay } from '@/lib/game/replay/state';
import { recorder } from '@/lib/game/sim/recorder';
import { useGameStore } from '@/lib/game/store';
import { world } from '@/lib/game/sim/world';
import { useRefreshRate, useTicker } from '@/lib/game/useTicker';
import { useWriter } from './domWrite';
import { formatClock, isEditableTarget } from './format';

const CAM_LABEL: Record<(typeof REPLAY_CAM_MODES)[number], string> = { auto: 'Auto', tv: 'TV', heli: 'Heli', onboard: 'Onboard', chase: 'Chase' };

function stepCar(dir: 1 | -1) {
  const n = world.cars.length;
  replay.followId = (replay.followId + dir + n) % n;
  replay.seekSerial++;
}

/** Replay transport bar. The director owns playback; this only reads `replay` and nudges it. */
export function ReplayControls() {
  useRefreshRate(8);
  const w = useWriter();
  const scrub = useRef<HTMLInputElement>(null);
  const setReplayActive = useGameStore((s) => s.setReplayActive);

  useTicker(() => {
    w.text('time', `${formatClock(replay.time - recorder.startTime)} / ${formatClock(recorder.duration - recorder.startTime)}`);
    w.text('cam', replay.camLabel);
    const el = scrub.current;
    if (el && document.activeElement !== el) el.value = String(replay.time);
    w.cls('play', 'paused', !replay.playing);
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowRight':
          stepCar(1);
          break;
        case 'ArrowLeft':
          stepCar(-1);
          break;
        case 'KeyC':
          cycleCamMode();
          break;
        case 'BracketRight':
          stepSpeed(1);
          break;
        case 'BracketLeft':
          stepSpeed(-1);
          break;
        case 'Escape':
          setReplayActive(false);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setReplayActive]);

  const follow = world.cars[Math.min(replay.followId, world.cars.length - 1)];
  const markers = recorder.markersFor(follow.id).filter((m) => m.kind === 'lap');
  const start = recorder.startTime;
  const span = Math.max(0.001, recorder.duration - start);

  return (
    <div className="r-bar" role="region" aria-label="Replay controls">
      <div className="r-top">
        <span className="r-tag">Replay</span>
        <span className="r-cam" ref={w.ref('cam')}>
          TV
        </span>
        <button type="button" className="r-btn" onClick={() => setReplayActive(false)}>
          Exit <kbd>Esc</kbd>
        </button>
      </div>

      <div className="r-follow">
        <button type="button" className="r-btn" onClick={() => stepCar(-1)} aria-label="Previous car">
          ◀
        </button>
        <span className="r-driver">
          <i style={{ background: follow.driver.livery.body }} />
          <b>{follow.driver.code}</b> {follow.driver.name}
        </span>
        <button type="button" className="r-btn" onClick={() => stepCar(1)} aria-label="Next car">
          ▶
        </button>
      </div>

      <div className="r-transport">
        <button type="button" className="r-btn r-play" ref={w.ref('play')} onClick={togglePlay} aria-label="Play or pause">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <g className="icon-pause">
              <rect x="6" y="5" width="4" height="14" fill="currentColor" />
              <rect x="14" y="5" width="4" height="14" fill="currentColor" />
            </g>
            <path className="icon-play" d="M7 5l12 7-12 7z" fill="currentColor" />
          </svg>
        </button>

        <div className="r-scrub">
          <input
            ref={scrub}
            type="range"
            min={start}
            max={Math.max(start + 0.01, recorder.duration)}
            step={0.05}
            defaultValue={start}
            onChange={(e) => seekReplay(parseFloat(e.target.value))}
            aria-label="Replay position"
          />
          {markers.map((m) => (
            <i key={`${m.lap}-${m.t}`} className="r-mark" style={{ left: `${((m.t - start) / span) * 100}%` }} title={`Lap ${m.lap}`} />
          ))}
        </div>

        <span className="r-time" ref={w.ref('time')}>
          0:00.000 / 0:00.000
        </span>

        <div className="r-speed" role="group" aria-label="Playback speed">
          {REPLAY_SPEEDS.map((sp) => (
            <button
              key={sp}
              type="button"
              className={`r-btn r-sp ${replay.speed === sp ? 'on' : ''}`}
              onClick={() => {
                replay.speed = sp;
              }}
            >
              {sp}×
            </button>
          ))}
        </div>

        <button type="button" className="r-btn" onClick={cycleCamMode} title="Camera (C)">
          Cam: {CAM_LABEL[replay.camMode]}
        </button>
      </div>
    </div>
  );
}
