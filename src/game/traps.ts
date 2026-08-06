import {
  Direction,
  Facing,
  GameState,
  GRID_H,
  GRID_W,
  TILE,
  TrapEntity,
} from './constants';
import type { KnockbackDirection } from './knockback';
import { normalizeKnockbackDirection } from './knockback';
import { getBananaPeelImage } from './bananaPeelSprite';
import {
  GOAL_CELLS,
  isStartCorridorX,
  isSubAisleX,
  isWalkable,
  MAIN_AISLE_Y_BOTTOM,
  MAIN_AISLE_Y_TOP,
  type Rng,
} from './levelgen';

export const BANANA_PEEL_COUNT = 12;
/** ~4× previous force — long low slide across multiple tiles. */
export const BANANA_SLIP_FORCE = 7.5;
export const BANANA_SLIP_DURATION_MS = 520;
export const BANANA_PEAK_SCALE = 1.2;
export const BANANA_LIFT_PX = 10;

/** Peel fade-out after stepped on (~0.18s). */
export const BANANA_PEEL_FADE_MS = 180;
/** How far the peel sprite slides (px) along slip direction during fade. */
export const BANANA_PEEL_SLIDE_PX = 18;

const SLIP_DELTA: Record<Direction, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

function createIdleTrap(cell: { x: number; y: number }, id: number): TrapEntity {
  return {
    id,
    kind: 'bananaPeel',
    x: cell.x,
    y: cell.y,
    active: true,
    fadeMs: 0,
    fadeDirX: 0,
    fadeDirY: 0,
    fadeSlideX: 0,
    fadeSlideY: 0,
  };
}

function isBananaCandidateCell(grid: GameState['grid'], x: number, y: number): boolean {
  if (grid[y]?.[x] !== 'F') return false;
  if (!isWalkable(grid, x, y)) return false;
  if (isStartCorridorX(x)) return false;
  if (x < 8 || x >= GRID_W - 4) return false;
  if (GOAL_CELLS.some((g) => g.x === x && g.y === y)) return false;
  return y === MAIN_AISLE_Y_TOP || y === MAIN_AISLE_Y_BOTTOM || isSubAisleX(x);
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

/** Seed-driven banana peel placement on walkable aisle tiles. */
export function placeBananaPeels(
  grid: GameState['grid'],
  rng: Rng,
  count = BANANA_PEEL_COUNT,
  reserved: ReadonlyArray<{ x: number; y: number }> = [],
): TrapEntity[] {
  const reservedKeys = new Set(reserved.map((c) => cellKey(c.x, c.y)));
  const candidates: { x: number; y: number }[] = [];
  for (let y = 1; y < GRID_H - 1; y++) {
    for (let x = 1; x < GRID_W - 1; x++) {
      if (reservedKeys.has(cellKey(x, y))) continue;
      if (isBananaCandidateCell(grid, x, y)) candidates.push({ x, y });
    }
  }

  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  const spacing = 3;
  const placed: TrapEntity[] = [];
  const usedKeys = new Set<string>();

  for (const cell of candidates) {
    if (placed.length >= count) break;
    const key = cellKey(cell.x, cell.y);
    if (usedKeys.has(key)) continue;

    let tooClose = false;
    for (const p of placed) {
      if (Math.abs(p.x - cell.x) + Math.abs(p.y - cell.y) < spacing) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    placed.push(createIdleTrap(cell, placed.length));
    usedKeys.add(key);
  }

  return placed;
}

export function slipDirectionFromFacing(
  facing: Facing,
  lastMoveDir: Direction | null,
): KnockbackDirection {
  const dir = lastMoveDir ?? facing;
  return SLIP_DELTA[dir];
}

export function findActiveBananaPeelIndex(state: GameState, x: number, y: number): number {
  return state.traps.findIndex(
    (t) => t.active && t.fadeMs === 0 && t.kind === 'bananaPeel' && t.x === x && t.y === y,
  );
}

export function isBananaPeelVisible(trap: TrapEntity): boolean {
  return trap.kind === 'bananaPeel' && (trap.active || trap.fadeMs > 0);
}

/** Start peel fade/slide after a character steps on it. */
export function beginBananaPeelFade(trap: TrapEntity, slipDir: KnockbackDirection): TrapEntity {
  const { x: fadeDirX, y: fadeDirY } = normalizeKnockbackDirection(slipDir);
  return {
    ...trap,
    active: false,
    fadeMs: BANANA_PEEL_FADE_MS,
    fadeDirX,
    fadeDirY,
    fadeSlideX: 0,
    fadeSlideY: 0,
  };
}

/** Advance fade-out animations; removes fully faded traps. */
export function tickTrapAnimations(traps: TrapEntity[], dtMs: number): TrapEntity[] {
  const next: TrapEntity[] = [];
  for (const trap of traps) {
    if (trap.fadeMs > 0) {
      const fadeMs = Math.max(0, trap.fadeMs - dtMs);
      if (fadeMs <= 0) continue;
      const t = 1 - fadeMs / BANANA_PEEL_FADE_MS;
      next.push({
        ...trap,
        fadeMs,
        fadeSlideX: trap.fadeDirX * BANANA_PEEL_SLIDE_PX * t,
        fadeSlideY: trap.fadeDirY * BANANA_PEEL_SLIDE_PX * t,
      });
    } else if (trap.active) {
      next.push(trap);
    }
  }
  return next;
}

export interface BananaPeelDrawOpts {
  slideX?: number;
  slideY?: number;
  opacity?: number;
}

/** Draw banana peel sprite — no rotation; image orientation as authored. */
export function drawBananaPeelAt(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  opts: BananaPeelDrawOpts = {},
) {
  const img = getBananaPeelImage();
  if (!img) return;

  const slideX = opts.slideX ?? 0;
  const slideY = opts.slideY ?? 0;
  const opacity = opts.opacity ?? 1;

  const ox = gx * TILE + TILE / 2 + slideX;
  const oy = gy * TILE + TILE / 2 + slideY;
  const maxSize = TILE * 0.96;
  const scale = Math.min(maxSize / img.naturalWidth, maxSize / img.naturalHeight);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = opacity;
  ctx.drawImage(img, Math.round(ox - w / 2), Math.round(oy - h / 2), w, h);
  ctx.restore();
}

export function drawTraps(
  ctx: CanvasRenderingContext2D,
  traps: TrapEntity[],
  _blink: number,
  cull?: { minGX: number; maxGX: number; minGY: number; maxGY: number },
) {
  for (const trap of traps) {
    if (!isBananaPeelVisible(trap)) continue;
    if (cull && (trap.x < cull.minGX || trap.x > cull.maxGX || trap.y < cull.minGY || trap.y > cull.maxGY)) {
      continue;
    }
    const opacity =
      trap.fadeMs > 0 ? Math.max(0, trap.fadeMs / BANANA_PEEL_FADE_MS) : 1;
    drawBananaPeelAt(ctx, trap.x, trap.y, {
      slideX: trap.fadeSlideX,
      slideY: trap.fadeSlideY,
      opacity,
    });
  }
}
