import { GRID_H, GRID_W, TILE, VIEWPORT_H, VIEWPORT_W } from './constants';

export interface CameraOffset {
  cameraX: number;
  cameraY: number;
}

export interface CameraState extends CameraOffset {
  /** World-to-screen scale (map height fills viewport height). */
  scale: number;
  viewWorldW: number;
  viewWorldH: number;
}

export interface CullBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Fit map height to screen; follow player horizontally. */
export function computeCameraTransform(
  playerGridX: number,
  viewW: number,
  viewH: number,
): CameraState {
  const worldH = GRID_H * TILE;
  const worldW = GRID_W * TILE;
  const scale = viewH / worldH;
  const viewWorldW = viewW / scale;
  const viewWorldH = worldH;

  const centerX = playerGridX * TILE + TILE / 2;
  const cameraX = clamp(centerX - viewWorldW / 2, 0, Math.max(0, worldW - viewWorldW));

  return { cameraX, cameraY: 0, scale, viewWorldW, viewWorldH };
}

/** @deprecated Use computeCameraTransform */
export function computeCameraOffset(
  playerGridX: number,
  playerGridY: number,
  viewW: number = VIEWPORT_W * TILE,
  viewH: number = VIEWPORT_H * TILE,
): CameraOffset {
  const t = computeCameraTransform(playerGridX, viewW, viewH);
  return { cameraX: t.cameraX, cameraY: t.cameraY };
}

export function cullBoundsFromCamera(cam: CameraState): CullBounds {
  return {
    minX: cam.cameraX,
    minY: cam.cameraY,
    maxX: cam.cameraX + cam.viewWorldW,
    maxY: cam.cameraY + cam.viewWorldH,
  };
}
