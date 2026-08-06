import type { Direction, Facing, GameState } from './constants';
import { PLAYER_COOLDOWN_MS } from './constants';
import type { GameEvent } from './events';
import {
  buildOccupancyCheck,
  buildRandomKnockbackState,
  canReceiveRandomKnockback,
  pickRandomLandingCell,
  RANDOM_KB_DURATION_MS,
  RANDOM_KB_IMMUNE_MS,
  tickJamGuideHidden,
  tickKnockbackImmune,
} from './randomKnockback';
import {
  facingFromKnockback,
  type KnockbackTarget,
} from './knockback';
import { beginBananaPeelFade } from './traps';
import {
  completeMusouRun,
  facingToVector,
  getPlayerMoveCooldown,
  isInHadouArc,
  isMusouRunning,
  isPushThroughActive,
} from './skills';
import { isWalkable } from './levelgen';

const FACING_FROM_DIR: Record<Direction, Facing> = {
  up: 'up',
  down: 'down',
  left: 'left',
  right: 'right',
};

function dirBetween(fx: number, fy: number, tx: number, ty: number): Direction | null {
  const dx = tx - fx;
  const dy = ty - fy;
  if (dx === 1) return 'right';
  if (dx === -1) return 'left';
  if (dy === 1) return 'down';
  if (dy === -1) return 'up';
  return null;
}

function findRivalAt(state: GameState, x: number, y: number, ignoreId?: number): number | null {
  for (let i = 0; i < state.rivals.length; i++) {
    const r = state.rivals[i];
    if (ignoreId != null && r.id === ignoreId) continue;
    if (r.x === x && r.y === y) return i;
  }
  return null;
}

export function tickSkillEntityTimers(state: GameState, dtMs: number): GameState {
  let player = tickKnockbackImmune(tickJamGuideHidden(state.player, dtMs), dtMs);
  const rivals = state.rivals.map((r) => {
    let next = tickKnockbackImmune(tickJamGuideHidden(r, dtMs), dtMs);
    if (next.jamGuideHiddenMs === 0 && next.jamStun) {
      next = { ...next, jamStun: false };
    }
    return next;
  });
  if (player === state.player && rivals.every((r, i) => r === state.rivals[i])) return state;
  return { ...state, player, rivals, version: state.version + 1 };
}

function applyRandomKnockbackToTarget(
  state: GameState,
  centerX: number,
  centerY: number,
  target: KnockbackTarget,
  events: GameEvent[],
): GameState {
  const isOccupied = buildOccupancyCheck(state);
  const landing = pickRandomLandingCell(state.grid, centerX, centerY, (x, y) =>
    isOccupied(x, y, target),
  );
  if (!landing) return state;

  const seed = Math.floor(Math.random() * 10000);
  const kb = buildRandomKnockbackState(centerX, centerY, landing.x, landing.y, seed);
  const facing = facingFromKnockback({ x: landing.x - centerX, y: landing.y - centerY });

  if (target.kind === 'player') {
    if (!canReceiveRandomKnockback(state.player)) return state;
    let s = { ...state, version: state.version + 1 };
    if (s.isPicking) {
      s = { ...s, isPicking: false, pickProgress: 0 };
      events.push({ type: 'pickCancel', who: 'player' });
    }
    s.player = {
      ...s.player,
      knockback: kb,
      stun: RANDOM_KB_DURATION_MS,
      facing,
      knockbackImmuneMs: RANDOM_KB_DURATION_MS + RANDOM_KB_IMMUNE_MS,
    };
    events.push({
      type: 'knockback',
      who: 'player',
      x: s.player.x,
      y: s.player.y,
      dirX: kb.dirX,
      dirY: kb.dirY,
      force: kb.totalDistance,
      durationMs: RANDOM_KB_DURATION_MS,
      seed,
      isAirborne: true,
      randomLaunch: true,
    });
    return s;
  }

  const rivalIndex = state.rivals.findIndex((r) => r.id === target.id);
  if (rivalIndex < 0) return state;
  const rival = state.rivals[rivalIndex];
  if (!canReceiveRandomKnockback(rival)) return state;

  let nextRival = { ...rival };
  if (nextRival.isPicking) {
    nextRival = { ...nextRival, isPicking: false, pickProgress: 0 };
    events.push({ type: 'pickCancel', who: 'rival' });
  }
  nextRival = {
    ...nextRival,
    knockback: kb,
    stun: RANDOM_KB_DURATION_MS,
    facing,
    knockbackImmuneMs: RANDOM_KB_DURATION_MS + RANDOM_KB_IMMUNE_MS,
  };

  const rivals = [...state.rivals];
  rivals[rivalIndex] = nextRival;
  events.push({
    type: 'knockback',
    who: 'rival',
    rivalId: target.id,
    x: nextRival.x,
    y: nextRival.y,
    dirX: kb.dirX,
    dirY: kb.dirY,
    force: kb.totalDistance,
    durationMs: RANDOM_KB_DURATION_MS,
    seed,
    isAirborne: true,
    randomLaunch: true,
  });

  return { ...state, rivals, version: state.version + 1 };
}

function clearBananaAt(state: GameState, x: number, y: number): GameState {
  const idx = state.traps.findIndex((t) => t.kind === 'bananaPeel' && t.x === x && t.y === y && t.active);
  if (idx < 0) return state;
  const traps = [...state.traps];
  const fwd = facingToVector(state.player.facing);
  traps[idx] = beginBananaPeelFade(traps[idx], { x: fwd.x, y: fwd.y });
  return { ...state, traps, version: state.version + 1 };
}

export function stepMusouRun(state: GameState, dtMs: number, events: GameEvent[]): GameState {
  if (!isMusouRunning(state) || !state.musouRunPath) return state;

  let s = state;
  const stepMs = getPlayerMoveCooldown(PLAYER_COOLDOWN_MS, s.skills, s);
  s = { ...s, musouStepAccum: s.musouStepAccum + dtMs };

  while (s.musouStepAccum >= stepMs && s.musouRunPath && s.musouRunIndex < s.musouRunPath.length) {
    s.musouStepAccum -= stepMs;
    const next = s.musouRunPath[s.musouRunIndex];
    const fromX = s.player.x;
    const fromY = s.player.y;
    const dir = dirBetween(fromX, fromY, next.x, next.y);
    if (!dir || !isWalkable(s.grid, next.x, next.y)) {
      s = completeMusouRun(s);
      events.push({ type: 'musouComplete' });
      break;
    }

    const rivalIdx = findRivalAt(s, next.x, next.y);
    if (rivalIdx != null) {
      s = applyRandomKnockbackToTarget(
        s,
        next.x,
        next.y,
        { kind: 'rival', id: s.rivals[rivalIdx].id },
        events,
      );
    }

    s = clearBananaAt(s, next.x, next.y);

    s = {
      ...s,
      player: {
        ...s.player,
        x: next.x,
        y: next.y,
        facing: FACING_FROM_DIR[dir],
        lastMoveDir: dir,
      },
      musouRunIndex: s.musouRunIndex + 1,
      version: s.version + 1,
    };
    events.push({ type: 'move', who: 'player', fromX, fromY, dir });
    events.push({ type: 'musouStep', x: next.x, y: next.y });
  }

  if (s.musouRunPath && s.musouRunIndex >= s.musouRunPath.length) {
    s = completeMusouRun(s);
    events.push({ type: 'musouComplete' });
  }

  return s;
}

export function stepHadouEffects(state: GameState, events: GameEvent[]): GameState {
  if (!isPushThroughActive(state.skills)) return state;

  const px = state.player.x;
  const py = state.player.y;
  const facing = state.player.facing;
  let s = state;

  for (let i = 0; i < s.rivals.length; i++) {
    const rival = s.rivals[i];
    if (!isInHadouArc(px, py, facing, rival.x, rival.y)) continue;
    if (!canReceiveRandomKnockback(rival)) continue;
    s = applyRandomKnockbackToTarget(s, rival.x, rival.y, { kind: 'rival', id: rival.id }, events);
  }

  let trapsChanged = false;
  const traps = s.traps.map((trap) => {
    if (!trap.active || trap.kind !== 'bananaPeel') return trap;
    if (!isInHadouArc(px, py, facing, trap.x, trap.y)) return trap;
    trapsChanged = true;
    return beginBananaPeelFade(trap, facingToVector(facing));
  });

  if (trapsChanged) {
    s = { ...s, traps, version: s.version + 1 };
  }

  return s;
}

export function tryMusouBananaPass(
  state: GameState,
  x: number,
  y: number,
): GameState {
  if (!isMusouRunning(state)) return state;
  return clearBananaAt(state, x, y);
}

export { applyRandomKnockbackToTarget };
