import { RefObject, useEffect, useRef } from 'react';
import { VIEWPORT_H, VIEWPORT_W, TILE } from '../game/constants';

export interface ViewportSize {
  width: number;
  height: number;
  dpr: number;
}

/** Max canvas backing-store width (CSS pixels × dpr). */
const MAX_RENDER_WIDTH = 1280;
const MAX_RENDER_HEIGHT = 720;
const MAX_DPR = 1.25;

const DEFAULT_VIEWPORT: ViewportSize = {
  width: VIEWPORT_W * TILE,
  height: VIEWPORT_H * TILE,
  dpr: 1,
};

function computeBackingStore(width: number, height: number): { backingW: number; backingH: number; dpr: number } {
  let dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  let backingW = Math.floor(width * dpr);
  let backingH = Math.floor(height * dpr);

  if (backingW > MAX_RENDER_WIDTH) {
    backingH = Math.floor((backingH * MAX_RENDER_WIDTH) / backingW);
    backingW = MAX_RENDER_WIDTH;
  }
  if (backingH > MAX_RENDER_HEIGHT) {
    backingW = Math.floor((backingW * MAX_RENDER_HEIGHT) / backingH);
    backingH = MAX_RENDER_HEIGHT;
  }

  dpr = backingW / width;
  return { backingW, backingH, dpr };
}

/** Resize canvas to fill the window; returns logical viewport size for camera math. */
export function useCanvasResize(canvasRef: RefObject<HTMLCanvasElement | null>) {
  const viewportRef = useRef<ViewportSize>(DEFAULT_VIEWPORT);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const { backingW, backingH, dpr } = computeBackingStore(width, height);
      canvas.width = backingW;
      canvas.height = backingH;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      viewportRef.current = { width, height, dpr };
    };

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('orientationchange', resize);
    };
  }, [canvasRef]);

  return viewportRef;
}
