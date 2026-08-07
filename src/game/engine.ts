import {
  Facing,
  GameState,
  Phase,
  clampPickCount,
  DEFAULT_PICK_COUNT,
  PICK_DURATION_MS,
  YIELD_COLLISION_WINDOW_MS,
  PickTarget,
  RivalEntity,
  Direction,
  Difficulty,
  DEFAULT_CPU_COUNT,
  MAX_LOOP_ITERATIONS_PER_FRAME,
  RIVAL_STUCK_DETECT_MS,
  RIVAL_UNSTICK_MOVE_COUNT,
  RIVAL_PUSH_STUCK_MS,
  clampCpuCount,
} from './constants';
import { getDifficultyConfig, type DifficultyConfig } from './difficulty';
import {
  attemptedIntoCell,
  applySimpleKnockback,
  stunForCollisionKnockback,
  flowAt,
  isWrongWay,
  separateIfOverlapping,
  applyRepulsionKnockback,
  applyHeadOnSlide,
  isNarrowCorridorCell,
  backFromCollision,
} from './flow';
import {
  registerPickComboSuccess,
  tickComboExpiry,
} from './combo';
import { registerFinish } from './result';
import type { GameEvent, StepResult } from './events';
import { createInitialSkills, isPushThroughActive, isSuperSpeedActive, isMusouRunning, tickSkills, useSkill, SkillType, SKILL_JAM_RADIUS, SKILL_JAM_CONFUSED_STOP_CHANCE } from './skills';
import { isAirborneKnockbackActive } from './randomKnockback';
import {
  applyRandomKnockbackToTarget,
  stepHadouEffects,
  stepMusouRun,
  tickSkillEntityTimers,
} from './skillRuntime';
import { tutorialRivalPatrolDir } from './tutorial/layout';
import {
  assignStartSpawns,
  assignTargets,
  bfsDistances,
  buildShelfLocationMap,
  findWalkableNear,
  generateLibrary,
  GOAL_CELLS,
  isGoalCell,
  isShelf,
  isWalkable,
  makeRng,
} from './levelgen';
import {
  createKnockbackState,
  facingFromKnockback,
  tickKnockbackEntity,
  type KnockbackDirection,
  type KnockbackTarget,
  type KnockbackVisualOpts,
} from './knockback';
import {
  BANANA_LIFT_PX,
  BANANA_PEAK_SCALE,
  BANANA_SLIP_DURATION_MS,
  BANANA_SLIP_FORCE,
  beginBananaPeelFade,
  findActiveBananaPeelIndex,
  placeBananaPeels,
  slipDirectionFromFacing,
  tickTrapAnimations,
} from './traps';

export type {
  KnockbackDirection,
  KnockbackTarget,
  KnockbackState,
} from './knockback';
export {
  getKnockbackVisualOffset,
  isKnockbackMoving,
  normalizeKnockbackDirection,
  getKnockbackDrawFx,
} from './knockback';

function createRivalEntity(
  id: number,
  spawn: { x: number; y: number },
  shelfCells: { x: number; y: number }[],
  shelfLocations: Record<string, number>,
  rng: ReturnType<typeof makeRng>,
  pickCount: number,
): RivalEntity {
  const rivalTargets = assignTargets(shelfCells, shelfLocations, rng, pickCount);
  return {
    id,
    x: spawn.x,
    y: spawn.y,
    facing: 'left',
    spawn,
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
    stuckMs: 0,
    stuckAnchorX: spawn.x,
    stuckAnchorY: spawn.y,
    unstickMovesLeft: 0,
    routeSeed: rng(),
    pushStuckMs: 0,
    pushBlockerIndex: null,
    narrowCorridorSince: -1,
    knockback: null,
    knockbackImmuneMs: 0,
    jamGuideHiddenMs: 0,
  };
}

function findRivalIndexAt(
  state: GameState,
  x: number,
  y: number,
  ignoreRivalIndex?: number,
): number | null {
  for (let i = 0; i < state.rivals.length; i++) {
    if (i === ignoreRivalIndex) continue;
    if (state.rivals[i].x === x && state.rivals[i].y === y) return i;
  }
  return null;
}

function isCellOccupiedByRival(
  state: GameState,
  x: number,
  y: number,
  ignoreRivalIndex?: number,
): boolean {
  for (let i = 0; i < state.rivals.length; i++) {
    if (i === ignoreRivalIndex) continue;
    const r = state.rivals[i];
    if (r.x === x && r.y === y) return true;
  }
  return false;
}

function isCellOccupied(
  state: GameState,
  x: number,
  y: number,
  ignoreRivalIndex?: number,
): boolean {
  if (state.player.x === x && state.player.y === y) return true;
  return isCellOccupiedByRival(state, x, y, ignoreRivalIndex);
}

export type { Direction } from './constants';
export type { Difficulty } from './difficulty';
export type Input = { dir: Direction | null; pick: boolean; useSkill?: boolean };

export function newGame(
  seed?: number,
  difficulty: Difficulty = 'normal',
  selectedSkill: SkillType = SkillType.SuperSpeed,
  cpuCount: number = DEFAULT_CPU_COUNT,
  pickCount: number = DEFAULT_PICK_COUNT,
): GameState {
  const count = clampCpuCount(cpuCount);
  const picks = clampPickCount(pickCount);
  const s = seed ?? Math.floor(Math.random() * 1e9);
  const rng = makeRng(s);
  const { grid, shelfCells } = generateLibrary(rng);
  const shelfLocations = buildShelfLocationMap(shelfCells);

  const spawns = assignStartSpawns(grid, count);
  let playerSpawn = spawns.player;
  if (!isWalkable(grid, playerSpawn.x, playerSpawn.y)) {
    const near = findWalkableNear(grid, 'tl');
    playerSpawn = near;
  }

  const targets = assignTargets(shelfCells, shelfLocations, rng, picks);
  const cpuSpawns = spawns.cpus;
  const rivals = cpuSpawns.map((spawn, id) =>
    createRivalEntity(id, spawn, shelfCells, shelfLocations, rng, picks),
  );

  const traps = placeBananaPeels(grid, rng, undefined, [playerSpawn, ...cpuSpawns]);

  return {
    grid,
    shelfLocations,
    player: {
      x: playerSpawn.x,
      y: playerSpawn.y,
      facing: 'down',
      spawn: playerSpawn,
      stun: 0,
      lastMoveDir: null,
      knockback: null,
      knockbackImmuneMs: 0,
      jamGuideHiddenMs: 0,
    },
    rivals,
    cpuCount: count,
    pickCount: picks,
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
    rivalSkills: Array.from({ length: count }, () => createInitialSkills()),
    pickCombo: 0,
    lastPickSuccessElapsed: -1,
    maxPickCombo: 0,
    finishOrder: [],
    traps,
    musouRunPath: null,
    musouRunIndex: 0,
    musouStepAccum: 0,
    musouFadeMs: 0,
  };
}

export function startPlaying(s: GameState): GameState {
  return {
    ...s,
    phase: 'playing' as Phase,
    skills: createInitialSkills(),
    rivalSkills: Array.from({ length: s.cpuCount }, () => createInitialSkills()),
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
  return {
    ...newGame(s.seed, s.difficulty, s.selectedSkill, s.cpuCount, s.pickCount),
    phase: 'start' as Phase,
  };
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

const ALL_DIRS: Direction[] = ['up', 'down', 'left', 'right'];

const NEIGHBOR_DELTAS: ReadonlyArray<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

type MoveCandidate = { x: number; y: number; score: number; dir: Direction };

function dirBetween(fx: number, fy: number, tx: number, ty: number): Direction | null {
  const dx = tx - fx;
  const dy = ty - fy;
  if (dx === 1) return 'right';
  if (dx === -1) return 'left';
  if (dy === 1) return 'down';
  if (dy === -1) return 'up';
  return null;
}

/** BFS from walkable cells adjacent to a shelf; picks approach lane with per-CPU bias. */
function pickShelfApproachDistMap(
  grid: GameState['grid'],
  shelfX: number,
  shelfY: number,
  fromX: number,
  fromY: number,
  rivalId: number,
  routeSeed: number,
): number[][] | null {
  type ApproachOption = { dist: number[][]; score: number };
  const options: ApproachOption[] = [];
  let scans = 0;
  let approachIdx = 0;
  for (const [adx, ady] of NEIGHBOR_DELTAS) {
    scans++;
    if (scans > MAX_LOOP_ITERATIONS_PER_FRAME) break;
    const ax = shelfX + adx;
    const ay = shelfY + ady;
    if (!isWalkable(grid, ax, ay)) continue;
    const dmap = bfsDistances(grid, ax, ay);
    const fromRival = dmap[fromY]?.[fromX] ?? -1;
    if (fromRival < 0) continue;
    const sideBias = ((rivalId * 0.37 + routeSeed * 4 + approachIdx * 0.61) % 1) * 0.35;
    options.push({ dist: dmap, score: fromRival + sideBias });
    approachIdx++;
  }
  if (options.length === 0) return null;
  options.sort((a, b) => a.score - b.score);
  return options[0].dist;
}

/** BFS distance map toward the nearest reachable goal cell. */
function pickGoalDistMap(
  grid: GameState['grid'],
  fromX: number,
  fromY: number,
): number[][] | null {
  let bestD = Infinity;
  let dist: number[][] | null = null;
  let scans = 0;
  for (const g of GOAL_CELLS) {
    scans++;
    if (scans > MAX_LOOP_ITERATIONS_PER_FRAME) break;
    const dmap = bfsDistances(grid, g.x, g.y);
    const d = dmap[fromY]?.[fromX] ?? -1;
    if (d >= 0 && d < bestD) {
      bestD = d;
      dist = dmap;
    }
  }
  return dist;
}

function crowdPenaltyAt(
  s: GameState,
  nx: number,
  ny: number,
  rivalIndex: number,
): number {
  let penalty = 0;
  for (let i = 0; i < s.rivals.length; i++) {
    if (i === rivalIndex) continue;
    const o = s.rivals[i];
    if (o.x === nx && o.y === ny) penalty += 2.5;
    else if (Math.abs(o.x - nx) + Math.abs(o.y - ny) === 1) penalty += 0.8;
  }
  if (s.player.x === nx && s.player.y === ny) penalty += 3;
  return penalty;
}

function scoreMoveCandidate(
  s: GameState,
  r: RivalEntity,
  rivalIndex: number,
  nx: number,
  ny: number,
  dist: number[][],
  cpu: DifficultyConfig,
): MoveCandidate | null {
  const d = dist[ny]?.[nx] ?? -1;
  if (d < 0) return null;
  const moveDir = dirBetween(r.x, r.y, nx, ny);
  if (!moveDir) return null;
  const flow = flowAt(r.x, r.y);
  let tieBreak = 0;
  if (flow && moveDir === flow) tieBreak -= cpu.flowBonus;
  else if (isWrongWay(r.x, r.y, moveDir)) tieBreak += cpu.wrongWayPenalty;
  if (r.lastMoveDir === moveDir) tieBreak -= 0.15;
  else if (r.facing === moveDir) tieBreak -= 0.05;
  tieBreak += crowdPenaltyAt(s, nx, ny, rivalIndex);
  tieBreak += (r.routeSeed - 0.5) * 0.18;
  tieBreak += r.id * 0.04;
  return { x: nx, y: ny, score: d + tieBreak, dir: moveDir };
}

function collectPathCandidates(
  s: GameState,
  r: RivalEntity,
  rivalIndex: number,
  dist: number[][],
  cpu: DifficultyConfig,
): MoveCandidate[] {
  const candidates: MoveCandidate[] = [];
  let scans = 0;
  for (const [dx, dy] of NEIGHBOR_DELTAS) {
    scans++;
    if (scans > MAX_LOOP_ITERATIONS_PER_FRAME) break;
    const nx = r.x + dx;
    const ny = r.y + dy;
    if (!isWalkable(s.grid, nx, ny)) continue;
    const candidate = scoreMoveCandidate(s, r, rivalIndex, nx, ny, dist, cpu);
    if (candidate) candidates.push(candidate);
  }
  candidates.sort((a, b) => a.score - b.score);
  return candidates;
}

type RivalStepResult = {
  rival: RivalEntity;
  collision: boolean;
  attemptDir: Direction | null;
  rivalRivalCollision: { blockerIndex: number } | null;
};

function applyRivalMove(
  s: GameState,
  r: RivalEntity,
  rivalIndex: number,
  moveDir: Direction,
  nx: number,
  ny: number,
  events: GameEvent[],
): RivalStepResult {
  const occupiers = allOccupiers(s);
  const trySlidePast = (
    otherX: number,
    otherY: number,
  ): RivalStepResult | null => {
    const slide = applyHeadOnSlide(
      s.grid,
      r.x,
      r.y,
      moveDir,
      otherX,
      otherY,
      occupiers,
      r.id % 2 === 0 ? 'left' : 'right',
    );
    if (!slide.dir || (slide.x === r.x && slide.y === r.y)) return null;
    const fromX = r.x;
    const fromY = r.y;
    const next = {
      ...r,
      x: slide.x,
      y: slide.y,
      facing: slide.dir,
      lastMoveDir: slide.dir,
    };
    events.push({ type: 'move', who: 'rival', fromX, fromY, dir: slide.dir });
    return { rival: next, collision: false, attemptDir: null, rivalRivalCollision: null };
  };

  if (nx === s.player.x && ny === s.player.y) {
    if (isMusouRunning(s)) {
      return { rival: r, collision: false, attemptDir: null, rivalRivalCollision: null };
    }
    const slid = trySlidePast(s.player.x, s.player.y);
    if (slid) return slid;
    events.push({ type: 'bump', who: 'rival' });
    return { rival: r, collision: true, attemptDir: moveDir, rivalRivalCollision: null };
  }
  if (isCellOccupiedByRival(s, nx, ny, rivalIndex)) {
    const blockerIndex = findRivalIndexAt(s, nx, ny, rivalIndex);
    const blocker = blockerIndex !== null ? s.rivals[blockerIndex] : null;
    if (blocker) {
      const slid = trySlidePast(blocker.x, blocker.y);
      if (slid) return slid;
    }
    events.push({ type: 'bump', who: 'rival' });
    return {
      rival: r,
      collision: false,
      attemptDir: moveDir,
      rivalRivalCollision: blockerIndex !== null ? { blockerIndex } : null,
    };
  }
  const fromX = r.x;
  const fromY = r.y;
  const next = { ...r, x: nx, y: ny, facing: moveDir, lastMoveDir: moveDir };
  events.push({ type: 'move', who: 'rival', fromX, fromY, dir: moveDir });
  return { rival: next, collision: false, attemptDir: null, rivalRivalCollision: null };
}

/** Safety: iteratively separate overlapping CPUs with mutual repulsion. */
function resolveRivalOverlaps(s: GameState): GameState {
  let rivals = [...s.rivals];
  let changed = true;
  let iterations = 0;
  while (changed && iterations < MAX_LOOP_ITERATIONS_PER_FRAME) {
    changed = false;
    iterations++;
    for (let i = 0; i < rivals.length; i++) {
      for (let j = i + 1; j < rivals.length; j++) {
        if (rivals[i].x !== rivals[j].x || rivals[i].y !== rivals[j].y) continue;
        const occupiers = rivals.map((rv) => ({ x: rv.x, y: rv.y }));
        let ax = rivals[i].x;
        let ay = rivals[i].y;
        let bx = rivals[j].x;
        let by = rivals[j].y;
        const repA = applyRepulsionKnockback(s.grid, ax, ay, bx, by, occupiers);
        const repB = applyRepulsionKnockback(s.grid, bx, by, ax, ay, occupiers);
        ax = repA.x;
        ay = repA.y;
        bx = repB.x;
        by = repB.y;
        const sep = separateIfOverlapping(
          s.grid,
          { x: ax, y: ay },
          { x: bx, y: by },
          false,
          false,
        );
        if (
          sep.player.x !== rivals[i].x ||
          sep.player.y !== rivals[i].y ||
          sep.rival.x !== rivals[j].x ||
          sep.rival.y !== rivals[j].y
        ) {
          changed = true;
        }
        rivals[i] = { ...rivals[i], x: sep.player.x, y: sep.player.y };
        rivals[j] = { ...rivals[j], x: sep.rival.x, y: sep.rival.y };
      }
    }
  }
  return { ...s, rivals };
}

/** Forced sidestep to break deadlocks (1–2 cells away from stuck anchor). */
function rivalUnstickStep(
  s: GameState,
  r: RivalEntity,
  rivalIndex: number,
  events: GameEvent[],
): RivalStepResult {
  if (isNarrowCorridorCell(s.grid, r.x, r.y) && r.lastMoveDir) {
    const backDir: Direction =
      r.lastMoveDir === 'up'
        ? 'down'
        : r.lastMoveDir === 'down'
          ? 'up'
          : r.lastMoveDir === 'left'
            ? 'right'
            : 'left';
    const bx = r.x + DELTA[backDir].dx;
    const by = r.y + DELTA[backDir].dy;
    if (isWalkable(s.grid, bx, by) && !isCellOccupied(s, bx, by, rivalIndex)) {
      const result = applyRivalMove(s, r, rivalIndex, backDir, bx, by, events);
      return {
        ...result,
        rival: {
          ...result.rival,
          unstickMovesLeft: Math.max(0, r.unstickMovesLeft - 1),
          stuckMs: 0,
          pushStuckMs: 0,
          pushBlockerIndex: null,
          stuckAnchorX: result.rival.x,
          stuckAnchorY: result.rival.y,
        },
      };
    }
  }

  type EscapeCell = { x: number; y: number; dir: Direction; score: number };
  const escapes: EscapeCell[] = [];
  let scans = 0;
  for (const [dx, dy] of NEIGHBOR_DELTAS) {
    scans++;
    if (scans > MAX_LOOP_ITERATIONS_PER_FRAME) break;
    const nx = r.x + dx;
    const ny = r.y + dy;
    if (!isWalkable(s.grid, nx, ny)) continue;
    const moveDir = dirBetween(r.x, r.y, nx, ny);
    if (!moveDir) continue;
    let score = Math.abs(nx - r.stuckAnchorX) + Math.abs(ny - r.stuckAnchorY);
    score += crowdPenaltyAt(s, nx, ny, rivalIndex);
    if (nx === s.player.x && ny === s.player.y) score += 4;
    if (isCellOccupiedByRival(s, nx, ny, rivalIndex)) score += 6;
    score += ((r.routeSeed + r.id * 0.17) % 1) * 0.4;
    escapes.push({ x: nx, y: ny, dir: moveDir, score });
  }
  escapes.sort((a, b) => a.score - b.score);
  if (escapes.length === 0) {
    return {
      rival: { ...r, unstickMovesLeft: Math.max(0, r.unstickMovesLeft - 1) },
      collision: false,
      attemptDir: null,
      rivalRivalCollision: null,
    };
  }
  const pickIdx =
    (r.id + Math.floor(s.elapsed / 350) + Math.floor(r.routeSeed * 12)) % escapes.length;
  const pick = escapes[pickIdx];
  const result = applyRivalMove(s, r, rivalIndex, pick.dir, pick.x, pick.y, events);
  return {
    ...result,
    rival: {
      ...result.rival,
      unstickMovesLeft: Math.max(0, r.unstickMovesLeft - 1),
      stuckMs: 0,
      stuckAnchorX: result.rival.x,
      stuckAnchorY: result.rival.y,
    },
  };
}

function applyRivalMovementStep(
  s: GameState,
  r: RivalEntity,
  rivalIndex: number,
  cpu: DifficultyConfig,
  events: GameEvent[],
): RivalStepResult {
  if (r.jamGuideHiddenMs > 0) {
    return rivalJamConfusedStep(s, r, rivalIndex, events);
  }
  if (r.unstickMovesLeft > 0) {
    return rivalUnstickStep(s, r, rivalIndex, events);
  }
  return rivalPathStep(s, r, rivalIndex, cpu, events);
}

/** 電波狂乱: 棚へ向かわずランダム移動または停止。 */
function rivalJamConfusedStep(
  s: GameState,
  r: RivalEntity,
  rivalIndex: number,
  events: GameEvent[],
): RivalStepResult {
  if (Math.random() < SKILL_JAM_CONFUSED_STOP_CHANCE) {
    return { rival: r, collision: false, attemptDir: null, rivalRivalCollision: null };
  }

  const dirs: Direction[] = ['up', 'down', 'left', 'right'];
  for (let i = dirs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
  }

  for (const dir of dirs) {
    const { dx, dy } = DELTA[dir];
    const nx = r.x + dx;
    const ny = r.y + dy;
    if (!isWalkable(s.grid, nx, ny)) continue;
    return applyRivalMove(s, r, rivalIndex, dir, nx, ny, events);
  }

  return { rival: r, collision: false, attemptDir: null, rivalRivalCollision: null };
}

function trackRivalStuckState(
  r: RivalEntity,
  beforeX: number,
  beforeY: number,
  stepMs: number,
): RivalEntity {
  const moved = r.x !== beforeX || r.y !== beforeY;
  if (moved) {
    return {
      ...r,
      stuckMs: 0,
      stuckAnchorX: r.x,
      stuckAnchorY: r.y,
    };
  }
  const stuckMs = r.stuckMs + stepMs;
  if (stuckMs >= RIVAL_STUCK_DETECT_MS && r.unstickMovesLeft <= 0) {
    return {
      ...r,
      stuckMs: 0,
      unstickMovesLeft: RIVAL_UNSTICK_MOVE_COUNT,
    };
  }
  return { ...r, stuckMs };
}

function updateNarrowCorridorState(r: RivalEntity, s: GameState): RivalEntity {
  if (isNarrowCorridorCell(s.grid, r.x, r.y)) {
    if (r.narrowCorridorSince < 0) {
      return { ...r, narrowCorridorSince: s.elapsed };
    }
    return r;
  }
  if (r.narrowCorridorSince >= 0) {
    return { ...r, narrowCorridorSince: -1 };
  }
  return r;
}

function trackPushStuckState(
  r: RivalEntity,
  rivalIndex: number,
  moveResult: RivalStepResult,
  beforeX: number,
  beforeY: number,
  stepMs: number,
  s: GameState,
): RivalEntity {
  const moved = r.x !== beforeX || r.y !== beforeY;
  if (moved) {
    return { ...r, pushStuckMs: 0, pushBlockerIndex: null };
  }

  let blockerIndex: number | null = null;
  if (moveResult.collision) {
    blockerIndex = -1;
  } else if (moveResult.rivalRivalCollision) {
    blockerIndex = moveResult.rivalRivalCollision.blockerIndex;
  } else if (moveResult.attemptDir) {
    const { dx, dy } = DELTA[moveResult.attemptDir];
    const tx = beforeX + dx;
    const ty = beforeY + dy;
    const rivalBlocker = findRivalIndexAt(s, tx, ty, rivalIndex);
    if (rivalBlocker !== null) blockerIndex = rivalBlocker;
    else if (s.player.x === tx && s.player.y === ty) blockerIndex = -1;
  }

  if (blockerIndex === null) {
    return { ...r, pushStuckMs: 0, pushBlockerIndex: null };
  }

  const pushStuckMs =
    r.pushBlockerIndex === blockerIndex ? r.pushStuckMs + stepMs : stepMs;

  if (pushStuckMs >= RIVAL_PUSH_STUCK_MS && r.unstickMovesLeft <= 0) {
    return {
      ...r,
      pushStuckMs: 0,
      pushBlockerIndex: blockerIndex,
      unstickMovesLeft: RIVAL_UNSTICK_MOVE_COUNT,
    };
  }
  return { ...r, pushStuckMs, pushBlockerIndex: blockerIndex };
}

/** Goal-directed CPU step with route dispersion among near-optimal moves. */
function rivalPathStep(
  s: GameState,
  r: RivalEntity,
  rivalIndex: number,
  cpu: DifficultyConfig,
  events: GameEvent[],
): RivalStepResult {
  let dist: number[][] | null = null;

  if (r.currentTarget < s.pickCount) {
    const t = r.targets[r.currentTarget];
    if (!t || t.done) {
      return { rival: r, collision: false, attemptDir: null, rivalRivalCollision: null };
    }
    dist = pickShelfApproachDistMap(s.grid, t.x, t.y, r.x, r.y, r.id, r.routeSeed);
  } else {
    dist = pickGoalDistMap(s.grid, r.x, r.y);
  }

  if (!dist) {
    return { rival: r, collision: false, attemptDir: null, rivalRivalCollision: null };
  }

  const candidates = collectPathCandidates(s, r, rivalIndex, dist, cpu);
  if (candidates.length === 0) {
    return { rival: r, collision: false, attemptDir: null, rivalRivalCollision: null };
  }

  const bestScore = candidates[0].score;
  const tied = candidates.filter((c) => c.score <= bestScore + 0.3);
  const pickIdx =
    (r.id + Math.floor(s.elapsed / 400) + Math.floor(r.routeSeed * 10)) % tied.length;
  const best = tied[pickIdx];
  return applyRivalMove(s, r, rivalIndex, best.dir, best.x, best.y, events);
}

export type { GameEvent, StepResult } from './events';

type CollisionEventDetail = Omit<
  Extract<GameEvent, { type: 'collision' }>,
  'type' | 'involvesPlayer' | 'knockbackSeedA' | 'knockbackSeedB'
>;

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
  rivals: RivalEntity[],
  rivalIndex: number,
  events: GameEvent[],
  detail: CollisionEventDetail,
): GameState {
  s.player = player;
  s.rivals = rivals;
  s.collisionFx = 600;
  const rival = rivals[rivalIndex];
  s.collisionPos = {
    x: (player.x + rival.x) / 2 + 0.5,
    y: (player.y + rival.y) / 2 + 0.5,
  };
  s.lastCollisionElapsed = s.elapsed;
  events.push({
    type: 'collision',
    involvesPlayer: true,
    knockbackSeedA: 0,
    knockbackSeedB: rival.id,
    ...detail,
  });
  return s;
}

function allOccupiers(state: GameState): { x: number; y: number }[] {
  return [
    { x: state.player.x, y: state.player.y },
    ...state.rivals.map((r) => ({ x: r.x, y: r.y })),
  ];
}

function applyCollision(
  s: GameState,
  state: GameState,
  rivalIndex: number,
  _input: Input,
  events: GameEvent[],
  opts: {
    playerAttemptDir: Direction | null;
    rivalAttemptDir: Direction | null;
  },
): GameState {
  const px0 = state.player.x;
  const py0 = state.player.y;
  const rx0 = state.rivals[rivalIndex].x;
  const ry0 = state.rivals[rivalIndex].y;
  const playerMoved = s.player.x !== px0 || s.player.y !== py0;
  const rivalMoved =
    s.rivals[rivalIndex].x !== rx0 || s.rivals[rivalIndex].y !== ry0;

  const playerDir = playerMoved
    ? dirBetween(px0, py0, s.player.x, s.player.y)
    : opts.playerAttemptDir;
  const rivalDir = rivalMoved
    ? dirBetween(rx0, ry0, s.rivals[rivalIndex].x, s.rivals[rivalIndex].y)
    : opts.rivalAttemptDir;

  const saved = {
    playerPicking: s.isPicking,
    playerProgress: s.pickProgress,
    rivalPicking: s.rivals[rivalIndex].isPicking,
    rivalProgress: s.rivals[rivalIndex].pickProgress,
  };

  let player = {
    ...s.player,
    lastMoveDir: playerDir,
  };
  let rivals = [...s.rivals];
  let rival = { ...rivals[rivalIndex], lastMoveDir: rivalDir };

  const grid = s.grid;
  const occupiers = allOccupiers(state);
  const pAggressor = attemptedIntoCell(px0, py0, rx0, ry0, playerDir);
  const rAggressor = attemptedIntoCell(rx0, ry0, px0, py0, rivalDir);
  const playerPushThrough = isPushThroughActive(s.skills);
  const rivalSkills = s.rivalSkills[rivalIndex] ?? createInitialSkills();
  const rivalPushThrough = isPushThroughActive(rivalSkills);

  // 無双疾走中: 完全無敵・相手をランダム吹き飛び（走者の位置は固定）
  if (isMusouRunning(s)) {
    if (isAirborneKnockbackActive(rival)) {
      return s;
    }
    const musouX = s.player.x;
    const musouY = s.player.y;
    s = applyRandomKnockbackToTarget(
      s,
      rival.x,
      rival.y,
      { kind: 'rival', id: rival.id },
      events,
    );
    rivals = s.rivals;
    rival = rivals[rivalIndex];
    player = { ...player, x: musouX, y: musouY, stun: 0 };
    return finishCollisionFx(s, player, rivals, rivalIndex, events, {
      type: 'collision',
      playerKnockedBack: false,
      rivalKnockedBack: true,
      playerWrongWay: false,
      rivalWrongWay: false,
      playerPushed: false,
      rivalPushed: true,
    });
  }

  // 相手ゴリ押し + 自分ピッキング中 → 強制ノックバック & キャンセル
  if (rivalPushThrough && saved.playerPicking) {
    const pushDir =
      rivalDir && (rivalMoved || rAggressor)
        ? rivalDir
        : playerDir ?? rival.facing;
    const b = applySimpleKnockback(
      grid,
      px0,
      py0,
      null,
      { x: rx0, y: ry0 },
      'yield',
      pushDir,
      occupiers,
    );
    player = {
      ...player,
      x: b.x,
      y: b.y,
      stun: stunForCollisionKnockback(true, true, isSuperSpeedActive(s.skills)),
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
    rivals[rivalIndex] = rival;

    return finishCollisionFx(s, player, rivals, rivalIndex, events, {
      type: 'collision',
      playerKnockedBack: true,
      rivalKnockedBack: false,
      playerWrongWay: false,
      rivalWrongWay: false,
      playerPushed: true,
      rivalPushed: false,
    });
  }

  // 覇道威圧 → 相手をランダム吹き飛び（ピッキング中なら継続）
  if (playerPushThrough) {
    s = applyRandomKnockbackToTarget(
      s,
      rival.x,
      rival.y,
      { kind: 'rival', id: rival.id },
      events,
    );
    rivals = s.rivals;
    rival = rivals[rivalIndex];
    player = { ...player, stun: 0 };

    const finalized = finalizePickingAfterCollision(
      s,
      rival,
      events,
      saved,
      false,
      true,
    );
    s = finalized.state;
    rival = finalized.rival;
    rivals[rivalIndex] = rival;

    return finishCollisionFx(s, player, rivals, rivalIndex, events, {
      type: 'collision',
      playerKnockedBack: false,
      rivalKnockedBack: true,
      playerWrongWay: false,
      rivalWrongWay: false,
      playerPushed: false,
      rivalPushed: true,
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
      const b = applySimpleKnockback(
        grid,
        px0,
        py0,
        null,
        { x: rx0, y: ry0 },
        'yield',
        pushDir,
        occupiers,
      );
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
      stun: stunForCollisionKnockback(
        playerKnocked,
        false,
        isSuperSpeedActive(s.skills),
      ),
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
    rivals[rivalIndex] = rival;

    return finishCollisionFx(s, player, rivals, rivalIndex, events, {
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

  const inCorridor =
    isNarrowCorridorCell(grid, px0, py0) || isNarrowCorridorCell(grid, rx0, ry0);

  if (pAggressor && rAggressor && playerDir && rivalDir && !pWrong && !rWrong) {
    if (inCorridor) {
      if (rAggressor && rivalDir) {
        const back = backFromCollision(grid, rx0, ry0, rivalDir, { x: px0, y: py0 });
        rival = { ...rival, x: back.x, y: back.y };
      } else if (pAggressor && playerDir) {
        const back = backFromCollision(grid, px0, py0, playerDir, { x: rx0, y: ry0 });
        player = { ...player, x: back.x, y: back.y };
      }
    } else {
      const slideP = applyHeadOnSlide(
        grid,
        px0,
        py0,
        playerDir,
        rx0,
        ry0,
        occupiers,
        'left',
      );
      const slideR = applyHeadOnSlide(
        grid,
        rx0,
        ry0,
        rivalDir,
        px0,
        py0,
        occupiers,
        'right',
      );
      if (slideP.dir) {
        player = {
          ...player,
          x: slideP.x,
          y: slideP.y,
          lastMoveDir: slideP.dir,
          facing: slideP.dir,
        };
      }
      if (slideR.dir) {
        rival = {
          ...rival,
          x: slideR.x,
          y: slideR.y,
          lastMoveDir: slideR.dir,
          facing: slideR.dir,
        };
      }
    }
  } else if (inCorridor && pAggressor && playerDir && !pWrong) {
    const back = backFromCollision(grid, px0, py0, playerDir, { x: rx0, y: ry0 });
    player = { ...player, x: back.x, y: back.y };
  } else if (inCorridor && rAggressor && rivalDir && !rWrong) {
    const back = backFromCollision(grid, rx0, ry0, rivalDir, { x: px0, y: py0 });
    rival = { ...rival, x: back.x, y: back.y };
  }

  const pxKnock = player.x;
  const pyKnock = player.y;
  const rxKnock = rival.x;
  const ryKnock = rival.y;

  if (rWrong) {
    const b = applySimpleKnockback(
      grid,
      rx0,
      ry0,
      rivalDir,
      { x: px0, y: py0 },
      'collision',
      undefined,
      occupiers,
    );
    rival = { ...rival, x: b.x, y: b.y };
  } else if (rYield && playerDir) {
    const b = applySimpleKnockback(
      grid,
      rx0,
      ry0,
      null,
      { x: px0, y: py0 },
      'yield',
      playerDir,
      occupiers,
    );
    rival = { ...rival, x: b.x, y: b.y };
  }

  if (pWrong) {
    const b = applySimpleKnockback(
      grid,
      px0,
      py0,
      playerDir,
      { x: rx0, y: ry0 },
      'collision',
      undefined,
      occupiers,
    );
    player = { ...player, x: b.x, y: b.y };
  } else if (pYield && rivalDir) {
    const b = applySimpleKnockback(
      grid,
      px0,
      py0,
      null,
      { x: rx0, y: ry0 },
      'yield',
      rivalDir,
      occupiers,
    );
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

  player = {
    ...player,
    stun: stunForCollisionKnockback(
      playerKnocked,
      pWrong,
      isSuperSpeedActive(s.skills),
    ),
  };
  rival = {
    ...rival,
    stun: stunForCollisionKnockback(
      rivalKnocked,
      rWrong,
      isSuperSpeedActive(rivalSkills),
    ),
  };

  const finalized = finalizePickingAfterCollision(
    s,
    rival,
    events,
    saved,
    playerKnocked,
    rivalKnocked,
  );
  s = finalized.state;
  player = {
    ...player,
    isPicking: finalized.state.isPicking,
    pickProgress: finalized.state.pickProgress,
  };
  rival = { ...rival, ...finalized.rival };
  rivals[rivalIndex] = rival;

  return finishCollisionFx(s, player, rivals, rivalIndex, events, {
    type: 'collision',
    playerKnockedBack: playerKnocked,
    rivalKnockedBack: rivalKnocked,
    playerWrongWay: pWrong,
    rivalWrongWay: rWrong,
    playerPushed: playerKnocked || pYield,
    rivalPushed: rivalKnocked || rYield,
  });
}

function finalizeRivalKnockbackPicking(
  rival: RivalEntity,
  events: GameEvent[],
  wasPicking: boolean,
  savedProgress: number,
  knocked: boolean,
): RivalEntity {
  if (knocked) {
    if (wasPicking || rival.isPicking) {
      events.push({ type: 'pickCancel', who: 'rival' });
      return { ...rival, isPicking: false, pickProgress: 0 };
    }
    return rival;
  }
  if (wasPicking) {
    return { ...rival, isPicking: true, pickProgress: savedProgress };
  }
  return rival;
}

function finishRivalRivalCollisionFx(
  s: GameState,
  rivals: RivalEntity[],
  indexA: number,
  indexB: number,
  events: GameEvent[],
  detail: CollisionEventDetail,
): GameState {
  s.rivals = rivals;
  s.collisionFx = 600;
  s.collisionPos = {
    x: (rivals[indexA].x + rivals[indexB].x) / 2 + 0.5,
    y: (rivals[indexA].y + rivals[indexB].y) / 2 + 0.5,
  };
  s.lastCollisionElapsed = s.elapsed;
  events.push({
    type: 'collision',
    involvesPlayer: false,
    knockbackSeedA: rivals[indexA].id,
    knockbackSeedB: rivals[indexB].id,
    ...detail,
  });
  return s;
}

/** CPU vs CPU — same wrong-way / yield / knockback / stun rules as player vs CPU. */
function applyRivalRivalCollision(
  s: GameState,
  state: GameState,
  moverIndex: number,
  blockerIndex: number,
  moverAttemptDir: Direction,
  events: GameEvent[],
): GameState {
  const ax0 = state.rivals[moverIndex].x;
  const ay0 = state.rivals[moverIndex].y;
  const bx0 = state.rivals[blockerIndex].x;
  const by0 = state.rivals[blockerIndex].y;

  const aMoved = s.rivals[moverIndex].x !== ax0 || s.rivals[moverIndex].y !== ay0;
  const bMoved = s.rivals[blockerIndex].x !== bx0 || s.rivals[blockerIndex].y !== by0;

  const aDir = aMoved
    ? dirBetween(ax0, ay0, s.rivals[moverIndex].x, s.rivals[moverIndex].y)
    : moverAttemptDir;
  const bDir = bMoved
    ? dirBetween(bx0, by0, s.rivals[blockerIndex].x, s.rivals[blockerIndex].y)
    : null;

  const savedA = {
    picking: s.rivals[moverIndex].isPicking,
    progress: s.rivals[moverIndex].pickProgress,
  };
  const savedB = {
    picking: s.rivals[blockerIndex].isPicking,
    progress: s.rivals[blockerIndex].pickProgress,
  };

  const rivals = [...s.rivals];
  let a = { ...rivals[moverIndex], lastMoveDir: aDir ?? rivals[moverIndex].lastMoveDir };
  let b = { ...rivals[blockerIndex], lastMoveDir: bDir ?? rivals[blockerIndex].lastMoveDir };

  const grid = s.grid;
  const occupiers = allOccupiers(state);
  const aAggressor = attemptedIntoCell(ax0, ay0, bx0, by0, aDir);
  const bAggressor = attemptedIntoCell(bx0, by0, ax0, ay0, bDir);
  const aPushThrough = isPushThroughActive(s.rivalSkills[moverIndex] ?? createInitialSkills());
  const bPushThrough = isPushThroughActive(s.rivalSkills[blockerIndex] ?? createInitialSkills());
  const aSuperSpeed = isSuperSpeedActive(s.rivalSkills[moverIndex] ?? createInitialSkills());
  const bSuperSpeed = isSuperSpeedActive(s.rivalSkills[blockerIndex] ?? createInitialSkills());

  if (aPushThrough && savedB.picking) {
    const pushDir = aDir ?? bDir ?? a.facing;
    const knock = applySimpleKnockback(
      grid,
      bx0,
      by0,
      null,
      { x: ax0, y: ay0 },
      'yield',
      pushDir,
      occupiers,
    );
    b = {
      ...b,
      x: knock.x,
      y: knock.y,
      stun: stunForCollisionKnockback(true, true, bSuperSpeed),
    };
    const sep = separateIfOverlapping(
      grid,
      { x: a.x, y: a.y },
      { x: b.x, y: b.y },
      false,
      true,
    );
    a = { ...a, x: sep.player.x, y: sep.player.y };
    b = {
      ...b,
      x: sep.rival.x,
      y: sep.rival.y,
      stun: stunForCollisionKnockback(true, true, bSuperSpeed),
    };
    b = finalizeRivalKnockbackPicking(b, events, savedB.picking, savedB.progress, true);
    rivals[moverIndex] = a;
    rivals[blockerIndex] = b;
    return finishRivalRivalCollisionFx(s, rivals, moverIndex, blockerIndex, events, {
      type: 'collision',
      playerKnockedBack: false,
      rivalKnockedBack: true,
      playerWrongWay: false,
      rivalWrongWay: false,
      playerPushed: false,
      rivalPushed: true,
    });
  }

  if (bPushThrough && savedA.picking) {
    const pushDir = bDir ?? aDir ?? b.facing;
    const knock = applySimpleKnockback(
      grid,
      ax0,
      ay0,
      null,
      { x: bx0, y: by0 },
      'yield',
      pushDir,
      occupiers,
    );
    a = {
      ...a,
      x: knock.x,
      y: knock.y,
      stun: stunForCollisionKnockback(true, true, aSuperSpeed),
    };
    const sep = separateIfOverlapping(
      grid,
      { x: a.x, y: a.y },
      { x: b.x, y: b.y },
      true,
      false,
    );
    a = {
      ...a,
      x: sep.player.x,
      y: sep.player.y,
      stun: stunForCollisionKnockback(true, true, aSuperSpeed),
    };
    b = { ...b, x: sep.rival.x, y: sep.rival.y };
    a = finalizeRivalKnockbackPicking(a, events, savedA.picking, savedA.progress, true);
    rivals[moverIndex] = a;
    rivals[blockerIndex] = b;
    return finishRivalRivalCollisionFx(s, rivals, moverIndex, blockerIndex, events, {
      type: 'collision',
      playerKnockedBack: true,
      rivalKnockedBack: false,
      playerWrongWay: false,
      rivalWrongWay: false,
      playerPushed: true,
      rivalPushed: false,
    });
  }

  if (aPushThrough) {
    const bKnock = { x: b.x, y: b.y };
    const pushDir = aDir ?? bDir ?? a.facing;
    if (pushDir) {
      const knock = applySimpleKnockback(
        grid,
        bx0,
        by0,
        null,
        { x: ax0, y: ay0 },
        'yield',
        pushDir,
        occupiers,
      );
      b = { ...b, x: knock.x, y: knock.y };
    }
    const sep = separateIfOverlapping(grid, { x: a.x, y: a.y }, { x: b.x, y: b.y }, false, true);
    a = { ...a, x: sep.player.x, y: sep.player.y, stun: 0 };
    b = { ...b, x: sep.rival.x, y: sep.rival.y };
    const bKnocked = b.x !== bKnock.x || b.y !== bKnock.y;
    b = {
      ...b,
      stun: stunForCollisionKnockback(bKnocked, false, bSuperSpeed),
    };
    b = finalizeRivalKnockbackPicking(b, events, savedB.picking, savedB.progress, bKnocked);
    rivals[moverIndex] = a;
    rivals[blockerIndex] = b;
    return finishRivalRivalCollisionFx(s, rivals, moverIndex, blockerIndex, events, {
      type: 'collision',
      playerKnockedBack: false,
      rivalKnockedBack: bKnocked,
      playerWrongWay: false,
      rivalWrongWay: false,
      playerPushed: false,
      rivalPushed: bKnocked,
    });
  }

  if (bPushThrough) {
    const aKnock = { x: a.x, y: a.y };
    const pushDir = bDir ?? aDir ?? b.facing;
    if (pushDir) {
      const knock = applySimpleKnockback(
        grid,
        ax0,
        ay0,
        null,
        { x: bx0, y: by0 },
        'yield',
        pushDir,
        occupiers,
      );
      a = { ...a, x: knock.x, y: knock.y };
    }
    const sep = separateIfOverlapping(grid, { x: a.x, y: a.y }, { x: b.x, y: b.y }, true, false);
    a = { ...a, x: sep.player.x, y: sep.player.y };
    b = { ...b, x: sep.rival.x, y: sep.rival.y, stun: 0 };
    const aKnocked = a.x !== aKnock.x || a.y !== aKnock.y;
    a = {
      ...a,
      stun: stunForCollisionKnockback(aKnocked, false, aSuperSpeed),
    };
    a = finalizeRivalKnockbackPicking(a, events, savedA.picking, savedA.progress, aKnocked);
    rivals[moverIndex] = a;
    rivals[blockerIndex] = b;
    return finishRivalRivalCollisionFx(s, rivals, moverIndex, blockerIndex, events, {
      type: 'collision',
      playerKnockedBack: aKnocked,
      rivalKnockedBack: false,
      playerWrongWay: false,
      rivalWrongWay: false,
      playerPushed: aKnocked,
      rivalPushed: false,
    });
  }

  const aWrong = isWrongWay(ax0, ay0, aDir);
  const bWrong = isWrongWay(bx0, by0, bDir);
  const aYield = !aWrong && !bWrong && bAggressor && !aAggressor && bDir;
  const bYield = !aWrong && !bWrong && aAggressor && !bAggressor && aDir;

  const inCorridor =
    isNarrowCorridorCell(grid, ax0, ay0) || isNarrowCorridorCell(grid, bx0, by0);

  if (aAggressor && bAggressor && aDir && bDir && !aWrong && !bWrong) {
    if (inCorridor) {
      const aTime = a.narrowCorridorSince >= 0 ? a.narrowCorridorSince : s.elapsed;
      const bTime = b.narrowCorridorSince >= 0 ? b.narrowCorridorSince : s.elapsed;
      if (aTime >= bTime) {
        const back = backFromCollision(grid, ax0, ay0, aDir, { x: bx0, y: by0 });
        a = { ...a, x: back.x, y: back.y };
      } else {
        const back = backFromCollision(grid, bx0, by0, bDir, { x: ax0, y: ay0 });
        b = { ...b, x: back.x, y: back.y };
      }
    } else {
      const slideA = applyHeadOnSlide(
        grid,
        ax0,
        ay0,
        aDir,
        bx0,
        by0,
        occupiers,
        a.id % 2 === 0 ? 'left' : 'right',
      );
      const slideB = applyHeadOnSlide(
        grid,
        bx0,
        by0,
        bDir,
        ax0,
        ay0,
        occupiers,
        b.id % 2 === 0 ? 'left' : 'right',
      );
      if (slideA.dir) {
        a = {
          ...a,
          x: slideA.x,
          y: slideA.y,
          lastMoveDir: slideA.dir,
          facing: slideA.dir,
        };
      }
      if (slideB.dir) {
        b = {
          ...b,
          x: slideB.x,
          y: slideB.y,
          lastMoveDir: slideB.dir,
          facing: slideB.dir,
        };
      }
    }
  } else if (inCorridor && aAggressor && aDir && !aWrong) {
    const back = backFromCollision(grid, ax0, ay0, aDir, { x: bx0, y: by0 });
    a = { ...a, x: back.x, y: back.y };
  } else if (inCorridor && bAggressor && bDir && !bWrong) {
    const back = backFromCollision(grid, bx0, by0, bDir, { x: ax0, y: ay0 });
    b = { ...b, x: back.x, y: back.y };
  }

  const axKnock = a.x;
  const ayKnock = a.y;
  const bxKnock = b.x;
  const byKnock = b.y;

  if (bWrong) {
    const knock = applySimpleKnockback(
      grid,
      bx0,
      by0,
      bDir,
      { x: ax0, y: ay0 },
      'collision',
      undefined,
      occupiers,
    );
    b = { ...b, x: knock.x, y: knock.y };
  } else if (bYield && aDir) {
    const knock = applySimpleKnockback(
      grid,
      bx0,
      by0,
      null,
      { x: ax0, y: ay0 },
      'yield',
      aDir,
      occupiers,
    );
    b = { ...b, x: knock.x, y: knock.y };
  }

  if (aWrong) {
    const knock = applySimpleKnockback(
      grid,
      ax0,
      ay0,
      aDir,
      { x: bx0, y: by0 },
      'collision',
      undefined,
      occupiers,
    );
    a = { ...a, x: knock.x, y: knock.y };
  } else if (aYield && bDir) {
    const knock = applySimpleKnockback(
      grid,
      ax0,
      ay0,
      null,
      { x: bx0, y: by0 },
      'yield',
      bDir,
      occupiers,
    );
    a = { ...a, x: knock.x, y: knock.y };
  }

  const sep = separateIfOverlapping(
    grid,
    { x: a.x, y: a.y },
    { x: b.x, y: b.y },
    aWrong,
    bWrong,
  );
  a = { ...a, x: sep.player.x, y: sep.player.y };
  b = { ...b, x: sep.rival.x, y: sep.rival.y };

  if (a.x === b.x && a.y === b.y) {
    const repA = applyRepulsionKnockback(grid, a.x, a.y, b.x, b.y, occupiers);
    const repB = applyRepulsionKnockback(grid, b.x, b.y, a.x, a.y, occupiers);
    a = { ...a, x: repA.x, y: repA.y };
    b = { ...b, x: repB.x, y: repB.y };
    const sep2 = separateIfOverlapping(
      grid,
      { x: a.x, y: a.y },
      { x: b.x, y: b.y },
      aWrong,
      bWrong,
    );
    a = { ...a, x: sep2.player.x, y: sep2.player.y };
    b = { ...b, x: sep2.rival.x, y: sep2.rival.y };
  }

  const aKnocked = a.x !== axKnock || a.y !== ayKnock;
  const bKnocked = b.x !== bxKnock || b.y !== byKnock;

  a = {
    ...a,
    stun: stunForCollisionKnockback(aKnocked, aWrong, aSuperSpeed),
  };
  b = {
    ...b,
    stun: stunForCollisionKnockback(bKnocked, bWrong, bSuperSpeed),
  };
  a = finalizeRivalKnockbackPicking(a, events, savedA.picking, savedA.progress, aKnocked);
  b = finalizeRivalKnockbackPicking(b, events, savedB.picking, savedB.progress, bKnocked);

  rivals[moverIndex] = a;
  rivals[blockerIndex] = b;

  return finishRivalRivalCollisionFx(s, rivals, moverIndex, blockerIndex, events, {
    type: 'collision',
    playerKnockedBack: aKnocked,
    rivalKnockedBack: bKnocked,
    playerWrongWay: aWrong,
    rivalWrongWay: bWrong,
    playerPushed: aKnocked || aYield,
    rivalPushed: bKnocked || bYield,
  });
}

export function step(state: GameState, input: Input, dtMs: number): StepResult {
  const playable = state.phase === 'playing' || state.phase === 'tutorial';
  if (!playable) return { state, events: [] };
  const events: GameEvent[] = [];
  let s: GameState = { ...state, version: state.version + 1 };
  const prevPlayerCell = { x: s.player.x, y: s.player.y };
  const prevRivalCells = s.rivals.map((r) => ({ id: r.id, x: r.x, y: r.y }));
  s = tickSkills(s, dtMs);
  s = tickSkillEntityTimers(s, dtMs);
  s.elapsed += dtMs;
  s = { ...s, traps: tickTrapAnimations(s.traps, dtMs) };

  const comboTick = tickComboExpiry(s.pickCombo, s.lastPickSuccessElapsed, s.elapsed);
  if (comboTick.expired) {
    s.pickCombo = 0;
  }

  if (input.useSkill && s.player.stun <= 0 && !s.player.knockback) {
    const used = useSkill(s);
    s = used.state;
    if (used.used && used.skillId) {
      events.push({ type: 'skillUsed', skill: used.skillId });
      if (used.skillId === SkillType.JamSignal) {
        events.push({
          type: 'jamSignal',
          x: s.player.x,
          y: s.player.y,
          radius: SKILL_JAM_RADIUS,
        });
      }
    }
  }

  if (isMusouRunning(s)) {
    s = stepMusouRun(s, dtMs, events);
  }

  if (isPushThroughActive(s.skills)) {
    s = stepHadouEffects(s, events);
  }

  if (s.collisionFx > 0) s.collisionFx = Math.max(0, s.collisionFx - dtMs);
  if (s.yieldFxTimer > 0) {
    s.yieldFxTimer = Math.max(0, s.yieldFxTimer - dtMs);
    if (s.yieldFxTimer === 0) s.yieldFx = null;
  }

  let collision = false;
  let playerAttemptDir: Direction | null = null;
  let rivalAttemptDir: Direction | null = null;
  let collisionRivalIndex: number | null = null;

  if (s.player.knockback || s.player.stun > 0) {
    if (s.player.knockback) {
      const tick = tickKnockbackEntity(
        s.player,
        s.grid,
        dtMs,
        (nx, ny) => isCellOccupied(s, nx, ny),
      );
      s.player = {
        ...s.player,
        x: tick.x,
        y: tick.y,
        knockback: tick.knockback,
        stun: tick.stun,
      };
      if (tick.hitWall) {
        events.push({ type: 'knockbackWallHit', who: 'player', x: tick.x, y: tick.y });
      }
    } else {
      s.player = { ...s.player, stun: Math.max(0, s.player.stun - dtMs) };
    }
  } else if (!isMusouRunning(s) && input.dir && !s.isPicking) {
    const { dx, dy } = DELTA[input.dir];
    const nx = s.player.x + dx;
    const ny = s.player.y + dy;
    const fromX = s.player.x;
    const fromY = s.player.y;
    s.player = { ...s.player, facing: FACING_FROM_DIR[input.dir] };
    const blockingRival = s.rivals.findIndex((r) => r.x === nx && r.y === ny);
    if (blockingRival >= 0) {
      collision = true;
      collisionRivalIndex = blockingRival;
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
          const comboResult = registerPickComboSuccess(
            s.pickCombo,
            s.lastPickSuccessElapsed,
            s.elapsed,
          );
          s.pickCombo = comboResult.combo;
          s.maxPickCombo = Math.max(s.maxPickCombo, comboResult.combo);
          s.lastPickSuccessElapsed = s.elapsed;
          events.push({ type: 'pickDone', who: 'player', index: s.currentTarget });
          if (comboResult.chained) {
            events.push({ type: 'pickCombo', combo: comboResult.combo, tier: comboResult.tier });
          }
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

  const rivals = [...s.rivals];
  const rivalRivalCollisions: { mover: number; blocker: number; dir: Direction }[] = [];
  let rivalStepIterations = 0;
  for (let i = 0; i < rivals.length; i++) {
    rivalStepIterations++;
    if (rivalStepIterations > MAX_LOOP_ITERATIONS_PER_FRAME) break;
    const stepState = { ...s, rivals: [...rivals] };
    const rivalResult =
      s.phase === 'tutorial' && !s.tutorialRivalActive && !s.tutorialRivalForcePick
        ? {
            rival: rivals[i],
            collision: false,
            attemptDir: null as Direction | null,
            rivalRivalCollision: null,
          }
        : stepOneRival(stepState, rivals[i], i, dtMs, events);
    rivals[i] = rivalResult.rival;
    if (rivalResult.collision) {
      collision = true;
      collisionRivalIndex = i;
      rivalAttemptDir = rivalResult.attemptDir;
    }
    if (rivalResult.rivalRivalCollision && rivalResult.attemptDir) {
      rivalRivalCollisions.push({
        mover: i,
        blocker: rivalResult.rivalRivalCollision.blockerIndex,
        dir: rivalResult.attemptDir,
      });
    }
  }
  s = { ...s, rivals };

  if (playable && collision && collisionRivalIndex !== null) {
    s = applyCollision(s, state, collisionRivalIndex, input, events, {
      playerAttemptDir,
      rivalAttemptDir,
    });
  }

  let rivalRivalCollisionIterations = 0;
  for (const col of rivalRivalCollisions) {
    rivalRivalCollisionIterations++;
    if (rivalRivalCollisionIterations > MAX_LOOP_ITERATIONS_PER_FRAME) break;
    s = applyRivalRivalCollision(s, state, col.mover, col.blocker, col.dir, events);
  }

  // Safety: never allow player and a CPU on the same tile
  let overlapSepIterations = 0;
  for (let i = 0; i < s.rivals.length; i++) {
    overlapSepIterations++;
    if (overlapSepIterations > MAX_LOOP_ITERATIONS_PER_FRAME) break;
    if (s.player.x !== s.rivals[i].x || s.player.y !== s.rivals[i].y) continue;

    if (isMusouRunning(s)) {
      continue;
    }

    const sep = separateIfOverlapping(
      s.grid,
      { x: s.player.x, y: s.player.y },
      { x: s.rivals[i].x, y: s.rivals[i].y },
      false,
      false,
    );
    s.player = { ...s.player, x: sep.player.x, y: sep.player.y };
    const nextRivals = [...s.rivals];
    nextRivals[i] = { ...nextRivals[i], x: sep.rival.x, y: sep.rival.y };
    s = { ...s, rivals: nextRivals };
  }

  s = resolveRivalOverlaps(s);

  s = resolveTrapEntries(s, prevPlayerCell, prevRivalCells, events);

  if (s.phase === 'playing' && s.currentTarget >= s.pickCount) {
    if (isGoalCell(s.grid, s.player.x, s.player.y)) {
      s = registerFinish(s, { kind: 'player' });
      events.push({ type: 'win' });
      s.phase = 'won';
    }
  }
  if (s.phase === 'playing' && s.rivals.some((r) => r.reachedGoal)) {
    const finisher = s.rivals.find((r) => r.reachedGoal);
    if (finisher) {
      s = registerFinish(s, { kind: 'rival', id: finisher.id });
    }
    events.push({ type: 'lose' });
    s.phase = 'lost';
  }

  return { state: s, events };
}

function stepOneRival(
  s: GameState,
  rival: RivalEntity,
  rivalIndex: number,
  dtMs: number,
  events: GameEvent[],
): RivalStepResult {
  let r = { ...rival };
  let collision = false;
  let attemptDir: Direction | null = null;
  const cpu = getDifficultyConfig(s.difficulty);

  if (s.tutorialRivalBlock) {
    return { rival: r, collision, attemptDir, rivalRivalCollision: null };
  }

  if (r.knockback) {
    const tick = tickKnockbackEntity(
      r,
      s.grid,
      dtMs,
      (nx, ny) => isCellOccupied(s, nx, ny, rivalIndex),
    );
    r = { ...r, x: tick.x, y: tick.y, knockback: tick.knockback, stun: tick.stun };
    if (tick.hitWall) {
      events.push({
        type: 'knockbackWallHit',
        who: 'rival',
        rivalId: r.id,
        x: tick.x,
        y: tick.y,
      });
    }
    return { rival: r, collision, attemptDir, rivalRivalCollision: null };
  }

  if (s.tutorialRivalForcePick) {
    if (r.stun > 0) {
      r.stun = Math.max(0, r.stun - dtMs);
      if (r.stun === 0) r.jamStun = false;
      return { rival: r, collision, attemptDir, rivalRivalCollision: null };
    }
    if (r.isPicking) {
      r.pickProgress = Math.min(0.95, r.pickProgress + dtMs / cpu.pickMs);
      events.push({ type: 'pickProgress', who: 'rival', progress: r.pickProgress });
    }
    return { rival: r, collision, attemptDir, rivalRivalCollision: null };
  }

  if (r.stun > 0) {
    r.stun = Math.max(0, r.stun - dtMs);
    if (r.stun === 0) r.jamStun = false;
    return { rival: r, collision, attemptDir, rivalRivalCollision: null };
  }

  if (r.jamGuideHiddenMs > 0 && r.isPicking) {
    r.isPicking = false;
    r.pickProgress = 0;
    events.push({ type: 'pickCancel', who: 'rival' });
  }

  const rt = r.targets[r.currentTarget];
  if (rt && !rt.done && r.jamGuideHiddenMs <= 0) {
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
          events.push({ type: 'pickDone', who: 'rival', index: r.currentTarget, entityId: r.id });
          r.currentTarget += 1;
          r.pickWaitTimer = 0;
        }
      }
    } else if (adjacent) {
      if (cpu.pickDelayMs > 0) {
        if (r.pickWaitTimer <= 0) r.pickWaitTimer = cpu.pickDelayMs;
        r.pickWaitTimer -= dtMs;
        if (r.pickWaitTimer > 0) {
          return { rival: r, collision, attemptDir, rivalRivalCollision: null };
        }
      }
      r.pickWaitTimer = 0;
      r.isPicking = true;
      r.pickProgress = 0;
      events.push({ type: 'pickStart', who: 'rival' });
    }
  } else if (r.isPicking && r.jamGuideHiddenMs <= 0) {
    r.isPicking = false;
    r.pickProgress = 0;
    events.push({ type: 'pickCancel', who: 'rival' });
  }

  if (r.isPicking) return { rival: r, collision, attemptDir, rivalRivalCollision: null };

  // Tutorial steps 4–5: simple lane patrol for collision practice
  if (s.phase === 'tutorial' && s.tutorialRivalActive) {
    r.moveTimer += dtMs;
    if (r.moveTimer < cpu.stepMs) return { rival: r, collision, attemptDir, rivalRivalCollision: null };
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
      } else if (isWalkable(s.grid, nx, ny) && !isCellOccupied(s, nx, ny, rivalIndex)) {
        const fromX = r.x;
        const fromY = r.y;
        r.x = nx;
        r.y = ny;
        r.facing = moveDir;
        r.lastMoveDir = moveDir;
        events.push({ type: 'move', who: 'rival', fromX, fromY, dir: moveDir });
      }
    }
    return { rival: r, collision, attemptDir, rivalRivalCollision: null };
  }

  if (r.currentTarget >= s.pickCount) {
    if (isGoalCell(s.grid, r.x, r.y)) {
      r.reachedGoal = true;
      return { rival: r, collision, attemptDir, rivalRivalCollision: null };
    }
  }

  r.moveTimer += dtMs;
  if (r.moveTimer < cpu.stepMs) return { rival: r, collision, attemptDir, rivalRivalCollision: null };
  r.moveTimer -= cpu.stepMs;

  if (cpu.hesitateChance > 0 && Math.random() < cpu.hesitateChance) {
    return { rival: r, collision, attemptDir, rivalRivalCollision: null };
  }

  if (r.currentTarget < s.pickCount) {
    const t = r.targets[r.currentTarget];
    if (!t || t.done) {
      r.currentTarget++;
      return { rival: r, collision, attemptDir, rivalRivalCollision: null };
    }
  }

  const beforeX = r.x;
  const beforeY = r.y;
  r = updateNarrowCorridorState(r, s);
  const moveResult = applyRivalMovementStep(s, r, rivalIndex, cpu, events);
  r = trackRivalStuckState(moveResult.rival, beforeX, beforeY, cpu.stepMs);
  r = trackPushStuckState(r, rivalIndex, moveResult, beforeX, beforeY, cpu.stepMs, s);
  return {
    rival: r,
    collision: moveResult.collision,
    attemptDir: moveResult.attemptDir,
    rivalRivalCollision: moveResult.rivalRivalCollision,
  };
}

const DEFAULT_KNOCKBACK_FORCE = 1.5;
const DEFAULT_KNOCKBACK_DURATION_MS = 400;

function isTrapTargetSlippable(state: GameState, target: KnockbackTarget): boolean {
  if (target.kind === 'player') {
    const p = state.player;
    return !p.knockback && p.stun <= 0;
  }
  const rival = state.rivals.find((r) => r.id === target.id);
  return rival != null && !rival.knockback && rival.stun <= 0;
}

function tryApplyBananaPeel(
  state: GameState,
  x: number,
  y: number,
  target: KnockbackTarget,
  moveDir: Direction | null,
  events: GameEvent[],
): GameState {
  const peelIndex = findActiveBananaPeelIndex(state, x, y);
  if (peelIndex < 0) return state;

  if (target.kind === 'player' && isMusouRunning(state)) {
    const traps = [...state.traps];
    traps[peelIndex] = beginBananaPeelFade(traps[peelIndex], { x: 0, y: 0 });
    return { ...state, traps, version: state.version + 1 };
  }

  if (!isTrapTargetSlippable(state, target)) return state;

  const facing =
    target.kind === 'player'
      ? state.player.facing
      : state.rivals.find((r) => r.id === target.id)?.facing ?? 'down';
  const lastMoveDir =
    target.kind === 'player'
      ? state.player.lastMoveDir
      : state.rivals.find((r) => r.id === target.id)?.lastMoveDir ?? null;

  const slipDir = slipDirectionFromFacing(facing, moveDir ?? lastMoveDir);
  const trapSeed = state.traps[peelIndex].id * 97 + x * 13 + y * 7;

  const kbResult = applyKnockback(
    state,
    target,
    slipDir,
    BANANA_SLIP_FORCE,
    BANANA_SLIP_DURATION_MS,
    true,
    { peakScale: BANANA_PEAK_SCALE, liftPx: BANANA_LIFT_PX },
  );

  const traps = [...kbResult.state.traps];
  traps[peelIndex] = beginBananaPeelFade(traps[peelIndex], slipDir);

  events.push({
    type: 'trapTriggered',
    kind: 'bananaPeel',
    x,
    y,
    who: target.kind === 'player' ? 'player' : 'rival',
    rivalId: target.kind === 'rival' ? target.id : undefined,
    seed: trapSeed,
  });
  events.push(...kbResult.events);

  return { ...kbResult.state, traps };
}

function resolveTrapEntries(
  state: GameState,
  prevPlayer: { x: number; y: number },
  prevRivals: { id: number; x: number; y: number }[],
  events: GameEvent[],
): GameState {
  if (state.phase !== 'playing') return state;

  let s = state;
  if (s.player.x !== prevPlayer.x || s.player.y !== prevPlayer.y) {
    s = tryApplyBananaPeel(s, s.player.x, s.player.y, { kind: 'player' }, s.player.lastMoveDir, events);
  }

  for (const rival of s.rivals) {
    const prev = prevRivals.find((p) => p.id === rival.id);
    if (!prev) continue;
    if (rival.x !== prev.x || rival.y !== prev.y) {
      s = tryApplyBananaPeel(
        s,
        rival.x,
        rival.y,
        { kind: 'rival', id: rival.id },
        rival.lastMoveDir,
        events,
      );
    }
  }

  return s;
}

/**
 * Apply generic knockback to player or CPU — for traps, gimmicks, and items.
 * Sets motion vector, stun, and emits knockback events (SFX/VFX handled in App).
 */
export function applyKnockback(
  state: GameState,
  target: KnockbackTarget,
  direction: KnockbackDirection,
  force = DEFAULT_KNOCKBACK_FORCE,
  durationMs = DEFAULT_KNOCKBACK_DURATION_MS,
  isAirborne = false,
  visualOpts?: KnockbackVisualOpts,
): StepResult {
  const events: GameEvent[] = [];
  let s: GameState = { ...state, version: state.version + 1 };
  const seed = Math.floor(Math.random() * 10000);
  const kb = createKnockbackState(direction, force, durationMs, seed, isAirborne, visualOpts);
  const facing = facingFromKnockback(direction);

  if (target.kind === 'player') {
    if (s.isPicking) {
      s = { ...s, isPicking: false, pickProgress: 0 };
      events.push({ type: 'pickCancel', who: 'player' });
    }
    s.player = {
      ...s.player,
      knockback: kb,
      stun: isAirborne ? 0 : durationMs,
      facing,
    };
    events.push({
      type: 'knockback',
      who: 'player',
      x: s.player.x,
      y: s.player.y,
      dirX: kb.dirX,
      dirY: kb.dirY,
      force,
      durationMs,
      seed,
      isAirborne,
    });
    return { state: s, events };
  }

  const rivalIndex = s.rivals.findIndex((r) => r.id === target.id);
  if (rivalIndex < 0) return { state, events: [] };

  let rival = s.rivals[rivalIndex];
  if (rival.isPicking) {
    rival = { ...rival, isPicking: false, pickProgress: 0 };
    events.push({ type: 'pickCancel', who: 'rival' });
  }
  rival = {
    ...rival,
    knockback: kb,
    stun: isAirborne ? 0 : durationMs,
    facing,
  };
  const rivals = [...s.rivals];
  rivals[rivalIndex] = rival;
  s = { ...s, rivals };
  events.push({
    type: 'knockback',
    who: 'rival',
    rivalId: rival.id,
    x: rival.x,
    y: rival.y,
    dirX: kb.dirX,
    dirY: kb.dirY,
    force,
    durationMs,
    seed,
    isAirborne,
  });
  return { state: s, events };
}
