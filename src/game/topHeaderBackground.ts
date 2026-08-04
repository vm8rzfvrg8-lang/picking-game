import { GRID_W, LEFT_DECOR_COLS, TOP_DECOR_ROWS, TILE } from './constants';

/** Place PNG at `public/top-header-bg.png` to replace the dummy background. */
export const TOP_HEADER_BG_URL = '/top-header-bg.png';

let bgImage: HTMLImageElement | null = null;
let loadStarted = false;

export function loadTopHeaderBackground(): void {
  if (loadStarted || typeof Image === 'undefined') return;
  loadStarted = true;
  const img = new Image();
  img.decoding = 'async';
  img.src = TOP_HEADER_BG_URL;
  img.onload = () => {
    bgImage = img;
  };
}

export function isTopHeaderBackgroundReady(): boolean {
  return bgImage != null && bgImage.complete && bgImage.naturalWidth > 0;
}

/** Draw the full-width top header strip (PNG or dark placeholder). */
export function drawTopHeaderBackground(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  width: number,
  height: number,
) {
  if (isTopHeaderBackgroundReady() && bgImage) {
    ctx.drawImage(bgImage, ox, oy, width, height);
    return;
  }

  ctx.fillStyle = '#0a0c14';
  ctx.fillRect(ox, oy, width, height);

  ctx.fillStyle = '#12151e';
  for (let tx = 0; tx < LEFT_DECOR_COLS + GRID_W; tx++) {
    if (tx % 3 !== 0) continue;
    ctx.fillRect(ox + tx * TILE, oy, TILE, height);
  }

  ctx.fillStyle = 'rgba(140, 150, 170, 0.22)';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('top-header-bg.png', ox + width / 2, oy + height / 2 - 6);
  ctx.font = '8px monospace';
  ctx.fillStyle = 'rgba(140, 150, 170, 0.16)';
  ctx.fillText('(placeholder)', ox + width / 2, oy + height / 2 + 8);
}

export function topHeaderWorldWidth(): number {
  return (LEFT_DECOR_COLS + GRID_W) * TILE;
}

export function topHeaderWorldHeight(): number {
  return TOP_DECOR_ROWS * TILE;
}
