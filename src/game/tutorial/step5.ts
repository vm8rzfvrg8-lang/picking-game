import { SkillType, isSuperSpeedActive } from '../skills';
import type { GameState } from '../engine';
import type { TutorialCheckContext, TutorialStats } from './types';
import {
  TUTORIAL_STEP5_BLOCKER,
  TUTORIAL_STEP5_JAM_RIVAL_SHELF,
  TUTORIAL_STEP5_REACH,
  TUTORIAL_STEP5_SHELF,
  TUTORIAL_SUPER_SPEED_PICK_WINDOW_MS,
} from './constants';

export type TutorialSubStep = 1 | 2 | 3;

export interface TutorialSubStepConfig {
  subStep: TutorialSubStep;
  instructionText: string;
  skill: SkillType;
  checkClear: (ctx: TutorialCheckContext) => boolean;
}

export const TUTORIAL_STEP5_SUBSTEPS: TutorialSubStepConfig[] = [
  {
    subStep: 1,
    skill: SkillType.SuperSpeed,
    instructionText: 'スキルを使って遠くの棚まで「超早歩き」しよう！',
    checkClear: ({ stats }) => stats.step5SuperSpeedCleared,
  },
  {
    subStep: 2,
    skill: SkillType.PushThrough,
    instructionText: '邪魔な相手を「ゴリ押し」で跳ね除けて進もう！',
    checkClear: ({ stats }) => stats.step5PushThroughCleared,
  },
  {
    subStep: 3,
    skill: SkillType.JamSignal,
    instructionText: '「妨害電波」で相手の端末をフリーズさせよう！',
    checkClear: ({ stats }) => stats.step5JamSignalCleared,
  },
];

export function isAtTutorialReachCell(
  ctx: TutorialCheckContext,
): boolean {
  const { game } = ctx;
  if (!game.tutorialReachCell) return false;
  return (
    game.player.x === game.tutorialReachCell.x &&
    game.player.y === game.tutorialReachCell.y
  );
}

/** Whether the given pick index refers to the step 5-1 target shelf. */
export function isStep5PickTarget(game: GameState, pickIndex: number): boolean {
  const target = game.targets[pickIndex];
  if (!target) return false;
  return target.x === TUTORIAL_STEP5_SHELF.x && target.y === TUTORIAL_STEP5_SHELF.y;
}

export function isAdjacentToStep5Shelf(game: GameState): boolean {
  const dx = Math.abs(game.player.x - TUTORIAL_STEP5_SHELF.x);
  const dy = Math.abs(game.player.y - TUTORIAL_STEP5_SHELF.y);
  return dx + dy === 1;
}

export function hasStep5SuperSpeedRequirement(game: GameState, stats: TutorialStats): boolean {
  return (
    stats.step5SuperSpeedUsed ||
    stats.step5SuperSpeedUsedAt !== null ||
    isSuperSpeedActive(game.skills)
  );
}

/**
 * Step 5-1 clear: super speed used (or active) + pick completed at the target shelf.
 * pickIndex is taken from pickDone event (before currentTarget advances in checks).
 */
export function evaluateStep5SuperSpeedClear(
  game: GameState,
  stats: TutorialStats,
  pickIndex?: number,
): boolean {
  if (game.tutorialSubStep !== 1) return false;
  if (!hasStep5SuperSpeedRequirement(game, stats)) return false;
  if (pickIndex !== undefined) {
    return isStep5PickTarget(game, pickIndex);
  }
  return isAdjacentToStep5Shelf(game) && stats.step5SuperSpeedPickGaugeFull;
}

/** @deprecated Use isStep5PickTarget — kept for legacy call sites. */
export function isStep5TargetShelf(ctx: TutorialCheckContext): boolean {
  return isStep5PickTarget(ctx.game, 0);
}

export { TUTORIAL_STEP5_SHELF, TUTORIAL_STEP5_REACH, TUTORIAL_STEP5_BLOCKER, TUTORIAL_STEP5_JAM_RIVAL_SHELF, TUTORIAL_SUPER_SPEED_PICK_WINDOW_MS };
