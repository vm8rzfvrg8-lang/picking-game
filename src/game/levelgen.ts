import { GRID_H, GRID_W, PICK_COUNT, PickTarget, Tile } from './constants';

/** Main aisle rows (2-wide, left-side traffic). */
export const MAIN_AISLE_Y_TOP = 6;
export const MAIN_AISLE_Y_BOTTOM = 7;

/** Sub aisle column x-coordinates (alternating ↑↓). Includes right-edge lane x=16. */
export const SUB_AISLE_XS = [1, 4, 7, 10, 13, 16] as const;

/** Wall-embedded goal cells. */
export const GOAL_CELLS = [
  { x: GRID_W - 1, y: MAIN_AISLE_Y_TOP },
  { x: GRID_W - 1, y: MAIN_AISLE_Y_BOTTOM },
] as const;

export function makeRng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export type Rng = ReturnType<typeof makeRng>;

function isMainAisleRow(y: number): boolean {
  return y === MAIN_AISLE_Y_TOP || y === MAIN_AISLE_Y_BOTTOM;
}

// Library layout: vertical bookshelves with 2-row main aisle and alternating sub aisles.
export function generateLibrary(_rng: Rng): { grid: Tile[][]; shelfCells: { x: number; y: number }[] } {
  const grid: Tile[][] = [];
  for (let y = 0; y < GRID_H; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < GRID_W; x++) {
      const border = x === 0 || y === 0 || x === GRID_W - 1 || y === GRID_H - 1;
      row.push(border ? 'W' : 'F');
    }
    grid.push(row);
  }

  const shelfYStart = 2;
  const shelfYEnd = GRID_H - 3;

  // 2-wide shelf columns; sub aisles at x=1,4,7,10,13 between groups
  const shelfGroups = [
    [2, 3],
    [5, 6],
    [8, 9],
    [11, 12],
    [14, 15],
  ];
  const shelfCells: { x: number; y: number }[] = [];
  for (const [x1, x2] of shelfGroups) {
    for (let x = x1; x <= x2; x++) {
      for (let y = shelfYStart; y <= shelfYEnd; y++) {
        if (isMainAisleRow(y)) continue;
        grid[y][x] = 'S';
        shelfCells.push({ x, y });
      }
    }
  }

  // Wall-embedded goals on both main lanes
  for (const g of GOAL_CELLS) {
    grid[g.y][g.x] = 'G';
  }

  return { grid, shelfCells };
}

export function isWalkable(grid: Tile[][], x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return false;
  const t = grid[y][x];
  return t === 'F' || t === 'G';
}

export function isGoalCell(grid: Tile[][], x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return false;
  return grid[y][x] === 'G';
}

export function isShelf(grid: Tile[][], x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= GRID_W || y >= GRID_H) return false;
  return grid[y][x] === 'S';
}

export function bfsDistances(grid: Tile[][], sx: number, sy: number): number[][] {
  const dist: number[][] = Array.from({ length: GRID_H }, () =>
    new Array(GRID_W).fill(-1),
  );
  if (!isWalkable(grid, sx, sy)) return dist;
  const q: { x: number; y: number }[] = [{ x: sx, y: sy }];
  dist[sy][sx] = 0;
  while (q.length) {
    const { x, y } = q.shift()!;
    const d = dist[y][x];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (!isWalkable(grid, nx, ny)) continue;
      if (dist[ny][nx] !== -1) continue;
      dist[ny][nx] = d + 1;
      q.push({ x: nx, y: ny });
    }
  }
  return dist;
}

/** BFS with extra cost for moving against lane flow. */
export function bfsDistancesWeighted(
  grid: Tile[][],
  sx: number,
  sy: number,
  wrongWayPenalty: number,
): number[][] {
  const dist: number[][] = Array.from({ length: GRID_H }, () =>
    new Array(GRID_W).fill(-1),
  );
  if (!isWalkable(grid, sx, sy)) return dist;
  type Node = { x: number; y: number; d: number };
  const q: Node[] = [{ x: sx, y: sy, d: 0 }];
  dist[sy][sx] = 0;
  while (q.length) {
    q.sort((a, b) => a.d - b.d);
    const { x, y, d } = q.shift()!;
    if (d > dist[y][x]) continue;
    for (const [dx, dy, dir] of [
      [1, 0, 'right'],
      [-1, 0, 'left'],
      [0, 1, 'down'],
      [0, -1, 'up'],
    ] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (!isWalkable(grid, nx, ny)) continue;
      const penalty = isWrongWayAt(x, y, dir) ? wrongWayPenalty : 0;
      const nd = d + 1 + penalty;
      if (dist[ny][nx] !== -1 && dist[ny][nx] <= nd) continue;
      dist[ny][nx] = nd;
      q.push({ x: nx, y: ny, d: nd });
    }
  }
  return dist;
}

function isWrongWayAt(x: number, y: number, moveDir: string): boolean {
  const flow = flowAt(x, y);
  return flow !== null && flow !== moveDir;
}

function flowAt(x: number, y: number): string | null {
  if (y === MAIN_AISLE_Y_TOP) return 'right';
  if (y === MAIN_AISLE_Y_BOTTOM) return 'left';
  const idx = (SUB_AISLE_XS as readonly number[]).indexOf(x);
  if (idx >= 0 && !isMainAisleRow(y)) {
    return idx % 2 === 0 ? 'up' : 'down';
  }
  return null;
}

export function assignTargets(
  grid: Tile[][],
  shelfCells: { x: number; y: number }[],
  playerSpawn: { x: number; y: number },
  rng: Rng,
): PickTarget[] {
  const reachableShelves = shelfCells.filter((s) => {
    if (grid[s.y][s.x] !== 'S') return false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (isWalkable(grid, s.x + dx, s.y + dy)) return true;
    }
    return false;
  });
  for (let i = reachableShelves.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [reachableShelves[i], reachableShelves[j]] = [reachableShelves[j], reachableShelves[i]];
  }

  const chosen: PickTarget[] = [];
  const used = new Set<string>();
  let prev = playerSpawn;

  const tryReachable = (shelf: { x: number; y: number }): boolean => {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ax = shelf.x + dx;
      const ay = shelf.y + dy;
      if (!isWalkable(grid, ax, ay)) continue;
      const dist = bfsDistances(grid, prev.x, prev.y);
      if (dist[ay][ax] >= 0) return true;
    }
    return false;
  };

  for (const s of reachableShelves) {
    if (chosen.length >= PICK_COUNT) break;
    const k = `${s.x},${s.y}`;
    if (used.has(k)) continue;
    if (chosen.length > 0 && !tryReachable(s)) continue;
    used.add(k);
    chosen.push({ index: chosen.length, x: s.x, y: s.y, done: false });
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (isWalkable(grid, s.x + dx, s.y + dy)) {
        prev = { x: s.x + dx, y: s.y + dy };
        break;
      }
    }
  }

  if (chosen.length < PICK_COUNT) {
    for (const s of reachableShelves) {
      if (chosen.length >= PICK_COUNT) break;
      const k = `${s.x},${s.y}`;
      if (used.has(k)) continue;
      used.add(k);
      chosen.push({ index: chosen.length, x: s.x, y: s.y, done: false });
    }
  }

  return chosen;
}

export function findWalkableNear(
  grid: Tile[][],
  corner: 'tl' | 'bl' | 'tr' | 'br',
): { x: number; y: number } {
  const cx = corner.includes('l') ? 1 : GRID_W - 2;
  const cy = corner.includes('t') ? 1 : GRID_H - 2;
  for (let r = 0; r < 6; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (isWalkable(grid, x, y)) return { x, y };
      }
    }
  }
  return { x: 1, y: 1 };
}
