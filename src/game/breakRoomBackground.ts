import { GRID_H, LEFT_DECOR_COLS, TILE } from './constants';

/** Place PNG at `public/break-room-bg.png` to replace the dummy background. */
export const BREAK_ROOM_BG_URL = '/break-room-bg.png';

let bgImage: HTMLImageElement | null = null;
let loadStarted = false;

export function loadBreakRoomBackground(): void {
  if (loadStarted || typeof Image === 'undefined') return;
  loadStarted = true;
  const img = new Image();
  img.decoding = 'async';
  img.src = BREAK_ROOM_BG_URL;
  img.onload = () => {
    bgImage = img;
  };
}

export function isBreakRoomBackgroundReady(): boolean {
  return bgImage != null && bgImage.complete && bgImage.naturalWidth > 0;
}

/** Draw the 10-column left illustration area (PNG or dummy placeholder). */
export function drawBreakRoomBackground(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  width: number,
  height: number,
) {
  if (isBreakRoomBackgroundReady() && bgImage) {
    ctx.drawImage(bgImage, ox, oy, width, height);
    return;
  }

  ctx.fillStyle = '#525860';
  ctx.fillRect(ox, oy, width, height);

  ctx.fillStyle = '#464c54';
  for (let ty = 0; ty < GRID_H; ty++) {
    for (let tx = 0; tx < LEFT_DECOR_COLS; tx++) {
      if ((tx + ty) % 2 === 0) continue;
      ctx.fillRect(ox + tx * TILE, oy + ty * TILE, TILE, TILE);
    }
  }

  ctx.fillStyle = 'rgba(200, 210, 220, 0.35)';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    'break-room-bg.png',
    ox + width / 2,
    oy + height / 2 - 8,
  );
  ctx.font = '9px monospace';
  ctx.fillStyle = 'rgba(200, 210, 220, 0.28)';
  ctx.fillText('(placeholder)', ox + width / 2, oy + height / 2 + 10);
}

export function decorWorldWidth(): number {
  return LEFT_DECOR_COLS * TILE;
}

export function decorWorldHeight(): number {
  return GRID_H * TILE;
}
