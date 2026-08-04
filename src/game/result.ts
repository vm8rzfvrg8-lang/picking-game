import type { GameState } from './constants';
import { isGoalCell } from './levelgen';

export type FinishEntry = { kind: 'player' } | { kind: 'rival'; id: number };

/** Rank placement bonus (1st = index 0). */
export const RANK_BONUS_COINS = [400, 280, 200, 140, 100, 80, 60, 40] as const;

export function formatRankLabel(rank: number): string {
  const teen = rank % 100;
  const ones = rank % 10;
  if (teen >= 11 && teen <= 13) return `${rank}th`;
  if (ones === 1) return `${rank}st`;
  if (ones === 2) return `${rank}nd`;
  if (ones === 3) return `${rank}rd`;
  return `${rank}th`;
}

export function rankBonusCoins(rank: number): number {
  const idx = Math.max(0, Math.min(rank - 1, RANK_BONUS_COINS.length - 1));
  return RANK_BONUS_COINS[idx];
}

export function computeTotalCoins(rank: number, maxPickCombo: number): number {
  return rankBonusCoins(rank) + maxPickCombo * 10;
}

export function playerReachedGoal(game: GameState): boolean {
  return (
    game.currentTarget >= game.pickCount &&
    isGoalCell(game.grid, game.player.x, game.player.y)
  );
}

/** Player placement among all racers (1 = first to finish). */
export function computePlayerRank(game: GameState): number {
  const idx = game.finishOrder.findIndex((e) => e.kind === 'player');
  if (idx >= 0) return idx + 1;
  return game.finishOrder.length + 1;
}

export function registerFinish(
  state: GameState,
  entry: FinishEntry,
): GameState {
  const exists = state.finishOrder.some((e) => {
    if (entry.kind === 'player') return e.kind === 'player';
    return e.kind === 'rival' && e.id === entry.id;
  });
  if (exists) return state;
  return { ...state, finishOrder: [...state.finishOrder, entry] };
}
