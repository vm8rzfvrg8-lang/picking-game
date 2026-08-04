import { COURSE_GOAL_X, COURSE_START_X, isGoalCell } from './levelgen';
import type { Tile } from './constants';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** 0..1 progress along the warehouse course (start hall → goal). */
export function courseProgressAt(
  grid: Tile[][],
  x: number,
  y: number,
  reachedGoal = false,
): number {
  if (reachedGoal || isGoalCell(grid, x, y)) return 1;
  const span = COURSE_GOAL_X - COURSE_START_X;
  if (span <= 0) return 0;
  return clamp((x - COURSE_START_X) / span, 0, 1);
}
