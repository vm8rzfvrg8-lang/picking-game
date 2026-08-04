import {
  COLLISION_STUN_LOSER_MS,
  COLLISION_STUN_WINNER_MS,
  Direction,
  GRID_H,
  GRID_W,
  LEFT_DECOR_COLS,
  MAX_LOOP_ITERATIONS_PER_FRAME,
  Tile,
} from './constants';
import {
  MAIN_AISLE_Y_BOTTOM,
  MAIN_AISLE_Y_TOP,
  isStartCorridorX,
  isSubAisleX,
  leftShelfRouteFlowAt,
  perimeterPassageFlowAt,
  START_ZONE_X_MIN,
  subAisleFlowDirection,
  isWalkable,
} from './levelgen';
import { PALETTE, paletteAlpha } from './palette';

export type LaneKind = 'main' | 'sub' | 'start' | 'other';

export function laneAt(x: number, y: number): LaneKind {
  if (isStartCorridorX(x)) return 'start';
  if (y === MAIN_AISLE_Y_TOP || y === MAIN_AISLE_Y_BOTTOM) return 'main';
  if (isSubAisleX(x)) return 'sub';
  return 'other';
}

export function flowAt(x: number, y: number): Direction | null {
  const perimeter = perimeterPassageFlowAt(x, y);
  if (perimeter) return perimeter;
  const leftRoute = leftShelfRouteFlowAt(x, y);
  if (leftRoute) return leftRoute;
  if (isStartCorridorX(x)) return null;
  if (y === MAIN_AISLE_Y_TOP) return 'right';
  if (y === MAIN_AISLE_Y_BOTTOM) return 'left';
  if (isSubAisleX(x) && y !== MAIN_AISLE_Y_TOP && y !== MAIN_AISLE_Y_BOTTOM) {
    return subAisleFlowDirection(x);
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

/** Pixel chevron for lane direction — fillRect only, no transforms. */
function drawLaneChevron(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  flow: Direction,
  color: string,
) {
  ctx.fillStyle = color;
  if (flow === 'up') {
    ctx.fillRect(cx - 1, cy - 5, 2, 2);
    ctx.fillRect(cx - 3, cy - 1, 2, 2);
    ctx.fillRect(cx + 1, cy - 1, 2, 2);
    ctx.fillRect(cx - 5, cy + 3, 2, 2);
    ctx.fillRect(cx + 3, cy + 3, 2, 2);
  } else if (flow === 'down') {
    ctx.fillRect(cx - 1, cy + 3, 2, 2);
    ctx.fillRect(cx - 3, cy - 1, 2, 2);
    ctx.fillRect(cx + 1, cy - 1, 2, 2);
    ctx.fillRect(cx - 5, cy - 5, 2, 2);
    ctx.fillRect(cx + 3, cy - 5, 2, 2);
  } else if (flow === 'left') {
    ctx.fillRect(cx - 5, cy - 1, 2, 2);
    ctx.fillRect(cx - 1, cy - 3, 2, 2);
    ctx.fillRect(cx - 1, cy + 1, 2, 2);
    ctx.fillRect(cx + 3, cy - 5, 2, 2);
    ctx.fillRect(cx + 3, cy + 3, 2, 2);
  } else {
    ctx.fillRect(cx + 3, cy - 1, 2, 2);
    ctx.fillRect(cx - 1, cy - 3, 2, 2);
    ctx.fillRect(cx - 1, cy + 1, 2, 2);
    ctx.fillRect(cx - 5, cy - 5, 2, 2);
    ctx.fillRect(cx - 5, cy + 3, 2, 2);
  }
}

/** Warehouse floor tape marks framing the chevron. */
function drawLaneTape(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  tileSize: number,
  flow: Direction,
  tapeColor: string,
) {
  ctx.fillStyle = tapeColor;
  const pad = 4;
  if (flow === 'up' || flow === 'down') {
    ctx.fillRect(ox + pad, oy + 3, 1, tileSize - 6);
    ctx.fillRect(ox + tileSize - pad - 1, oy + 3, 1, tileSize - 6);
    ctx.fillRect(ox + pad, oy + 3, tileSize - pad * 2, 1);
    ctx.fillRect(ox + pad, oy + tileSize - 4, tileSize - pad * 2, 1);
  } else {
    ctx.fillRect(ox + 3, oy + pad, tileSize - 6, 1);
    ctx.fillRect(ox + 3, oy + tileSize - pad - 1, tileSize - 6, 1);
    ctx.fillRect(ox + 3, oy + pad, 1, tileSize - pad * 2);
    ctx.fillRect(ox + tileSize - 4, oy + pad, 1, tileSize - pad * 2);
  }
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
  const ox = x * tileSize;
  const oy = y * tileSize;
  const cx = ox + tileSize / 2;
  const cy = oy + tileSize / 2;

  if (kind === 'flow') {
    ctx.fillStyle = paletteAlpha(PALETTE.glowGreen, 0.12 * alpha);
  } else {
    ctx.fillStyle = paletteAlpha(PALETTE.glowRed, 0.14 * alpha);
  }
  ctx.fillRect(ox, oy, tileSize, tileSize);

  const tape =
    kind === 'flow'
      ? paletteAlpha(PALETTE.glowGreen, 0.55 * alpha)
      : paletteAlpha(PALETTE.glowRed, 0.58 * alpha);
  const chevron =
    kind === 'flow'
      ? paletteAlpha(PALETTE.glowGreen, 0.82 * alpha)
      : paletteAlpha(PALETTE.glowRed, 0.82 * alpha);

  drawLaneTape(ctx, ox, oy, tileSize, flow, tape);
  drawLaneChevron(ctx, cx, cy, flow, chevron);
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

  let dirTries = 0;
  for (const dir of dirs) {
    dirTries++;
    if (dirTries > MAX_LOOP_ITERATIONS_PER_FRAME) break;
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
  return { x, y };
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

/** All character cells except the entity being knocked back (pre-collision positions). */
export function listOccupiedCells(
  occupiers: ReadonlyArray<{ x: number; y: number }>,
  fromX: number,
  fromY: number,
): { x: number; y: number }[] {
  return occupiers.filter((o) => o.x !== fromX || o.y !== fromY);
}

/**
 * Simple knockback: one step via arrow/yield rules.
 * Stays put if the target is a wall, shelf, or another character.
 */
export function applySimpleKnockback(
  grid: Tile[][],
  fromX: number,
  fromY: number,
  moveDir: Direction | null,
  avoid: { x: number; y: number } | null,
  mode: 'collision' | 'yield',
  aggressorDir: Direction | undefined,
  occupiers: ReadonlyArray<{ x: number; y: number }>,
): { x: number; y: number } {
  const candidate =
    mode === 'yield' && aggressorDir
      ? backAsYield(grid, fromX, fromY, aggressorDir, avoid)
      : backFromCollision(grid, fromX, fromY, moveDir, avoid);

  if (candidate.x === fromX && candidate.y === fromY) return candidate;
  if (!isWalkable(grid, candidate.x, candidate.y)) return { x: fromX, y: fromY };

  let occupierChecks = 0;
  for (const o of listOccupiedCells(occupiers, fromX, fromY)) {
    occupierChecks++;
    if (occupierChecks > MAX_LOOP_ITERATIONS_PER_FRAME) break;
    if (o.x === candidate.x && o.y === candidate.y) return { x: fromX, y: fromY };
  }
  return candidate;
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
  let neighborScans = 0;
  for (const dir of ['up', 'down', 'left', 'right'] as Direction[]) {
    neighborScans++;
    if (neighborScans > MAX_LOOP_ITERATIONS_PER_FRAME) break;
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
export function stunForCollisionKnockback(
  knockedBack: boolean,
  wrongWay: boolean,
  superSpeedActive = false,
): number {
  if (!knockedBack) return 0;
  const base = wrongWay ? COLLISION_STUN_LOSER_MS : COLLISION_STUN_WINNER_MS;
  return superSpeedActive ? Math.floor(base / 2) : base;
}

/** Draw flow arrow on floor tile — industrial lane tape + pixel chevron. */
export function drawFlowArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tileSize: number,
  wrongWayFlash = false,
) {
  const flow = flowAt(x, y);
  if (!flow) return;
  const ox = x * tileSize;
  const oy = y * tileSize;
  const cx = ox + tileSize / 2;
  const cy = oy + tileSize / 2;
  const tape = wrongWayFlash
    ? paletteAlpha(PALETTE.glowRed, 0.55)
    : paletteAlpha(PALETTE.pixelBlack, 0.45);
  const chevron = wrongWayFlash ? PALETTE.glowRed : PALETTE.cautionYellow;

  drawLaneTape(ctx, ox, oy, tileSize, flow, tape);
  drawLaneChevron(ctx, cx, cy, flow, chevron);
}

/** Draw center divider between main aisle rows — warehouse zone striping. */
export function drawMainAisleCenterLine(
  ctx: CanvasRenderingContext2D,
  tileSize: number,
  cullMinX?: number,
  cullMaxX?: number,
) {
  const y = ((MAIN_AISLE_Y_TOP + MAIN_AISLE_Y_BOTTOM + 1) / 2) * tileSize;
  const decorPx = LEFT_DECOR_COLS * tileSize;
  /** Grid-space start: right of 10-tile decor (= start line, grid x=1). */
  const lineStartX = START_ZONE_X_MIN * tileSize;
  const lineEndX = (GRID_W - 1) * tileSize;

  const cullMinGrid = cullMinX != null ? cullMinX - decorPx : undefined;
  const cullMaxGrid = cullMaxX != null ? cullMaxX - decorPx : undefined;

  const x0 = Math.max(lineStartX, cullMinGrid ?? lineStartX);
  const x1 = Math.min(lineEndX, cullMaxGrid ?? lineEndX);
  if (x0 >= x1) return;

  ctx.fillStyle = paletteAlpha(PALETTE.pixelBlack, 0.75);
  ctx.fillRect(x0, y - 3, x1 - x0, 6);

  ctx.fillStyle = paletteAlpha(PALETTE.cautionYellow, 0.55);
  ctx.fillRect(x0, y - 2, x1 - x0, 1);
  ctx.fillRect(x0, y + 1, x1 - x0, 1);

  ctx.fillStyle = paletteAlpha(PALETTE.cautionYellow, 0.9);
  for (let x = x0 + 6; x < x1 - 6; x += 14) {
    ctx.fillRect(x, y, 6, 1);
  }
}
