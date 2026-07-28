import type { GameEvent, GameState } from '../engine';
import { SkillType } from '../skills';
import { isPushThroughActive } from '../skills';
import { TUTORIAL_COLLISION_REQUIRED } from './steps';
import {
  evaluateStep5SuperSpeedClear,
  hasStep5SuperSpeedRequirement,
  isAdjacentToStep5Shelf,
  isAtTutorialReachCell,
} from './step5';
import type { TutorialSubStep } from './step5';

export type TutorialStepNumber = 1 | 2 | 3 | 4 | 5;

export type TutorialPhase = 'active' | 'clearPending' | 'transitioning' | 'complete';

export interface TutorialStats {
  pickDoneCount: number;
  playerWrongWayKnockbackCount: number;
  playerPushRivalCount: number;
  step5SuperSpeedUsedAt: number | null;
  step5SuperSpeedUsed: boolean;
  step5SuperSpeedPickGaugeFull: boolean;
  step5SuperSpeedCleared: boolean;
  step5PushThroughUsed: boolean;
  step5PushKnockback: boolean;
  step5PushThroughCleared: boolean;
  step5JamUsedWhileRivalPicking: boolean;
  step5JamSignalCleared: boolean;
}

export interface TutorialCheckContext {
  game: GameState;
  recentEvents: readonly GameEvent[];
  stats: TutorialStats;
}

export interface TutorialStepProgress {
  label: string;
  done: number;
  total: number;
  remaining: number;
}

export interface TutorialStepConfig {
  step: TutorialStepNumber;
  instructionText: string;
  checkClear: (ctx: TutorialCheckContext) => boolean;
  postClearDelayMs?: number;
}

export interface TutorialStepState {
  step: TutorialStepNumber;
  instructionText: string;
  cleared: boolean;
  checkClear: (ctx: TutorialCheckContext) => boolean;
  postClearDelayMs: number;
}

export interface TutorialSnapshot {
  currentStep: TutorialStepNumber;
  totalSteps: number;
  steps: readonly Pick<TutorialStepState, 'step' | 'instructionText' | 'cleared'>[];
  phase: TutorialPhase;
  transitionProgress: number;
  instructionText: string;
  isComplete: boolean;
  stepProgress: TutorialStepProgress | null;
  currentSubStep: TutorialSubStep | null;
  clearedSubStep: TutorialSubStep | null;
  completionMessage: string | null;
}

export type TutorialCallback =
  | { type: 'stepCleared'; step: TutorialStepNumber }
  | { type: 'stepStarted'; step: TutorialStepNumber }
  | { type: 'subStepStarted'; step: 5; subStep: TutorialSubStep }
  | { type: 'subStepCleared'; step: 5; subStep: TutorialSubStep }
  | { type: 'tutorialComplete' }
  | { type: 'returnToStart' };

export interface TutorialUpdateResult {
  snapshot: TutorialSnapshot;
  callbacks: TutorialCallback[];
}

export function createTutorialStats(): TutorialStats {
  return {
    pickDoneCount: 0,
    playerWrongWayKnockbackCount: 0,
    playerPushRivalCount: 0,
    step5SuperSpeedUsedAt: null,
    step5SuperSpeedUsed: false,
    step5SuperSpeedPickGaugeFull: false,
    step5SuperSpeedCleared: false,
    step5PushThroughUsed: false,
    step5PushKnockback: false,
    step5PushThroughCleared: false,
    step5JamUsedWhileRivalPicking: false,
    step5JamSignalCleared: false,
  };
}

export function resetStep5Stats(stats: TutorialStats, subStep: TutorialSubStep): TutorialStats {
  const next = { ...stats };
  if (subStep === 1) {
    next.step5SuperSpeedUsedAt = null;
    next.step5SuperSpeedUsed = false;
    next.step5SuperSpeedPickGaugeFull = false;
    next.step5SuperSpeedCleared = false;
  } else if (subStep === 2) {
    next.step5PushThroughUsed = false;
    next.step5PushKnockback = false;
    next.step5PushThroughCleared = false;
  } else {
    next.step5JamUsedWhileRivalPicking = false;
    next.step5JamSignalCleared = false;
  }
  return next;
}

export function applyTutorialEvents(
  stats: TutorialStats,
  game: GameState,
  events: readonly GameEvent[],
): TutorialStats {
  let pickDoneCount = stats.pickDoneCount;
  let playerWrongWayKnockbackCount = stats.playerWrongWayKnockbackCount;
  let playerPushRivalCount = stats.playerPushRivalCount;
  let step5SuperSpeedUsedAt = stats.step5SuperSpeedUsedAt;
  let step5SuperSpeedUsed = stats.step5SuperSpeedUsed;
  let step5SuperSpeedPickGaugeFull = stats.step5SuperSpeedPickGaugeFull;
  let step5SuperSpeedCleared = stats.step5SuperSpeedCleared;
  let step5PushThroughUsed = stats.step5PushThroughUsed;
  let step5PushKnockback = stats.step5PushKnockback;
  let step5PushThroughCleared = stats.step5PushThroughCleared;
  let step5JamUsedWhileRivalPicking = stats.step5JamUsedWhileRivalPicking;
  let step5JamSignalCleared = stats.step5JamSignalCleared;

  for (const ev of events) {
    if (ev.type === 'pickDone' && ev.who === 'player') pickDoneCount += 1;
    if (ev.type === 'collision') {
      if (ev.playerWrongWay && ev.playerKnockedBack) {
        playerWrongWayKnockbackCount += 1;
      }
      if (!ev.playerWrongWay && ev.rivalPushed) {
        playerPushRivalCount += 1;
      }
      if (
        game.tutorialSubStep === 2 &&
        ev.rivalPushed &&
        (step5PushThroughUsed || isPushThroughActive(game.skills))
      ) {
        step5PushKnockback = true;
      }
    }
    if (ev.type === 'skillUsed' && game.tutorialSubStep === 1 && ev.skill === SkillType.SuperSpeed) {
      step5SuperSpeedUsedAt = game.elapsed;
      step5SuperSpeedUsed = true;
    }
    if (
      ev.type === 'pickProgress' &&
      ev.who === 'player' &&
      ev.progress >= 1 &&
      game.tutorialSubStep === 1 &&
      hasStep5SuperSpeedRequirement(game, {
        ...stats,
        step5SuperSpeedUsed,
        step5SuperSpeedUsedAt,
        step5SuperSpeedPickGaugeFull,
        step5SuperSpeedCleared,
      }) &&
      isAdjacentToStep5Shelf(game)
    ) {
      step5SuperSpeedPickGaugeFull = true;
    }
    if (ev.type === 'skillUsed' && game.tutorialSubStep === 2 && ev.skill === SkillType.PushThrough) {
      step5PushThroughUsed = true;
    }
    if (
      ev.type === 'skillUsed' &&
      game.tutorialSubStep === 3 &&
      ev.skill === SkillType.JamSignal
    ) {
      step5JamUsedWhileRivalPicking = true;
    }
    if (ev.type === 'pickDone' && ev.who === 'player' && game.tutorialSubStep === 1) {
      const liveStats = {
        ...stats,
        step5SuperSpeedUsed,
        step5SuperSpeedUsedAt,
        step5SuperSpeedPickGaugeFull,
        step5SuperSpeedCleared,
      };
      if (evaluateStep5SuperSpeedClear(game, liveStats, ev.index)) {
        step5SuperSpeedCleared = true;
        console.log('Step 5-1 Picking Completed! Moving to Step 5-2...');
      }
    }
  }

  if (
    !step5SuperSpeedCleared &&
    game.tutorialSubStep === 1 &&
    step5SuperSpeedPickGaugeFull &&
    evaluateStep5SuperSpeedClear(game, {
      ...stats,
      step5SuperSpeedUsed,
      step5SuperSpeedUsedAt,
      step5SuperSpeedPickGaugeFull,
      step5SuperSpeedCleared,
    })
  ) {
    step5SuperSpeedCleared = true;
    console.log('Step 5-1 Picking Completed! Moving to Step 5-2...');
  }

  if (
    game.tutorialSubStep === 2 &&
    step5PushKnockback &&
    isAtTutorialReachCell({ game, recentEvents: events, stats: createTutorialStats() })
  ) {
    step5PushThroughCleared = true;
  }

  if (
    game.tutorialSubStep === 3 &&
    (step5JamUsedWhileRivalPicking || stats.step5JamUsedWhileRivalPicking) &&
    game.rival.jamStun &&
    game.rival.stun > 0
  ) {
    step5JamSignalCleared = true;
  }

  return {
    pickDoneCount,
    playerWrongWayKnockbackCount,
    playerPushRivalCount,
    step5SuperSpeedUsedAt,
    step5SuperSpeedUsed,
    step5SuperSpeedPickGaugeFull,
    step5SuperSpeedCleared,
    step5PushThroughUsed,
    step5PushKnockback,
    step5PushThroughCleared,
    step5JamUsedWhileRivalPicking,
    step5JamSignalCleared,
  };
}

export function buildStepProgress(
  step: TutorialStepNumber,
  stats: TutorialStats,
  subStep: TutorialSubStep | null,
): TutorialStepProgress | null {
  if (step === 3) {
    const done = stats.playerPushRivalCount;
    const total = TUTORIAL_COLLISION_REQUIRED;
    return {
      label: '押し出し',
      done,
      total,
      remaining: Math.max(0, total - done),
    };
  }
  if (step === 4) {
    const done = stats.playerWrongWayKnockbackCount;
    const total = TUTORIAL_COLLISION_REQUIRED;
    return {
      label: 'ノックバック',
      done,
      total,
      remaining: Math.max(0, total - done),
    };
  }
  if (step === 5) {
    return null;
  }
  return null;
}
