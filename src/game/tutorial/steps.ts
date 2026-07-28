import { isGoalCell } from '../levelgen';
import type { TutorialStepConfig } from './types';

export const TUTORIAL_COLLISION_REQUIRED = 3;
export const TUTORIAL_KNOCKBACK_SETTLE_MS = 300;

export const TUTORIAL_STEP_CONFIGS: TutorialStepConfig[] = [
  {
    step: 1,
    instructionText: '移動して、光る本棚の隣で方向キーを長押しし1冊ピックしよう！',
    checkClear: ({ stats, recentEvents }) =>
      stats.pickDoneCount >= 1 ||
      recentEvents.some((e) => e.type === 'pickDone' && e.who === 'player'),
  },
  {
    step: 2,
    instructionText: '取得した本を右端のゴール（シャッター）まで搬送しよう！',
    checkClear: ({ game }) => isGoalCell(game.grid, game.player.x, game.player.y),
  },
  {
    step: 3,
    instructionText: '順路で進み、逆走するCPUにぶつかって相手を3回押し出そう！',
    postClearDelayMs: TUTORIAL_KNOCKBACK_SETTLE_MS,
    checkClear: ({ stats }) => stats.playerPushRivalCount >= TUTORIAL_COLLISION_REQUIRED,
  },
  {
    step: 4,
    instructionText: '逆走してCPUにぶつかり、ノックバックを3回受けよう！',
    postClearDelayMs: TUTORIAL_KNOCKBACK_SETTLE_MS,
    checkClear: ({ stats }) =>
      stats.playerWrongWayKnockbackCount >= TUTORIAL_COLLISION_REQUIRED,
  },
  {
    step: 5,
    instructionText: '特殊スキルの使い方をマスターしよう！',
    checkClear: () => false,
  },
];
