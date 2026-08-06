import type { Facing, Tile } from './constants';
import { isWalkable } from './levelgen';

/** Active knockback motion + stun timing for a character. */
export interface KnockbackState {
  dirX: number;
  dirY: number;
  /** Travel speed in tiles per second. */
  speed: number;
  /** Remaining travel distance in tiles. */
  distanceLeft: number;
  /** Initial travel distance (for motion progress). */
  totalDistance: number;
  /** Sub-cell slide offset from integer grid anchor (x, y). */
  slideX: number;
  slideY: number;
  /** Remaining stun from this knockback (ms). */
  stunMs: number;
  /** Total stun duration when launched (ms). */
  durationMs: number;
  /** Visual FX phase accumulator. */
  fxPhase: number;
  /** Seed for SFX / VFX variation. */
  seed: number;
  /** True = flashy airborne roll + scale arc (traps / bombs). */
  isAirborne: boolean;
  /** Override peak scale for low airborne slips (e.g. banana = 1.2). */
  peakScale?: number;
  /** Override parabolic lift height in px (visual only). */
  liftPx?: number;
  /** Snap to this cell when motion completes (random knockback landing). */
  snapTargetX?: number;
  snapTargetY?: number;
}

export interface KnockbackVisualOpts {
  peakScale?: number;
  liftPx?: number;
}

export type KnockbackDirection = { x: number; y: number } | { angle: number };

export type KnockbackTarget = { kind: 'player' } | { kind: 'rival'; id: number };

const MIN_FORCE = 0.25;
const MAX_FORCE = 12;
const MIN_DURATION_MS = 120;

export function normalizeKnockbackDirection(dir: KnockbackDirection): { x: number; y: number } {
  if ('angle' in dir) {
    return { x: Math.cos(dir.angle), y: Math.sin(dir.angle) };
  }
  const len = Math.hypot(dir.x, dir.y);
  if (len < 1e-6) return { x: 0, y: 0 };
  return { x: dir.x / len, y: dir.y / len };
}

export function facingFromKnockback(dir: KnockbackDirection): Facing {
  const { x, y } = normalizeKnockbackDirection(dir);
  if (Math.abs(x) >= Math.abs(y)) return x >= 0 ? 'right' : 'left';
  return y >= 0 ? 'down' : 'up';
}

export function createKnockbackState(
  dir: KnockbackDirection,
  force: number,
  durationMs: number,
  seed: number,
  isAirborne = false,
  visualOpts?: KnockbackVisualOpts,
): KnockbackState {
  const { x: dirX, y: dirY } = normalizeKnockbackDirection(dir);
  const distance = Math.max(MIN_FORCE, Math.min(MAX_FORCE, force));
  const duration = Math.max(MIN_DURATION_MS, durationMs);
  return {
    dirX,
    dirY,
    speed: distance / (duration / 1000),
    distanceLeft: distance,
    totalDistance: distance,
    slideX: 0,
    slideY: 0,
    stunMs: duration,
    durationMs: duration,
    fxPhase: 0,
    seed,
    isAirborne,
    peakScale: visualOpts?.peakScale,
    liftPx: visualOpts?.liftPx,
  };
}

export function getKnockbackMotionProgress(kb: KnockbackState): number {
  if (kb.totalDistance <= 0) return 1;
  return Math.max(0, Math.min(1, 1 - kb.distanceLeft / kb.totalDistance));
}

function airbornePeakScale(seed: number): number {
  return 1.5 + (seed % 4) * 0.1;
}

function resolvePeakScale(kb: KnockbackState): number {
  return kb.peakScale ?? airbornePeakScale(kb.seed);
}

/** Scale arc: 1.0 → peak at mid-flight → 1.0 on landing. Visual only. */
export function getAirborneVisualScale(kb: KnockbackState): number {
  if (!isKnockbackMoving(kb)) return 1;
  const t = getKnockbackMotionProgress(kb);
  const peak = resolvePeakScale(kb);
  if (t <= 0.5) return 1 + (peak - 1) * (t / 0.5);
  return peak - (peak - 1) * ((t - 0.5) / 0.5);
}

/** Parabolic lift in pixels — visual only, does not affect collision. */
export function getAirborneVisualLiftPx(kb: KnockbackState): number {
  if (!isKnockbackMoving(kb)) return 0;
  const t = getKnockbackMotionProgress(kb);
  const maxLift = kb.liftPx ?? 20;
  return Math.sin(t * Math.PI) * maxLift;
}

/** Fast roll rotation in radians — visual only. */
export function getAirborneSpinRad(kb: KnockbackState): number {
  return kb.fxPhase;
}

/** Draw-time FX bundle; undefined when no airborne visuals apply. */
export interface KnockbackDrawFx {
  isAirborne: true;
  scale: number;
  liftPx: number;
  spinRad: number;
  phase: number;
}

export function getKnockbackDrawFx(kb: KnockbackState | null | undefined): KnockbackDrawFx | undefined {
  if (!kb?.isAirborne) return undefined;
  const moving = isKnockbackMoving(kb);
  return {
    isAirborne: true,
    scale: moving ? getAirborneVisualScale(kb) : 1,
    liftPx: moving ? getAirborneVisualLiftPx(kb) : 0,
    spinRad: moving ? getAirborneSpinRad(kb) : 0,
    phase: kb.fxPhase,
  };
}

export function isKnockbackMoving(kb: KnockbackState | null | undefined): boolean {
  return kb != null && kb.distanceLeft > 0.001;
}

export function getKnockbackVisualOffset(entity: {
  x: number;
  y: number;
  knockback?: KnockbackState | null;
}): { x: number; y: number } {
  if (!entity.knockback) return { x: entity.x, y: entity.y };
  return {
    x: entity.x + entity.knockback.slideX,
    y: entity.y + entity.knockback.slideY,
  };
}

export interface KnockbackTickResult {
  x: number;
  y: number;
  knockback: KnockbackState | null;
  stun: number;
  hitWall: boolean;
}

function tryStepCell(
  grid: Tile[][],
  x: number,
  y: number,
  stepX: number,
  stepY: number,
  isBlocked?: (nx: number, ny: number) => boolean,
): { x: number; y: number; blocked: boolean } {
  const nx = x + stepX;
  const ny = y + stepY;
  if (!isWalkable(grid, nx, ny) || isBlocked?.(nx, ny)) {
    return { x, y, blocked: true };
  }
  return { x: nx, y: ny, blocked: false };
}

/** Advance knockback motion for one entity; decrements stun each tick. */
export function tickKnockbackEntity(
  entity: {
    x: number;
    y: number;
    stun: number;
    knockback: KnockbackState | null;
  },
  grid: Tile[][],
  dtMs: number,
  isBlocked?: (nx: number, ny: number) => boolean,
): KnockbackTickResult {
  let { x, y, stun, knockback } = entity;
  let hitWall = false;

  stun = Math.max(0, stun - dtMs);
  if (!knockback) {
    return { x, y, knockback: null, stun, hitWall };
  }

  knockback = { ...knockback };
  knockback.fxPhase += dtMs * (knockback.isAirborne ? 0.048 : 0.008);
  knockback.stunMs = Math.max(0, knockback.stunMs - dtMs);
  stun = Math.max(stun, knockback.stunMs);

  if (knockback.distanceLeft > 0.001) {
    const dtSec = dtMs / 1000;
    let move = Math.min(knockback.speed * dtSec, knockback.distanceLeft);
    knockback.distanceLeft -= move;
    knockback.slideX += knockback.dirX * move;
    knockback.slideY += knockback.dirY * move;

    let guard = 0;
    while (
      (Math.abs(knockback.slideX) >= 1 || Math.abs(knockback.slideY) >= 1) &&
      guard < 8
    ) {
      guard++;
      const absX = Math.abs(knockback.slideX);
      const absY = Math.abs(knockback.slideY);
      let stepX = 0;
      let stepY = 0;

      if (absX >= absY && absX >= 1) {
        stepX = Math.sign(knockback.slideX);
      } else if (absY >= 1) {
        stepY = Math.sign(knockback.slideY);
      } else {
        break;
      }

      const stepped = tryStepCell(grid, x, y, stepX, stepY, isBlocked);
      if (stepped.blocked) {
        hitWall = true;
        knockback.slideX = 0;
        knockback.slideY = 0;
        knockback.distanceLeft = 0;
        break;
      }

      x = stepped.x;
      y = stepped.y;
      if (stepX !== 0) knockback.slideX -= stepX;
      if (stepY !== 0) knockback.slideY -= stepY;
    }
  }

  if (knockback.distanceLeft <= 0.001) {
    knockback.slideX = 0;
    knockback.slideY = 0;
    knockback.distanceLeft = 0;
    if (knockback.snapTargetX != null && knockback.snapTargetY != null) {
      x = knockback.snapTargetX;
      y = knockback.snapTargetY;
    }
  }

  if (!isKnockbackMoving(knockback)) {
    knockback = null;
  }

  return { x, y, knockback, stun, hitWall };
}
