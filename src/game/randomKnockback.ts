import type { GameState, PlayerEntity, RivalEntity, Tile } from './constants';
import type { KnockbackTarget } from './knockback';
import {
  createKnockbackState,
  isKnockbackMoving,
  type KnockbackVisualOpts,
} from './knockback';
import { isWalkable } from './levelgen';

export const RANDOM_KB_OUTER_RADIUS = 2;
export const RANDOM_KB_FORCE = 2;
export const RANDOM_KB_DURATION_MS = 540;
export const RANDOM_KB_IMMUNE_MS = 380;
export const RANDOM_KB_PEAK_SCALE = 1.55;
export const RANDOM_KB_LIFT_PX = 22;

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

export function canReceiveRandomKnockback(entity: {
  knockback: PlayerEntity['knockback'];
  knockbackImmuneMs: number;
}): boolean {
  if (entity.knockbackImmuneMs > 0) return false;
  if (isKnockbackMoving(entity.knockback)) return false;
  return true;
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
  const kb = createKnockbackState(
    { x: dx, y: dy },
    RANDOM_KB_FORCE,
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
