import { GRID_H, GRID_W, LEFT_DECOR_COLS, TOP_DECOR_ROWS, TILE, VIEWPORT_H, VIEWPORT_W } from './constants';

export interface CameraOffset {
  cameraX: number;
  cameraY: number;
}

export interface CameraState extends CameraOffset {
  /** World-to-screen scale (zoom so ~VIEWPORT_W×VIEWPORT_H tiles fit). */
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

/** World-space X for a grid column (includes left decor padding). */
export function gridWorldX(gridX: number): number {
  return (gridX + LEFT_DECOR_COLS) * TILE;
}

/** World-space Y for a grid row (includes top header padding). */
export function gridWorldY(gridY: number): number {
  return (gridY + TOP_DECOR_ROWS) * TILE;
}

/** Pixel offsets applied before grid-local drawing passes. */
export function gridDecorOffset(): { x: number; y: number } {
  return { x: LEFT_DECOR_COLS * TILE, y: TOP_DECOR_ROWS * TILE };
}

/** ~10-tile zoom; smooth-follow player center in X and Y. */
export function computeCameraTransform(
  playerGridX: number,
  playerGridY: number,
  viewW: number,
  viewH: number,
): CameraState {
  const worldH = (GRID_H + TOP_DECOR_ROWS) * TILE;
  const worldW = (GRID_W + LEFT_DECOR_COLS) * TILE;
  const scale = Math.min(
    viewW / (VIEWPORT_W * TILE),
    viewH / (VIEWPORT_H * TILE),
  );
  const viewWorldW = viewW / scale;
  const viewWorldH = viewH / scale;

  const centerX = gridWorldX(playerGridX) + TILE / 2;
  const centerY = gridWorldY(playerGridY) + TILE / 2;
  const cameraX = clamp(centerX - viewWorldW / 2, 0, Math.max(0, worldW - viewWorldW));
  const cameraY = clamp(centerY - viewWorldH / 2, 0, Math.max(0, worldH - viewWorldH));

  return { cameraX, cameraY, scale, viewWorldW, viewWorldH };
}

/** @deprecated Use computeCameraTransform */
export function computeCameraOffset(
  playerGridX: number,
  playerGridY: number,
  viewW: number = VIEWPORT_W * TILE,
  viewH: number = VIEWPORT_H * TILE,
): CameraOffset {
  const t = computeCameraTransform(playerGridX, playerGridY, viewW, viewH);
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
