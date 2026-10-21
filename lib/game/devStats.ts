/**
 * Measurement hook (PLAN-v3 S6). When enabled (dev builds, or `?stats=1` on any build) the Canvas publishes
 * `window.__BUDDH_STATS__` once per second so scripts/shoot.mjs and humans can read real numbers instead of guessing.
 * Nothing here runs when disabled; sim code never imports it (it lives outside lib/game/sim, R6).
 */
export interface BuddhStats {
  /** Draw calls per rendered frame, all passes including the shadow map and post-processing. */
  drawCalls: number;
  triangles: number;
  /** GPU resources currently alive (renderer.info.memory). */
  geometries: number;
  textures: number;
  programs: number;
  /** Mean wall ms spent inside world.step per rendered frame. */
  simMsAvg: number;
  /** Mean ms between rendered frames (frame interval, not GPU time). */
  frameMsAvg: number;
  dpr: number;
  quality: string;
  /** Rendered frames averaged into this snapshot. */
  frames: number;
}

declare global {
  interface Window {
    __BUDDH_STATS__?: BuddhStats;
  }
}

export const devStats = {
  enabled: false,
  simMsSum: 0,
  simFrames: 0,
  addSim(ms: number) {
    this.simMsSum += ms;
    this.simFrames++;
  },
};

export function statsRequested(): boolean {
  if (typeof window === 'undefined') return false;
  if (process.env.NODE_ENV !== 'production') return true;
  return new URLSearchParams(window.location.search).has('stats');
}
