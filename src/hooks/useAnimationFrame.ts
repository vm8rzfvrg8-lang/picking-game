import { useEffect, useRef } from 'react';

// Calls `cb(dt)` every animation frame while `active` is true.
// dt is in seconds, capped to avoid huge jumps after tab switches.
export function useAnimationFrame(active: boolean, cb: (dt: number) => void) {
  const cbRef = useRef(cb);
  cbRef.current = cb;

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      cbRef.current(dt);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);
}
