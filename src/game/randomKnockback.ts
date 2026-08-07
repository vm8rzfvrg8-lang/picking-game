import type { GameState, PlayerEntity, RivalEntity, Tile } from './constants';
import type { KnockbackTarget } from './knockback';
import {
  createKnockbackState,
  isKnockbackMoving,
  type KnockbackVisualOpts,
} from './knockback';

export type KnockbackReceivable = {
  knockback: PlayerEntity['knockback'];
  knockbackImmuneMs: number;
};
import { isWalkable } from './levelgen';

export const RANDOM_KB_OUTER_RADIUS = 2;
export const RANDOM_KB_FORCE = 2;
export const RANDOM_KB_DURATION_MS = 540;
export const RANDOM_KB_IMMUNE_MS = 380;
export const RANDOM_KB_PEAK_SCALE = 1.55;
export const RANDOM_KB_LIFT_PX = 22;

/** Musou arrival shockwave — 1 tile radius, 3 tile radial knockback. */
export const MUSOU_SHOCKWAVE_RADIUS = 2;
export const MUSOU_SHOCKWAVE_KB_DISTANCE = 5;
export const MUSOU_SHOCKWAVE_KB_DURATION_MS = 780;
export const MUSOU_SHOCKWAVE_KB_IMMUNE_MS = 420;

/** Outer ring of a 5×5 (Chebyshev distance exactly 2 from center). */
export function getOuterRingCells(centerX: number, centerY: number): { x: number; y: number }[] {
  const cells: { x: number; y: number }[] = [];
  for (let dx = -RANDOM_KB_OUTER_RADIUS; dx <= RANDOM_KB_OUTER_RADIUS; dx++) {
    for (let dy = -RANDOM_KB_OUTER_RADIUS; dy <= RANDOM_KB_OUTER_RADIUS; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) === RANDOM_KB_OUTER_RADIUS) {
        cells.push({ x: centerX + dx, y: centerY + dy });
      }
    }
  }
  return cells;
}

type OccupancyCheck = (
  x: number,
  y: number,
  target: KnockbackTarget,
) => boolean;

export function buildOccupancyCheck(state: GameState): OccupancyCheck {
  return (x, y, target) => {
    if (target.kind === 'player') {
      if (state.player.x === x && state.player.y === y) return true;
    } else {
      const rival = state.rivals.find((r) => r.id === target.id);
      if (rival && rival.x === x && rival.y === y) return true;
    }
    for (const r of state.rivals) {
      if (target.kind === 'rival' && r.id === target.id) continue;
      if (r.x === x && r.y === y) return true;
    }
    if (target.kind !== 'player' && state.player.x === x && state.player.y === y) return true;
    return false;
  };
}

export function pickRandomLandingCell(
  grid: Tile[][],
  centerX: number,
  centerY: number,
  isOccupied: (x: number, y: number) => boolean,
): { x: number; y: number } | null {
  const candidates = getOuterRingCells(centerX, centerY).filter(
    ({ x, y }) => isWalkable(grid, x, y) && !isOccupied(x, y),
  );
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function canReceiveRandomKnockback(entity: KnockbackReceivable): boolean {
  if (entity.knockbackImmuneMs > 0) return false;
  if (isKnockbackMoving(entity.knockback)) return false;
  return true;
}

/** Musou arrival shockwave — only skip targets already mid-flight. */
export function canReceiveMusouShockwave(entity: KnockbackReceivable): boolean {
  return !isKnockbackMoving(entity.knockback);
}

/** Chebyshev distance ≤ radius from center (excludes center cell). */
export function isInMusouShockwaveRadius(
  centerX: number,
  centerY: number,
  tx: number,
  ty: number,
  radius = MUSOU_SHOCKWAVE_RADIUS,
): boolean {
  const dx = tx - centerX;
  const dy = ty - centerY;
  if (dx === 0 && dy === 0) return false;
  return Math.max(Math.abs(dx), Math.abs(dy)) <= radius;
}

/** True while a random airborne launch or its post-hit immunity is active. */
export function isAirborneKnockbackActive(entity: KnockbackReceivable): boolean {
  if (entity.knockbackImmuneMs > 0) return true;
  return entity.knockback?.isAirborne === true && isKnockbackMoving(entity.knockback);
}

export function buildRandomKnockbackState(
  fromX: number,
  fromY: number,
  landX: number,
  landY: number,
  seed: number,
  visualOpts?: KnockbackVisualOpts,
) {
  const dx = landX - fromX;
  const dy = landY - fromY;
  const travel = Math.hypot(dx, dy);
  const kb = createKnockbackState(
    { x: dx, y: dy },
    travel > 0 ? travel : RANDOM_KB_FORCE,
    RANDOM_KB_DURATION_MS,
    seed,
    true,
    visualOpts ?? { peakScale: RANDOM_KB_PEAK_SCALE, liftPx: RANDOM_KB_LIFT_PX },
  );
  return {
    ...kb,
    snapTargetX: landX,
    snapTargetY: landY,
  };
}

/** Radial landing cell `distance` tiles outward from center through (fromX, fromY). */
export function pickRadialLandingCell(
  grid: Tile[][],
  centerX: number,
  centerY: number,
  fromX: number,
  fromY: number,
  distance: number,
  isOccupied: (x: number, y: number) => boolean,
): { x: number; y: number } | null {
  const dx = fromX - centerX;
  const dy = fromY - centerY;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return null;

  const dirX = dx / len;
  const dirY = dy / len;
  const candidates: { x: number; y: number }[] = [
    { x: Math.round(fromX + dirX * distance), y: Math.round(fromY + dirY * distance) },
  ];

  if (Math.abs(dx) >= Math.abs(dy)) {
    candidates.push({ x: fromX + Math.sign(dx) * distance, y: fromY });
  } else {
    candidates.push({ x: fromX, y: fromY + Math.sign(dy) * distance });
  }

  const seen = new Set<string>();
  for (const c of candidates) {
    const key = `${c.x},${c.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (isWalkable(grid, c.x, c.y) && !isOccupied(c.x, c.y)) return c;
  }

  for (let d = distance - 1; d >= 1; d--) {
    const fx = Math.round(fromX + dirX * d);
    const fy = Math.round(fromY + dirY * d);
    const key = `${fx},${fy}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (isWalkable(grid, fx, fy) && !isOccupied(fx, fy)) return { x: fx, y: fy };
  }

  return null;
}

export function buildRadialKnockbackState(
  fromX: number,
  fromY: number,
  landX: number,
  landY: number,
  seed: number,
  durationMs = MUSOU_SHOCKWAVE_KB_DURATION_MS,
  visualOpts?: KnockbackVisualOpts,
) {
  const dx = landX - fromX;
  const dy = landY - fromY;
  const travel = Math.hypot(dx, dy);
  const kb = createKnockbackState(
    { x: dx, y: dy },
    travel > 0 ? travel : MUSOU_SHOCKWAVE_KB_DISTANCE,
    durationMs,
    seed,
    true,
    visualOpts ?? { peakScale: RANDOM_KB_PEAK_SCALE, liftPx: RANDOM_KB_LIFT_PX },
  );
  return {
    ...kb,
    snapTargetX: landX,
    snapTargetY: landY,
  };
}

export function tickKnockbackImmune<T extends { knockbackImmuneMs: number }>(
  entity: T,
  dtMs: number,
): T {
  if (entity.knockbackImmuneMs <= 0) return entity;
  return { ...entity, knockbackImmuneMs: Math.max(0, entity.knockbackImmuneMs - dtMs) };
}

export function tickJamGuideHidden<T extends { jamGuideHiddenMs: number }>(
  entity: T,
  dtMs: number,
): T {
  if (entity.jamGuideHiddenMs <= 0) return entity;
  return { ...entity, jamGuideHiddenMs: Math.max(0, entity.jamGuideHiddenMs - dtMs) };
}
