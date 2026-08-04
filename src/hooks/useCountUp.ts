import { useEffect, useState } from 'react';

/**
 * Animates an integer from 0 toward `target` when `active` becomes true.
 * Optional delay staggers multiple counters (e.g. combo then coins).
 */
export function useCountUp(
  target: number,
  active: boolean,
  durationMs = 720,
  delayMs = 0,
): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) {
      setValue(0);
      return;
    }

    let raf = 0;
    let delayTimer: ReturnType<typeof setTimeout> | undefined;
    let startTime = 0;

    const tick = (now: number) => {
      if (!startTime) startTime = now;
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };

    delayTimer = setTimeout(() => {
      raf = requestAnimationFrame(tick);
    }, delayMs);

    return () => {
      clearTimeout(delayTimer);
      cancelAnimationFrame(raf);
    };
  }, [target, active, durationMs, delayMs]);

  return value;
}
