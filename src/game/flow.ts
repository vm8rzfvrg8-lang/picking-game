import {
  COLLISION_STUN_LOSER_MS,
  COLLISION_STUN_WINNER_MS,
  Direction,
  Tile,
} from './constants';
import {
  MAIN_AISLE_Y_BOTTOM,
  MAIN_AISLE_Y_TOP,
  SUB_AISLE_XS,
  isWalkable,
} from './levelgen';
import { GRID_H, GRID_W } from './constants';

export type LaneKind = 'main' | 'sub' | 'other';

export function laneAt(x: number, y: number): LaneKind {
  if (y === MAIN_AISLE_Y_TOP || y === MAIN_AISLE_Y_BOTTOM) return 'main';
  if ((SUB_AISLE_XS as readonly number[]).includes(x)) return 'sub';
  return 'other';
}

export function flowAt(x: number, y: number): Direction | null {
  if (y === MAIN_AISLE_Y_TOP) return 'right';
  if (y === MAIN_AISLE_Y_BOTTOM) return 'left';
  const idx = (SUB_AISLE_XS as readonly number[]).indexOf(x);
  if (idx >= 0 && y !== MAIN_AISLE_Y_TOP && y !== MAIN_AISLE_Y_BOTTOM) {
    return idx % 2 === 0 ? 'up' : 'down';
  }
  return null;
}

export function isWrongWay(x: number, y: number, moveDir: Direction | null): boolean {
  if (!moveDir) return false;
  const flow = flowAt(x, y);
  if (!flow) return false;
  return moveDir !== flow;
}

export function isFollowingFlow(x: number, y: number, dir: Direction | null): boolean {
  if (!dir) return false;
  const flow = flowAt(x, y);
  return flow !== null && dir === flow;
}

const OPPOSITE_DIR: Record<Direction, Direction> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

/** Classify departure from a lane tile for trail FX. */
export function classifyMoveTrail(
  gx: number,
  gy: number,
  moveDir: Direction,
): 'flow' | 'wrong' | null {
  const flow = flowAt(gx, gy);
  if (!flow) return null;
  if (moveDir === flow) return 'flow';
  if (moveDir === OPPOSITE_DIR[flow]) return 'wrong';
  return null;
}

/** Draw a tinted flow arrow for movement trail (1s fade). */
export function drawFlowTrailArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tileSize: number,
  kind: 'flow' | 'wrong',
  alpha: number,
) {
  const flow = flowAt(x, y);
  if (!flow || alpha <= 0) return;
  const cx = x * tileSize + tileSize / 2;
  const cy = y * tileSize + tileSize / 2;
  const color =
    kind === 'flow'
      ? `rgba(50, 200, 95, ${0.78 * alpha})`
      : `rgba(235, 55, 50, ${0.78 * alpha})`;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle =
    kind === 'flow'
      ? `rgba(50, 200, 95, ${0.22 * alpha})`
      : `rgba(235, 55, 50, ${0.22 * alpha})`;
  ctx.fillRect(x * tileSize + 2, y * tileSize + 2, tileSize - 4, tileSize - 4);
  ctx.fillStyle = color;
  ctx.translate(cx, cy);
  const rot: Record<Direction, number> = {
    up: -Math.PI / 2,
    down: Math.PI / 2,
    left: Math.PI,
    right: 0,
  };
  ctx.rotate(rot[flow]);
  const tip = 8;
  const base = 5.5;
  ctx.beginPath();
  ctx.moveTo(tip, 0);
  ctx.lineTo(-tip * 0.55, -base);
  ctx.lineTo(-tip * 0.55, base);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

const DELTA: Record<Direction, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

const OPPOSITE: Record<Direction, Direction> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

/**
 * Back 1 cell opposite to the floor arrow on (x,y).
 * Tries: opposite to arrow → along arrow → sideways. Never lands on avoid cell.
 */
export function backOppositeFlowArrow(
  grid: Tile[][],
  x: number,
  y: number,
  avoid?: { x: number; y: number } | null,
): { x: number; y: number } {
  const flow = flowAt(x, y);
  if (!flow) return { x, y };

  const tryCell = (nx: number, ny: number): { x: number; y: number } | null => {
    if (avoid && nx === avoid.x && ny === avoid.y) return null;
    if (isWalkable(grid, nx, ny)) return { x: nx, y: ny };
    return null;
  };

  const dirs: Direction[] = [OPPOSITE[flow], flow];
  // Perpendicular fallbacks when both lane directions blocked
  if (flow === 'left' || flow === 'right') {
    dirs.push('up', 'down');
  } else {
    dirs.push('left', 'right');
  }

  for (const dir of dirs) {
    const nx = x + DELTA[dir].dx;
    const ny = y + DELTA[dir].dy;
    const hit = tryCell(nx, ny);
    if (hit) return hit;
  }

  return { x, y };
}

export function attemptedIntoCell(
  fromX: number,
  fromY: number,
  targetX: number,
  targetY: number,
  moveDir: Direction | null,
): boolean {
  if (!moveDir) return false;
  const { dx, dy } = DELTA[moveDir];
  return fromX + dx === targetX && fromY + dy === targetY;
}

/** Passive party yields one step along the bumper's direction, or away if blocked. */
export function backAsYield(
  grid: Tile[][],
  x: number,
  y: number,
  aggressorDir: Direction,
  avoid?: { x: number; y: number } | null,
): { x: number; y: number } {
  const tryCell = (dir: Direction): { x: number; y: number } | null => {
    const nx = x + DELTA[dir].dx;
    const ny = y + DELTA[dir].dy;
    if (avoid && nx === avoid.x && ny === avoid.y) return null;
    if (isWalkable(grid, nx, ny)) return { x: nx, y: ny };
    return null;
  };

  const along = tryCell(aggressorDir);
  if (along) return along;
  const away = tryCell(OPPOSITE[aggressorDir]);
  if (away) return away;
  return backFromCollision(grid, x, y, null, avoid);
}

/** Back after a bump: lane tiles use arrow rules; off-lane uses opposite of move dir. */
export function backFromCollision(
  grid: Tile[][],
  x: number,
  y: number,
  moveDir: Direction | null,
  avoid?: { x: number; y: number } | null,
): { x: number; y: number } {
  if (flowAt(x, y)) return backOppositeFlowArrow(grid, x, y, avoid);
  if (!moveDir) return { x, y };
  const backDir = OPPOSITE[moveDir];
  const nx = x + DELTA[backDir].dx;
  const ny = y + DELTA[backDir].dy;
  if (avoid && nx === avoid.x && ny === avoid.y) return { x, y };
  if (isWalkable(grid, nx, ny)) return { x: nx, y: ny };
  return { x, y };
}

/** If two entities share a cell, push the wrong-way one (or rival) to a free neighbor. */
export function separateIfOverlapping(
  grid: Tile[][],
  player: { x: number; y: number },
  rival: { x: number; y: number },
  playerWrong: boolean,
  rivalWrong: boolean,
): { player: { x: number; y: number }; rival: { x: number; y: number } } {
  if (player.x !== rival.x || player.y !== rival.y) {
    return { player, rival };
  }

  const cx = player.x;
  const cy = player.y;
  const freeNeighbors: { x: number; y: number }[] = [];
  for (const dir of ['up', 'down', 'left', 'right'] as Direction[]) {
    const nx = cx + DELTA[dir].dx;
    const ny = cy + DELTA[dir].dy;
    if (isWalkable(grid, nx, ny)) freeNeighbors.push({ x: nx, y: ny });
  }

  if (freeNeighbors.length === 0) return { player, rival };

  // Prefer moving the wrong-way entity out; if both/neither, move rival
  const moveRival =
    (rivalWrong && !playerWrong) || (!rivalWrong && !playerWrong) || (rivalWrong && playerWrong);

  if (moveRival) {
    const dest = freeNeighbors[0];
    return { player, rival: dest };
  }
  return { player: freeNeighbors[0], rival };
}

/** Find a walkable cell one step sideways from (x,y), preferring sub-aisle direction. */
export function findYieldCell(
  grid: Tile[][],
  x: number,
  y: number,
  moveDir: Direction | null,
): { x: number; y: number } | null {
  const sideDirs: Direction[] =
    moveDir === 'left' || moveDir === 'right' ? ['up', 'down'] : ['left', 'right'];
  for (const d of sideDirs) {
    const { dx, dy } = DELTA[d];
    const nx = x + dx;
    const ny = y + dy;
    if (isWalkable(grid, nx, ny)) return { x: nx, y: ny };
  }
  for (const d of ['up', 'down', 'left', 'right'] as Direction[]) {
    const { dx, dy } = DELTA[d];
    const nx = x + dx;
    const ny = y + dy;
    if (isWalkable(grid, nx, ny)) return { x: nx, y: ny };
  }
  return null;
}

/** Stun (wobble stars) only for parties displaced by collision resolution. */
export function stunForCollisionKnockback(knockedBack: boolean, wrongWay: boolean): number {
  if (!knockedBack) return 0;
  return wrongWay ? COLLISION_STUN_LOSER_MS : COLLISION_STUN_WINNER_MS;
}

/** Draw flow arrow on floor tile (called from renderer). */
export function drawFlowArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tileSize: number,
  wrongWayFlash = false,
) {
  const flow = flowAt(x, y);
  if (!flow) return;
  const cx = x * tileSize + tileSize / 2;
  const cy = y * tileSize + tileSize / 2;
  const color = wrongWayFlash ? 'rgba(255,90,90,0.75)' : 'rgba(255,255,255,0.22)';
  ctx.save();
  ctx.fillStyle = color;
  ctx.translate(cx, cy);
  const rot: Record<Direction, number> = {
    up: -Math.PI / 2,
    down: Math.PI / 2,
    left: Math.PI,
    right: 0,
  };
  ctx.rotate(rot[flow]);
  // ▼ 三角矢印
  const tip = 8;
  const base = 5.5;
  ctx.beginPath();
  ctx.moveTo(tip, 0);
  ctx.lineTo(-tip * 0.55, -base);
  ctx.lineTo(-tip * 0.55, base);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Draw center divider between main aisle rows (road-style). */
export function drawMainAisleCenterLine(ctx: CanvasRenderingContext2D, tileSize: number) {
  const y = ((MAIN_AISLE_Y_TOP + MAIN_AISLE_Y_BOTTOM + 1) / 2) * tileSize;
  const x0 = tileSize;
  const x1 = (GRID_W - 1) * tileSize;
  ctx.save();

  // Dark road base
  ctx.fillStyle = 'rgba(30,28,40,0.55)';
  ctx.fillRect(x0, y - 4, x1 - x0, 8);

  // Edge rails
  ctx.fillStyle = 'rgba(255,228,107,0.35)';
  ctx.fillRect(x0, y - 3.5, x1 - x0, 1);
  ctx.fillRect(x0, y + 2.5, x1 - x0, 1);

  // Thick dash blocks
  ctx.fillStyle = 'rgba(255,228,107,0.8)';
  for (let x = x0 + 4; x < x1 - 4; x += 16) {
    ctx.fillRect(x, y - 1.5, 10, 3);
  }

  ctx.restore();
}
