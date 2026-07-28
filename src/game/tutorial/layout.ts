import type { GameState } from '../engine';
import { SkillType, fillSkillGauge } from '../skills';
import type { Direction } from '../constants';
import { isShelf, isWalkable, MAIN_AISLE_Y_BOTTOM, MAIN_AISLE_Y_TOP } from '../levelgen';
import {
  TUTORIAL_PLAYER_SPAWN,
  TUTORIAL_RIVAL_SPAWN,
  TUTORIAL_STEP1_SHELF,
  TUTORIAL_STEP5_BLOCKER,
  TUTORIAL_STEP5_JAM_RIVAL_SHELF,
  TUTORIAL_STEP5_REACH,
  TUTORIAL_STEP5_SHELF,
} from './constants';
import type { TutorialStepNumber } from './types';
import type { TutorialSubStep } from './step5';

function tryDir(grid: GameState['grid'], x: number, y: number, dir: Direction): Direction | null {
  const dx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
  const dy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
  return isWalkable(grid, x + dx, y + dy) ? dir : null;
}

function configureStep1PickTarget(state: GameState): GameState {
  let shelfX = TUTORIAL_STEP1_SHELF.x;
  let shelfY = TUTORIAL_STEP1_SHELF.y;
  if (!isShelf(state.grid, shelfX, shelfY)) {
    shelfY = TUTORIAL_STEP1_SHELF.y + 1;
  }

  const targets = state.targets.map((t, i) => {
    if (i === 0) {
      return { ...t, x: shelfX, y: shelfY, done: false, index: 0 };
    }
    return { ...t, done: true };
  });

  return {
    ...state,
    targets,
    currentTarget: 0,
    isPicking: false,
    pickProgress: 0,
  };
}

function resetTutorialSkillFields(state: GameState): GameState {
  return {
    ...state,
    tutorialSubStep: 0,
    tutorialReachCell: null,
    tutorialRivalBlock: false,
    tutorialRivalForcePick: false,
    tutorialLockedSkill: null,
  };
}

function configureStep5SuperSpeed(state: GameState): GameState {
  let shelfX = TUTORIAL_STEP5_SHELF.x;
  let shelfY = TUTORIAL_STEP5_SHELF.y;
  if (!isShelf(state.grid, shelfX, shelfY)) {
    shelfY = TUTORIAL_STEP5_SHELF.y + 1;
  }

  const player = { ...state.player };
  const rival = { ...state.rival };
  applyUnifiedSpawn(player, rival);

  const targets = state.targets.map((t, i) => {
    if (i === 0) {
      return { ...t, x: shelfX, y: shelfY, done: false, index: 0 };
    }
    return { ...t, done: true };
  });

  return {
    ...state,
    player,
    rival,
    targets,
    currentTarget: 0,
    isPicking: false,
    pickProgress: 0,
    selectedSkill: SkillType.SuperSpeed,
    skills: fillSkillGauge(state.skills),
    tutorialSubStep: 1,
    tutorialReachCell: null,
    tutorialRivalBlock: false,
    tutorialRivalForcePick: false,
    tutorialLockedSkill: SkillType.SuperSpeed,
    tutorialRivalActive: false,
    tutorialRivalWrongWay: false,
  };
}

function configureStep5PushThrough(state: GameState): GameState {
  const player = { ...state.player };
  const rival = { ...state.rival };

  player.x = TUTORIAL_PLAYER_SPAWN.x;
  player.y = TUTORIAL_PLAYER_SPAWN.y;
  player.facing = 'right';
  player.stun = 0;
  player.lastMoveDir = null;

  rival.x = TUTORIAL_STEP5_BLOCKER.x;
  rival.y = TUTORIAL_STEP5_BLOCKER.y;
  rival.facing = 'left';
  rival.stun = 0;
  rival.isPicking = false;
  rival.pickProgress = 0;
  rival.jamStun = false;

  return {
    ...state,
    player,
    rival,
    isPicking: false,
    pickProgress: 0,
    selectedSkill: SkillType.PushThrough,
    skills: fillSkillGauge(state.skills),
    tutorialSubStep: 2,
    tutorialReachCell: { ...TUTORIAL_STEP5_REACH },
    tutorialRivalBlock: true,
    tutorialRivalForcePick: false,
    tutorialLockedSkill: SkillType.PushThrough,
    tutorialRivalActive: true,
    tutorialRivalWrongWay: false,
  };
}

function configureStep5JamSignal(state: GameState): GameState {
  const player = { ...state.player };
  const rival = { ...state.rival };

  player.x = 6;
  player.y = MAIN_AISLE_Y_TOP;
  player.facing = 'right';
  player.stun = 0;
  player.lastMoveDir = null;

  rival.x = TUTORIAL_STEP5_JAM_RIVAL_SHELF.x - 1;
  rival.y = TUTORIAL_STEP5_JAM_RIVAL_SHELF.y;
  rival.facing = 'right';
  rival.stun = 0;
  rival.jamStun = false;
  rival.isPicking = true;
  rival.pickProgress = 0.35;

  const rivalTargets = rival.targets.map((t, i) => {
    if (i === 0) {
      return {
        ...t,
        x: TUTORIAL_STEP5_JAM_RIVAL_SHELF.x,
        y: TUTORIAL_STEP5_JAM_RIVAL_SHELF.y,
        done: false,
        index: 0,
      };
    }
    return { ...t, done: true };
  });

  return {
    ...state,
    player,
    rival: { ...rival, targets: rivalTargets, currentTarget: 0 },
    isPicking: false,
    pickProgress: 0,
    selectedSkill: SkillType.JamSignal,
    skills: fillSkillGauge(state.skills),
    tutorialSubStep: 3,
    tutorialReachCell: null,
    tutorialRivalBlock: false,
    tutorialRivalForcePick: true,
    tutorialLockedSkill: SkillType.JamSignal,
    tutorialRivalActive: false,
    tutorialRivalWrongWay: false,
  };
}

function applyUnifiedSpawn(player: GameState['player'], rival: GameState['rival']) {
  player.x = TUTORIAL_PLAYER_SPAWN.x;
  player.y = TUTORIAL_PLAYER_SPAWN.y;
  player.facing = 'right';
  player.spawn = { x: player.x, y: player.y };
  rival.x = TUTORIAL_RIVAL_SPAWN.x;
  rival.y = TUTORIAL_RIVAL_SPAWN.y;
  rival.facing = 'left';
}

/** Reposition player/rival when a tutorial step (or step 5 sub-step) becomes active. */
export function applyTutorialStepLayout(
  state: GameState,
  step: TutorialStepNumber,
  subStep?: TutorialSubStep,
): GameState {
  if (step === 5) {
    const ss = subStep ?? 1;
    let next = resetTutorialSkillFields(state);
    if (ss === 1) next = configureStep5SuperSpeed(next);
    else if (ss === 2) next = configureStep5PushThrough(next);
    else next = configureStep5JamSignal(next);
    return { ...next, collisionFx: 0, collisionPos: null, version: state.version + 1 };
  }

  const player = { ...state.player };
  const rival = { ...state.rival };

  player.stun = 0;
  player.lastMoveDir = null;
  rival.stun = 0;
  rival.jamStun = false;
  rival.isPicking = false;
  rival.pickProgress = 0;
  rival.pickWaitTimer = 0;
  rival.reachedGoal = false;
  rival.moveTimer = 0;
  rival.allowWrongWay = step === 3;

  applyUnifiedSpawn(player, rival);

  if (step === 3) {
    rival.facing = 'left';
  } else if (step === 4) {
    rival.facing = 'right';
  }

  if (!isWalkable(state.grid, player.x, player.y)) {
    player.x = TUTORIAL_PLAYER_SPAWN.x;
    player.y = TUTORIAL_PLAYER_SPAWN.y;
  }
  if (!isWalkable(state.grid, rival.x, rival.y)) {
    rival.x = TUTORIAL_RIVAL_SPAWN.x;
    rival.y = TUTORIAL_RIVAL_SPAWN.y;
  }

  let next: GameState = {
    ...resetTutorialSkillFields(state),
    player,
    rival,
    isPicking: false,
    pickProgress: 0,
    collisionFx: 0,
    collisionPos: null,
    tutorialRivalActive: step === 3 || step === 4,
    tutorialRivalWrongWay: step === 3,
    version: state.version + 1,
  };

  if (step === 1) {
    next = configureStep1PickTarget(next);
  }

  return next;
}

function stepTowardRow(
  grid: GameState['grid'],
  x: number,
  y: number,
  targetRow: number,
): Direction | null {
  if (y === targetRow) return null;
  const primary: Direction = y < targetRow ? 'down' : 'up';
  const fallback: Direction = primary === 'down' ? 'up' : 'down';
  return tryDir(grid, x, y, primary) ?? tryDir(grid, x, y, fallback);
}

/**
 * Main-aisle rectangle loop for tutorial CPU.
 */
export function tutorialRivalPatrolDir(
  grid: GameState['grid'],
  x: number,
  y: number,
  mode: 'flowLoop' | 'wrongWayLoop',
): Direction | null {
  if (y === MAIN_AISLE_Y_TOP) {
    const along: Direction = mode === 'flowLoop' ? 'right' : 'left';
    return (
      tryDir(grid, x, y, along) ??
      stepTowardRow(grid, x, y, MAIN_AISLE_Y_BOTTOM)
    );
  }
  if (y === MAIN_AISLE_Y_BOTTOM) {
    const along: Direction = mode === 'flowLoop' ? 'left' : 'right';
    return (
      tryDir(grid, x, y, along) ??
      stepTowardRow(grid, x, y, MAIN_AISLE_Y_TOP)
    );
  }
  if (y < MAIN_AISLE_Y_TOP) {
    return stepTowardRow(grid, x, y, MAIN_AISLE_Y_TOP);
  }
  if (y > MAIN_AISLE_Y_BOTTOM) {
    return stepTowardRow(grid, x, y, MAIN_AISLE_Y_BOTTOM);
  }
  return null;
}
