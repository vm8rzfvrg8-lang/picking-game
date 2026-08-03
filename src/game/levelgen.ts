import { GRID_H, GRID_W, PICK_COUNT, PickTarget, Tile } from './constants';

/** Main aisle rows (2-wide, left-side traffic). */
export const MAIN_AISLE_Y_TOP = 6;
export const MAIN_AISLE_Y_BOTTOM = 7;

/** Left edge of the start hall (inclusive). Wall is at x=0. */
export const START_ZONE_X_MIN = 1;
/** Right edge of the start hall (inclusive) — 3-column free-movement zone. */
export const START_ZONE_X_MAX = 3;
/** @deprecated Use START_ZONE_X_MIN */
export const START_CORRIDOR_X = START_ZONE_X_MIN;

export function isStartCorridorX(x: number): boolean {
  return x >= START_ZONE_X_MIN && x <= START_ZONE_X_MAX;
}

/** First sub-aisle after the leftmost shelf pair (design: START hall | shelf | shelf | aisle). */
export const FIRST_SUB_AISLE_X = 6;

/** Sub-aisle columns repeat every 3 tiles (x=4,7,10,...). */
export function isSubAisleX(x: number): boolean {
  return x >= FIRST_SUB_AISLE_X && x < GRID_W - 1 && (x - FIRST_SUB_AISLE_X) % 3 === 0;
}

/** Zero-based index of a sub-aisle column (x=4→0, x=7→1, ...). */
export function subAisleIndex(x: number): number {
  return Math.floor((x - FIRST_SUB_AISLE_X) / 3);
}

/** Sub-aisle flow: even index ▼ down, odd index ▲ up (snake path). */
export function subAisleFlowDirection(x: number): 'up' | 'down' {
  return subAisleIndex(x) % 2 === 0 ? 'down' : 'up';
}

export function shelfLocationKey(x: number, y: number): string {
  return `${x},${y}`;
}

const UPPER_SHELF_YS = [2, 3, 4, 5] as const;
const LOWER_SHELF_YS = [8, 9, 10, 11] as const;
const LEFTMOST_SHELF_X = 4;

/** Assign 1-based location numbers along the warehouse snake path. */
export function buildShelfLocationMap(
  shelfCells: { x: number; y: number }[],
): Record<string, number> {
  const map: Record<string, number> = {};
  let num = 1;

  const assign = (x: number, y: number) => {
    const key = shelfLocationKey(x, y);
    if (map[key] != null) return;
    map[key] = num++;
  };

  // Leftmost column before the first sub-aisle (design: 1–8 bottom→top).
  for (const y of [...LOWER_SHELF_YS].reverse()) assign(LEFTMOST_SHELF_X, y);
  for (const y of [...UPPER_SHELF_YS].reverse()) assign(LEFTMOST_SHELF_X, y);

  for (let aisleX = FIRST_SUB_AISLE_X; aisleX < GRID_W - 1; aisleX += 3) {
    const down = subAisleFlowDirection(aisleX) === 'down';
    const leftCol = aisleX - 1;
    const rightCol = aisleX + 1;
    const yOrder = down
      ? [...UPPER_SHELF_YS, ...LOWER_SHELF_YS]
      : [...LOWER_SHELF_YS].reverse().concat([...UPPER_SHELF_YS].reverse());

    for (const y of yOrder) {
      if (leftCol > START_ZONE_X_MAX) assign(leftCol, y);
      if (rightCol < GRID_W - 1) assign(rightCol, y);
    }
  }

  // Safety: any shelf tile missed by the snake walk gets trailing numbers.
  for (const s of shelfCells) {
    assign(s.x, s.y);
  }

  return map;
}

/** @deprecated Use isSubAisleX — kept for reference only. */
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

// Library layout: START hall (x=1..3) then repeating [shelf | shelf | sub-aisle].
export function generateLibrary(_rng: Rng): { grid: Tile[][]; shelfCells: { x: number; y: number }[] } {
  const grid: Tile[][] = [];
  const shelfYStart = 2;
  const shelfYEnd = GRID_H - 3;
  const shelfCells: { x: number; y: number }[] = [];

  for (let y = 0; y < GRID_H; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < GRID_W; x++) {
      const border = x === 0 || y === 0 || x === GRID_W - 1 || y === GRID_H - 1;
      if (border) {
        row.push('W');
        continue;
      }
      if (isStartCorridorX(x)) {
        row.push('F');
        continue;
      }
      if (isMainAisleRow(y) || isSubAisleX(x)) {
        row.push('F');
        continue;
      }
      if (y >= shelfYStart && y <= shelfYEnd) {
        row.push('S');
        shelfCells.push({ x, y });
        continue;
      }
      row.push('F');
    }
    grid.push(row);
  }

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
  const maxSteps = GRID_W * GRID_H;
  for (let step = 0; step < maxSteps && q.length > 0; step++) {
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
  const maxSteps = GRID_W * GRID_H;
  for (let step = 0; step < maxSteps && q.length > 0; step++) {
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
  if (isStartCorridorX(x)) return null;
  if (y === MAIN_AISLE_Y_TOP) return 'right';
  if (y === MAIN_AISLE_Y_BOTTOM) return 'left';
  if (isSubAisleX(x) && !isMainAisleRow(y)) {
    return subAisleFlowDirection(x);
  }
  return null;
}

/** Random shelf subset sorted by ascending location number (warehouse pick list). */
export function assignTargets(
  shelfCells: { x: number; y: number }[],
  shelfLocations: Record<string, number>,
  rng: Rng,
): PickTarget[] {
  const candidates = shelfCells
    .map((s) => ({
      x: s.x,
      y: s.y,
      locationNumber: shelfLocations[shelfLocationKey(s.x, s.y)] ?? Number.MAX_SAFE_INTEGER,
    }))
    .filter((s) => s.locationNumber < Number.MAX_SAFE_INTEGER);

  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  const chosen = candidates.slice(0, PICK_COUNT);
  chosen.sort((a, b) => a.locationNumber - b.locationNumber);

  return chosen.map((s, index) => ({
    index,
    locationNumber: s.locationNumber,
    x: s.x,
    y: s.y,
    done: false,
  }));
}

export function findWalkableNear(
  grid: Tile[][],
  corner: 'tl' | 'bl' | 'tr' | 'br',
): { x: number; y: number } {
  const cx = corner.includes('l') ? START_ZONE_X_MIN : GRID_W - 2;
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
  return { x: START_ZONE_X_MIN, y: 1 };
}

/** All walkable cells inside the start hall. */
export function getStartCorridorCells(grid: Tile[][]): { x: number; y: number }[] {
  const cells: { x: number; y: number }[] = [];
  for (let x = START_ZONE_X_MIN; x <= START_ZONE_X_MAX; x++) {
    for (let y = 1; y < GRID_H - 1; y++) {
      if (isWalkable(grid, x, y)) cells.push({ x, y });
    }
  }
  return cells;
}

/** Player spawn — front-left of start hall on upper main aisle (rush-right layout). */
export function findPlayerSpawn(grid: Tile[][]): { x: number; y: number } {
  const preferred = [
    { x: START_ZONE_X_MIN, y: MAIN_AISLE_Y_TOP },
    { x: START_ZONE_X_MIN + 1, y: MAIN_AISLE_Y_TOP },
    { x: START_ZONE_X_MIN, y: MAIN_AISLE_Y_BOTTOM },
  ];
  for (const p of preferred) {
    if (isWalkable(grid, p.x, p.y)) return p;
  }
  const cells = getStartCorridorCells(grid);
  return cells[0] ?? { x: START_ZONE_X_MIN, y: MAIN_AISLE_Y_TOP };
}

/** CPU spawns — fill start hall beside player, ready to surge right together. */
export function findCpuSpawnPoints(
  grid: Tile[][],
  playerSpawn: { x: number; y: number },
  count: number,
): { x: number; y: number }[] {
  const used = new Set<string>([`${playerSpawn.x},${playerSpawn.y}`]);

  // Main-aisle rows first, then adjacent rows — left-to-right within the hall.
  const yPriority = [
    MAIN_AISLE_Y_TOP,
    MAIN_AISLE_Y_BOTTOM,
    MAIN_AISLE_Y_TOP - 1,
    MAIN_AISLE_Y_BOTTOM + 1,
    MAIN_AISLE_Y_TOP - 2,
    MAIN_AISLE_Y_BOTTOM + 2,
  ].filter((y) => y > 0 && y < GRID_H - 1);

  const slots: { x: number; y: number }[] = [];
  for (const y of yPriority) {
    for (let x = START_ZONE_X_MIN; x <= START_ZONE_X_MAX; x++) {
      slots.push({ x, y });
    }
  }
  for (const c of getStartCorridorCells(grid)) {
    if (!slots.some((s) => s.x === c.x && s.y === c.y)) slots.push(c);
  }

  const spawns: { x: number; y: number }[] = [];
  for (const cell of slots) {
    if (spawns.length >= count) break;
    const key = `${cell.x},${cell.y}`;
    if (used.has(key)) continue;
    if (!isWalkable(grid, cell.x, cell.y)) continue;
    spawns.push(cell);
    used.add(key);
  }

  return spawns;
}
