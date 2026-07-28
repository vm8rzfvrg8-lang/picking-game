import {
  Facing,
  GameState,
  Phase,
  PICK_COUNT,
  PICK_DURATION_MS,
  COLLISION_STUN_LOSER_MS,
  YIELD_COLLISION_WINDOW_MS,
  PickTarget,
  RivalEntity,
  Direction,
  Difficulty,
} from './constants';
import { getDifficultyConfig } from './difficulty';
import {
  attemptedIntoCell,
  backAsYield,
  backFromCollision,
  flowAt,
  stunForCollisionKnockback,
  isWrongWay,
  separateIfOverlapping,
} from './flow';
import { createInitialSkills, isPushThroughActive, tickSkills, useSkill, SkillType } from './skills';
import { tutorialRivalPatrolDir } from './tutorial/layout';
import {
  assignTargets,
  bfsDistances,
  findWalkableNear,
  generateLibrary,
  GOAL_CELLS,
  isGoalCell,
  isShelf,
  isWalkable,
  makeRng,
} from './levelgen';

export type { Direction } from './constants';
export type { Difficulty } from './difficulty';
export type Input = { dir: Direction | null; pick: boolean; useSkill?: boolean };

export function newGame(
  seed?: number,
  difficulty: Difficulty = 'normal',
  selectedSkill: SkillType = SkillType.SuperSpeed,
): GameState {
  const s = seed ?? Math.floor(Math.random() * 1e9);
  const rng = makeRng(s);
  const { grid, shelfCells } = generateLibrary(rng);

  const playerSpawn = { x: 1, y: 1 };
  if (!isWalkable(grid, playerSpawn.x, playerSpawn.y)) {
    const near = findWalkableNear(grid, 'tl');
    playerSpawn.x = near.x;
    playerSpawn.y = near.y;
  }

  const targets = assignTargets(grid, shelfCells, playerSpawn, rng);
  const rivalSpawn = findWalkableNear(grid, 'br');
  const rivalTargets = assignTargets(grid, shelfCells, rivalSpawn, rng);

  const rival: RivalEntity = {
    id: 0,
    x: rivalSpawn.x,
    y: rivalSpawn.y,
    facing: 'left',
    spawn: rivalSpawn,
    moveTimer: 0,
    stun: 0,
    targets: rivalTargets,
    currentTarget: 0,
    pickProgress: 0,
    isPicking: false,
    reachedGoal: false,
    lastMoveDir: null,
    allowWrongWay: false,
    pickWaitTimer: 0,
    jamStun: false,
  };

  return {
    grid,
    player: {
      x: playerSpawn.x,
      y: playerSpawn.y,
      facing: 'down',
      spawn: playerSpawn,
      stun: 0,
      lastMoveDir: null,
    },
    rival,
    targets,
    currentTarget: 0,
    pickProgress: 0,
    isPicking: false,
    goals: GOAL_CELLS.map((g) => ({ x: g.x, y: g.y })),
    phase: 'start',
    elapsed: 0,
    version: 0,
    collisionFx: 0,
    collisionPos: null,
    collisionPairCount: 0,
    lastCollisionElapsed: -99999,
    yieldFx: null,
    yieldFxTimer: 0,
    difficulty,
    seed: s,
    tutorialRivalActive: false,
    tutorialRivalWrongWay: false,
    tutorialSubStep: 0,
    tutorialReachCell: null,
    tutorialRivalBlock: false,
    tutorialRivalForcePick: false,
    tutorialLockedSkill: null,
    selectedSkill,
    skills: createInitialSkills(),
    rivalSkills: createInitialSkills(),
  };
}

export function startPlaying(s: GameState): GameState {
  return {
    ...s,
    phase: 'playing' as Phase,
    skills: createInitialSkills(),
    rivalSkills: createInitialSkills(),
    version: s.version + 1,
  };
}

export function enterTutorial(s: GameState): GameState {
  return {
    ...s,
    phase: 'tutorial' as Phase,
    tutorialRivalActive: false,
    tutorialRivalWrongWay: false,
    version: s.version + 1,
  };
}

export function returnToStart(s: GameState): GameState {
  return { ...newGame(s.seed, s.difficulty, s.selectedSkill), phase: 'start' as Phase };
}

/** Direction from player toward the active shelf target, when adjacent. */
export function directionTowardTarget(state: GameState): Direction | null {
  const target = state.targets[state.currentTarget];
  if (!target || target.done) return null;
  const dx = target.x - state.player.x;
  const dy = target.y - state.player.y;
  if (Math.abs(dx) + Math.abs(dy) !== 1) return null;
  if (dx === 1) return 'right';
  if (dx === -1) return 'left';
  if (dy === 1) return 'down';
  if (dy === -1) return 'up';
  return null;
}

export function isPickInput(state: GameState, dir: Direction | null): boolean {
  if (!dir) return false;
  const pickDir = directionTowardTarget(state);
  return pickDir !== null && dir === pickDir;
}

const DELTA: Record<Direction, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

const FACING_FROM_DIR: Record<Direction, Facing> = {
  up: 'up',
  down: 'down',
  left: 'left',
  right: 'right',
};

export interface StepResult {
  state: GameState;
  events: GameEvent[];
}

export type GameEvent =
  | { type: 'move'; who: 'player' | 'rival'; fromX: number; fromY: number; dir: Direction }
  | { type: 'bump'; who: 'player' | 'rival' }
  | { type: 'pickStart'; who: 'player' | 'rival' }
  | { type: 'pickProgress'; who: 'player' | 'rival'; progress: number }
  | { type: 'pickDone'; who: 'player' | 'rival'; index: number }
  | { type: 'pickCancel'; who: 'player' | 'rival' }
  | {
      type: 'collision';
      playerKnockedBack: boolean;
      rivalKnockedBack: boolean;
      playerWrongWay: boolean;
      rivalWrongWay: boolean;
      playerPushed: boolean;
      rivalPushed: boolean;
    }
  | { type: 'skillUsed'; skill: SkillType }
  | { type: 'yield'; who: 'player' | 'rival' }
  | { type: 'win' }
  | { type: 'lose' };

function dirBetween(fx: number, fy: number, tx: number, ty: number): Direction | null {
  const dx = tx - fx;
  const dy = ty - fy;
  if (dx === 1) return 'right';
  if (dx === -1) return 'left';
  if (dy === 1) return 'down';
  if (dy === -1) return 'up';
  return null;
}

function finalizePickingAfterCollision(
  s: GameState,
  rival: RivalEntity,
  events: GameEvent[],
  saved: {
    playerPicking: boolean;
    playerProgress: number;
    rivalPicking: boolean;
    rivalProgress: number;
  },
  playerKnocked: boolean,
  rivalKnocked: boolean,
): { state: GameState; rival: RivalEntity } {
  let next = s;
  let nextRival = rival;

  if (playerKnocked) {
    if (saved.playerPicking || next.isPicking) {
      next = { ...next, isPicking: false, pickProgress: 0 };
      events.push({ type: 'pickCancel', who: 'player' });
    }
  } else if (saved.playerPicking) {
    next = { ...next, isPicking: true, pickProgress: saved.playerProgress };
  }

  if (rivalKnocked) {
    if (saved.rivalPicking || nextRival.isPicking) {
      nextRival = { ...nextRival, isPicking: false, pickProgress: 0 };
      events.push({ type: 'pickCancel', who: 'rival' });
    }
  } else if (saved.rivalPicking) {
    nextRival = {
      ...nextRival,
      isPicking: true,
      pickProgress: saved.rivalProgress,
    };
  }

  return { state: next, rival: nextRival };
}

function finishCollisionFx(
  s: GameState,
  player: GameState['player'],
  rival: RivalEntity,
  events: GameEvent[],
  detail: Extract<GameEvent, { type: 'collision' }>,
): GameState {
  s.player = player;
  s.rival = rival;
  s.collisionFx = 600;
  s.collisionPos = {
    x: (player.x + rival.x) / 2 + 0.5,
    y: (player.y + rival.y) / 2 + 0.5,
  };
  s.lastCollisionElapsed = s.elapsed;
  events.push(detail);
  return s;
}

function applyCollision(
  s: GameState,
  state: GameState,
  _input: Input,
  events: GameEvent[],
  opts: {
    playerAttemptDir: Direction | null;
    rivalAttemptDir: Direction | null;
  },
): GameState {
  const px0 = state.player.x;
  const py0 = state.player.y;
  const rx0 = state.rival.x;
  const ry0 = state.rival.y;
  const playerMoved = s.player.x !== px0 || s.player.y !== py0;
  const rivalMoved = s.rival.x !== rx0 || s.rival.y !== ry0;

  const playerDir = playerMoved
    ? dirBetween(px0, py0, s.player.x, s.player.y)
    : opts.playerAttemptDir;
  const rivalDir = rivalMoved
    ? dirBetween(rx0, ry0, s.rival.x, s.rival.y)
    : opts.rivalAttemptDir;

  const saved = {
    playerPicking: s.isPicking,
    playerProgress: s.pickProgress,
    rivalPicking: s.rival.isPicking,
    rivalProgress: s.rival.pickProgress,
  };

  let player = {
    ...s.player,
    lastMoveDir: playerDir,
  };
  let rival = {
    ...s.rival,
    lastMoveDir: rivalDir,
  };

  const grid = s.grid;
  const pAggressor = attemptedIntoCell(px0, py0, rx0, ry0, playerDir);
  const rAggressor = attemptedIntoCell(rx0, ry0, px0, py0, rivalDir);
  const playerPushThrough = isPushThroughActive(s.skills);
  const rivalPushThrough = isPushThroughActive(s.rivalSkills);

  // 相手ゴリ押し + 自分ピッキング中 → 強制ノックバック & キャンセル
  if (rivalPushThrough && saved.playerPicking) {
    const pushDir =
      rivalDir && (rivalMoved || rAggressor)
        ? rivalDir
        : playerDir ?? rival.facing;
    const b = backAsYield(grid, px0, py0, pushDir, { x: rival.x, y: rival.y });
    player = {
      ...player,
      x: b.x,
      y: b.y,
      stun: COLLISION_STUN_LOSER_MS,
    };

    const separated = separateIfOverlapping(
      grid,
      { x: player.x, y: player.y },
      { x: rival.x, y: rival.y },
      true,
      false,
    );
    player = { ...player, x: separated.player.x, y: separated.player.y };
    rival = { ...rival, x: separated.rival.x, y: separated.rival.y, stun: 0 };

    const finalized = finalizePickingAfterCollision(
      s,
      rival,
      events,
      saved,
      true,
      false,
    );
    s = finalized.state;
    rival = finalized.rival;

    return finishCollisionFx(s, player, rival, events, {
      type: 'collision',
      playerKnockedBack: true,
      rivalKnockedBack: false,
      playerWrongWay: false,
      rivalWrongWay: false,
      playerPushed: true,
      rivalPushed: false,
    });
  }

  // 自分ゴリ押し → 相手のみ押し出し（ピッキング中なら継続）
  if (playerPushThrough) {
    const rxKnock = rival.x;
    const ryKnock = rival.y;
    const pushDir =
      playerDir && (playerMoved || pAggressor)
        ? playerDir
        : rivalDir ?? player.facing;

    if (pushDir) {
      const b = backAsYield(grid, rx0, ry0, pushDir, { x: player.x, y: player.y });
      rival = { ...rival, x: b.x, y: b.y };
    }

    const separated = separateIfOverlapping(
      grid,
      { x: player.x, y: player.y },
      { x: rival.x, y: rival.y },
      false,
      true,
    );
    player = { ...player, x: separated.player.x, y: separated.player.y, stun: 0 };
    rival = { ...rival, x: separated.rival.x, y: separated.rival.y };

    const rivalKnocked = rival.x !== rxKnock || rival.y !== ryKnock;
    rival = {
      ...rival,
      stun: stunForCollisionKnockback(rivalKnocked, false),
    };

    const finalized = finalizePickingAfterCollision(
      s,
      rival,
      events,
      saved,
      false,
      rivalKnocked,
    );
    s = finalized.state;
    rival = finalized.rival;

    return finishCollisionFx(s, player, rival, events, {
      type: 'collision',
      playerKnockedBack: false,
      rivalKnockedBack: rivalKnocked,
      playerWrongWay: false,
      rivalWrongWay: false,
      playerPushed: false,
      rivalPushed: rivalKnocked,
    });
  }

  // 相手ゴリ押し（ピッキング以外）→ 自分のみ押し出し
  if (rivalPushThrough) {
    const pxKnock = player.x;
    const pyKnock = player.y;
    const pushDir =
      rivalDir && (rivalMoved || rAggressor)
        ? rivalDir
        : playerDir ?? rival.facing;

    if (pushDir) {
      const b = backAsYield(grid, px0, py0, pushDir, { x: rival.x, y: rival.y });
      player = { ...player, x: b.x, y: b.y };
    }

    const separated = separateIfOverlapping(
      grid,
      { x: player.x, y: player.y },
      { x: rival.x, y: rival.y },
      true,
      false,
    );
    player = { ...player, x: separated.player.x, y: separated.player.y, stun: 0 };
    rival = { ...rival, x: separated.rival.x, y: separated.rival.y };

    const playerKnocked = player.x !== pxKnock || player.y !== pyKnock;
    player = {
      ...player,
      stun: stunForCollisionKnockback(playerKnocked, false),
    };

    const finalized = finalizePickingAfterCollision(
      s,
      rival,
      events,
      saved,
      playerKnocked,
      false,
    );
    s = finalized.state;
    rival = finalized.rival;

    return finishCollisionFx(s, player, rival, events, {
      type: 'collision',
      playerKnockedBack: playerKnocked,
      rivalKnockedBack: false,
      playerWrongWay: false,
      rivalWrongWay: false,
      playerPushed: playerKnocked,
      rivalPushed: false,
    });
  }

  const pWrong = isWrongWay(px0, py0, playerDir);
  const rWrong = isWrongWay(rx0, ry0, rivalDir);
  const pYield = !pWrong && !rWrong && rAggressor && !pAggressor && rivalDir;
  const rYield = !pWrong && !rWrong && pAggressor && !rAggressor && playerDir;

  const pxKnock = player.x;
  const pyKnock = player.y;
  const rxKnock = rival.x;
  const ryKnock = rival.y;

  if (rWrong) {
    const b = backFromCollision(grid, rx0, ry0, rivalDir, { x: px0, y: py0 });
    rival = { ...rival, x: b.x, y: b.y };
  } else if (rYield) {
    const b = backAsYield(grid, rx0, ry0, playerDir!, { x: px0, y: py0 });
    rival = { ...rival, x: b.x, y: b.y };
  }

  if (pWrong) {
    const b = backFromCollision(grid, px0, py0, playerDir, { x: rival.x, y: rival.y });
    player = { ...player, x: b.x, y: b.y };
  } else if (pYield) {
    const b = backAsYield(grid, px0, py0, rivalDir!, { x: rival.x, y: rival.y });
    player = { ...player, x: b.x, y: b.y };
  }

  const separated = separateIfOverlapping(
    grid,
    { x: player.x, y: player.y },
    { x: rival.x, y: rival.y },
    pWrong,
    rWrong,
  );
  player = { ...player, x: separated.player.x, y: separated.player.y };
  rival = { ...rival, x: separated.rival.x, y: separated.rival.y };

  const playerKnocked = player.x !== pxKnock || player.y !== pyKnock;
  const rivalKnocked = rival.x !== rxKnock || rival.y !== ryKnock;

  player = { ...player, stun: stunForCollisionKnockback(playerKnocked, pWrong) };
  rival = { ...rival, stun: stunForCollisionKnockback(rivalKnocked, rWrong) };

  const finalized = finalizePickingAfterCollision(
    s,
    rival,
    events,
    saved,
    playerKnocked,
    rivalKnocked,
  );
  s = finalized.state;
  rival = finalized.rival;

  return finishCollisionFx(s, player, rival, events, {
    type: 'collision',
    playerKnockedBack: pWrong,
    rivalKnockedBack: rWrong,
    playerWrongWay: pWrong,
    rivalWrongWay: rWrong,
    playerPushed: pWrong || pYield,
    rivalPushed: rWrong || rYield,
  });
}

export function step(state: GameState, input: Input, dtMs: number): StepResult {
  const playable = state.phase === 'playing' || state.phase === 'tutorial';
  if (!playable) return { state, events: [] };
  const events: GameEvent[] = [];
  let s: GameState = { ...state, version: state.version + 1 };
  s = tickSkills(s, dtMs);
  s.elapsed += dtMs;

  if (input.useSkill) {
    const used = useSkill(s);
    s = used.state;
    if (used.used && used.skillId) {
      events.push({ type: 'skillUsed', skill: used.skillId });
    }
  }

  if (s.collisionFx > 0) s.collisionFx = Math.max(0, s.collisionFx - dtMs);
  if (s.yieldFxTimer > 0) {
    s.yieldFxTimer = Math.max(0, s.yieldFxTimer - dtMs);
    if (s.yieldFxTimer === 0) s.yieldFx = null;
  }

  let collision = false;
  let playerAttemptDir: Direction | null = null;
  let rivalAttemptDir: Direction | null = null;

  if (s.player.stun > 0) {
    s.player = { ...s.player, stun: Math.max(0, s.player.stun - dtMs) };
  } else if (input.dir && !s.isPicking) {
    const { dx, dy } = DELTA[input.dir];
    const nx = s.player.x + dx;
    const ny = s.player.y + dy;
    const fromX = s.player.x;
    const fromY = s.player.y;
    s.player = { ...s.player, facing: FACING_FROM_DIR[input.dir] };
    if (nx === s.rival.x && ny === s.rival.y) {
      collision = true;
      playerAttemptDir = input.dir;
      events.push({ type: 'bump', who: 'player' });
    } else if (isWalkable(s.grid, nx, ny)) {
      s.player = {
        ...s.player,
        x: nx,
        y: ny,
        lastMoveDir: input.dir,
      };
      events.push({ type: 'move', who: 'player', fromX, fromY, dir: input.dir });
    }
    // Blocked by shelf/wall: silent (no bump)
  }

  const pTarget = s.targets[s.currentTarget];
  if (pTarget && !pTarget.done) {
    const adjacent =
      Math.abs(s.player.x - pTarget.x) + Math.abs(s.player.y - pTarget.y) === 1 &&
      isShelf(s.grid, pTarget.x, pTarget.y);

    if (s.isPicking) {
      const stillAdjacent =
        Math.abs(s.player.x - pTarget.x) + Math.abs(s.player.y - pTarget.y) === 1 &&
        isShelf(s.grid, pTarget.x, pTarget.y);
      if (!stillAdjacent || !input.pick || s.player.stun > 0) {
        s.isPicking = false;
        s.pickProgress = 0;
        events.push({ type: 'pickCancel', who: 'player' });
      } else {
        s.pickProgress += dtMs / PICK_DURATION_MS;
        events.push({ type: 'pickProgress', who: 'player', progress: s.pickProgress });
        if (s.pickProgress >= 1) {
          s.isPicking = false;
          s.pickProgress = 0;
          s.targets = s.targets.map((t, i) =>
            i === s.currentTarget ? { ...t, done: true } : t,
          );
          events.push({ type: 'pickDone', who: 'player', index: s.currentTarget });
          s.currentTarget += 1;
        }
      }
    } else if (input.pick && adjacent && s.player.stun === 0) {
      s.isPicking = true;
      s.pickProgress = 0;
      events.push({ type: 'pickStart', who: 'player' });
    }
  } else if (s.isPicking) {
    s.isPicking = false;
    s.pickProgress = 0;
    events.push({ type: 'pickCancel', who: 'player' });
  }

  const rivalResult =
    s.phase === 'tutorial' && !s.tutorialRivalActive && !s.tutorialRivalForcePick
      ? { rival: s.rival, collision: false, attemptDir: null as Direction | null }
      : stepRival(s, dtMs, events);
  s.rival = rivalResult.rival;
  if (rivalResult.collision) {
    collision = true;
    rivalAttemptDir = rivalResult.attemptDir;
  }

  if (playable && collision) {
    s = applyCollision(s, state, input, events, { playerAttemptDir, rivalAttemptDir });
  }

  // Safety: never allow both on the same tile
  if (playable && s.player.x === s.rival.x && s.player.y === s.rival.y) {
    const sep = separateIfOverlapping(
      s.grid,
      { x: s.player.x, y: s.player.y },
      { x: s.rival.x, y: s.rival.y },
      false,
      false,
    );
    s.player = { ...s.player, x: sep.player.x, y: sep.player.y };
    s.rival = { ...s.rival, x: sep.rival.x, y: sep.rival.y };
  }

  if (s.phase === 'playing' && s.currentTarget >= PICK_COUNT) {
    if (isGoalCell(s.grid, s.player.x, s.player.y)) {
      events.push({ type: 'win' });
      s.phase = 'won';
    }
  }
  if (s.phase === 'playing' && s.rival.reachedGoal) {
    events.push({ type: 'lose' });
    s.phase = 'lost';
  }

  return { state: s, events };
}

function stepRival(
  s: GameState,
  dtMs: number,
  events: GameEvent[],
): { rival: RivalEntity; collision: boolean; attemptDir: Direction | null } {
  let r = { ...s.rival };
  let collision = false;
  let attemptDir: Direction | null = null;
  const cpu = getDifficultyConfig(s.difficulty);

  if (s.tutorialRivalBlock) {
    return { rival: r, collision, attemptDir };
  }

  if (s.tutorialRivalForcePick) {
    if (r.stun > 0) {
      r.stun = Math.max(0, r.stun - dtMs);
      if (r.stun === 0) r.jamStun = false;
      return { rival: r, collision, attemptDir };
    }
    if (r.isPicking) {
      r.pickProgress = Math.min(0.95, r.pickProgress + dtMs / cpu.pickMs);
      events.push({ type: 'pickProgress', who: 'rival', progress: r.pickProgress });
    }
    return { rival: r, collision, attemptDir };
  }

  if (r.stun > 0) {
    r.stun = Math.max(0, r.stun - dtMs);
    if (r.stun === 0) r.jamStun = false;
    return { rival: r, collision, attemptDir };
  }

  const rt = r.targets[r.currentTarget];
  if (rt && !rt.done) {
    const adjacent =
      Math.abs(r.x - rt.x) + Math.abs(r.y - rt.y) === 1 && isShelf(s.grid, rt.x, rt.y);

    if (r.isPicking) {
      const stillAdjacent =
        Math.abs(r.x - rt.x) + Math.abs(r.y - rt.y) === 1 && isShelf(s.grid, rt.x, rt.y);
      if (!stillAdjacent) {
        r.isPicking = false;
        r.pickProgress = 0;
        events.push({ type: 'pickCancel', who: 'rival' });
      } else {
        r.pickProgress += dtMs / cpu.pickMs;
        events.push({ type: 'pickProgress', who: 'rival', progress: r.pickProgress });
        if (r.pickProgress >= 1) {
          r.isPicking = false;
          r.pickProgress = 0;
          r.targets = r.targets.map((t, i) =>
            i === r.currentTarget ? { ...t, done: true } : t,
          );
          events.push({ type: 'pickDone', who: 'rival', index: r.currentTarget });
          r.currentTarget += 1;
          r.pickWaitTimer = 0;
        }
      }
    } else if (adjacent) {
      if (cpu.pickDelayMs > 0) {
        if (r.pickWaitTimer <= 0) r.pickWaitTimer = cpu.pickDelayMs;
        r.pickWaitTimer -= dtMs;
        if (r.pickWaitTimer > 0) {
          return { rival: r, collision, attemptDir };
        }
      }
      r.pickWaitTimer = 0;
      r.isPicking = true;
      r.pickProgress = 0;
      events.push({ type: 'pickStart', who: 'rival' });
    }
  } else if (r.isPicking) {
    r.isPicking = false;
    r.pickProgress = 0;
    events.push({ type: 'pickCancel', who: 'rival' });
  }

  if (r.isPicking) return { rival: r, collision, attemptDir };

  // Tutorial steps 4–5: simple lane patrol for collision practice
  if (s.phase === 'tutorial' && s.tutorialRivalActive) {
    r.moveTimer += dtMs;
    if (r.moveTimer < cpu.stepMs) return { rival: r, collision, attemptDir };
    r.moveTimer -= cpu.stepMs;

    const moveDir = s.tutorialRivalWrongWay
      ? tutorialRivalPatrolDir(s.grid, r.x, r.y, 'wrongWayLoop')
      : tutorialRivalPatrolDir(s.grid, r.x, r.y, 'flowLoop');
    if (moveDir) {
      const dx = moveDir === 'left' ? -1 : moveDir === 'right' ? 1 : 0;
      const dy = moveDir === 'up' ? -1 : moveDir === 'down' ? 1 : 0;
      const nx = r.x + dx;
      const ny = r.y + dy;
      if (nx === s.player.x && ny === s.player.y) {
        collision = true;
        attemptDir = moveDir;
        events.push({ type: 'bump', who: 'rival' });
      } else if (isWalkable(s.grid, nx, ny)) {
        const fromX = r.x;
        const fromY = r.y;
        r.x = nx;
        r.y = ny;
        r.facing = moveDir;
        r.lastMoveDir = moveDir;
        events.push({ type: 'move', who: 'rival', fromX, fromY, dir: moveDir });
      }
    }
    return { rival: r, collision, attemptDir };
  }

  if (r.currentTarget >= PICK_COUNT) {
    if (isGoalCell(s.grid, r.x, r.y)) {
      r.reachedGoal = true;
      return { rival: r, collision, attemptDir };
    }
  }

  r.moveTimer += dtMs;
  if (r.moveTimer < cpu.stepMs) return { rival: r, collision, attemptDir };
  r.moveTimer -= cpu.stepMs;

  if (cpu.hesitateChance > 0 && Math.random() < cpu.hesitateChance) {
    return { rival: r, collision, attemptDir };
  }

  let destX: number;
  let destY: number;
  if (r.currentTarget < PICK_COUNT) {
    const t = r.targets[r.currentTarget];
    if (!t || t.done) {
      r.currentTarget++;
      return { rival: r, collision, attemptDir };
    }
    destX = t.x;
    destY = t.y;
  } else {
    let bestG: { x: number; y: number } = { x: GOAL_CELLS[0].x, y: GOAL_CELLS[0].y };
    let bestD = Infinity;
    for (const g of GOAL_CELLS) {
      const dmap = bfsDistances(s.grid, g.x, g.y);
      const d = dmap[r.y]?.[r.x] ?? -1;
      if (d >= 0 && d < bestD) {
        bestD = d;
        bestG = g;
      }
    }
    destX = bestG.x;
    destY = bestG.y;
  }

  let dist: number[][] = [];
  if (r.currentTarget < PICK_COUNT) {
    let bestFromRival = Infinity;
    for (const [adx, ady] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ax = destX + adx;
      const ay = destY + ady;
      if (!isWalkable(s.grid, ax, ay)) continue;
      const dmap = bfsDistances(s.grid, ax, ay);
      const fromRival = dmap[r.y]?.[r.x] ?? -1;
      if (fromRival >= 0 && fromRival < bestFromRival) {
        bestFromRival = fromRival;
        dist = dmap;
      }
    }
    if (bestFromRival === Infinity) return { rival: r, collision, attemptDir };
  } else {
    dist = bfsDistances(s.grid, destX, destY);
  }

  let best: { x: number; y: number; score: number } | null = null;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = r.x + dx;
    const ny = r.y + dy;
    if (!isWalkable(s.grid, nx, ny)) continue;
    const d = dist[ny]?.[nx] ?? -1;
    if (d < 0) continue;
    const moveDir = dirBetween(r.x, r.y, nx, ny);
    if (!moveDir) continue;
    const flow = flowAt(r.x, r.y);
    let tieBreak = 0;
    if (flow && moveDir === flow) tieBreak -= cpu.flowBonus;
    else if (isWrongWay(r.x, r.y, moveDir)) tieBreak += cpu.wrongWayPenalty;
    if (r.lastMoveDir === moveDir) tieBreak -= 0.15;
    else if (r.facing === moveDir) tieBreak -= 0.05;
    const score = d + tieBreak;
    if (!best || score < best.score) {
      best = { x: nx, y: ny, score };
    }
  }

  if (best) {
    const moveDir = dirBetween(r.x, r.y, best.x, best.y);
    if (best.x === s.player.x && best.y === s.player.y) {
      collision = true;
      attemptDir = moveDir;
      events.push({ type: 'bump', who: 'rival' });
    } else {
      r.x = best.x;
      r.y = best.y;
      if (moveDir) r.facing = moveDir;
      r.lastMoveDir = moveDir;
      events.push({
        type: 'move',
        who: 'rival',
        fromX: s.rival.x,
        fromY: s.rival.y,
        dir: moveDir!,
      });
    }
  }

  return { rival: r, collision, attemptDir };
}
