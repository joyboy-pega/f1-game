import { useEffect, useRef, useState } from 'react';

/**
 * Run `cb` on every animation frame outside React rendering. Use it in DOM HUD
 * components to write high-frequency values (speed, rpm) straight into refs.
 */
export function useTicker(cb: (dt: number) => void) {
  const cbRef = useRef(cb);
  cbRef.current = cb;
  useEffect(() => {
    let id = 0;
    let last = performance.now();
    const loop = (now: number) => {
      cbRef.current(Math.min(0.1, (now - last) / 1000));
      last = now;
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);
}

/** Re-render the calling component at most `hz` times per second. For low-rate panels that read `world` directly. */
export function useRefreshRate(hz: number) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % 1_000_000), 1000 / hz);
    return () => clearInterval(id);
  }, [hz]);
}
