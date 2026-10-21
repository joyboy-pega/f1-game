// Replay UI/director shared state. Plain mutable singleton (like `world`): the director
// writes it every frame in useFrame, DOM controls read it via useTicker / useRefreshRate.

export type ReplayCamMode = 'auto' | 'tv' | 'heli' | 'onboard' | 'chase';
export const REPLAY_CAM_MODES: ReplayCamMode[] = ['auto', 'tv', 'heli', 'onboard', 'chase'];
export const REPLAY_SPEEDS = [0.25, 0.5, 1, 2, 4];

export interface ReplayState {
  /** Playback position in race time (seconds). */
  time: number;
  playing: boolean;
  speed: number;
  camMode: ReplayCamMode;
  /** Camera kind currently on air (resolved from `auto`). */
  activeCam: Exclude<ReplayCamMode, 'auto'>;
  camLabel: string;
  followId: number;
  /** Bumped when the user scrubs so the director can drop smoothing state. */
  seekSerial: number;
  ended: boolean;
}

export const replay: ReplayState = {
  time: 0,
  playing: true,
  speed: 1,
  camMode: 'auto',
  activeCam: 'tv',
  camLabel: 'TV',
  followId: 0,
  seekSerial: 0,
  ended: false,
};

export function resetReplay(followId: number, startTime: number) {
  replay.time = startTime;
  replay.playing = true;
  replay.speed = 1;
  replay.camMode = 'auto';
  replay.activeCam = 'tv';
  replay.camLabel = 'TV';
  replay.followId = followId;
  replay.seekSerial++;
  replay.ended = false;
}

export function seekReplay(t: number) {
  replay.time = t;
  replay.ended = false;
  replay.seekSerial++;
}

export function togglePlay() {
  if (replay.ended) {
    replay.ended = false;
    replay.playing = true;
    return;
  }
  replay.playing = !replay.playing;
}

export function stepSpeed(dir: 1 | -1) {
  const i = REPLAY_SPEEDS.indexOf(replay.speed);
  const j = Math.max(0, Math.min(REPLAY_SPEEDS.length - 1, (i < 0 ? 2 : i) + dir));
  replay.speed = REPLAY_SPEEDS[j];
}

export function cycleCamMode() {
  const i = REPLAY_CAM_MODES.indexOf(replay.camMode);
  replay.camMode = REPLAY_CAM_MODES[(i + 1) % REPLAY_CAM_MODES.length];
}
