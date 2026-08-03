import { COLORS, GameState, GRID_H, GRID_W, RIVAL_PALETTE, TILE } from './constants';
import type { CullBounds } from './camera';
import { drawFlowArrow, drawMainAisleCenterLine, flowAt, isWrongWay } from './flow';
import { isGoalCell, isShelf, isStartCorridorX, shelfLocationKey, START_ZONE_X_MIN } from './levelgen';

export interface RenderOpts {
  blink: number;
  /** World-space visible rect — tiles outside are skipped. */
  cull?: CullBounds;
}

function tileRange(cull: CullBounds) {
  return {
    minGX: Math.max(0, Math.floor(cull.minX / TILE)),
    maxGX: Math.min(GRID_W - 1, Math.ceil(cull.maxX / TILE) - 1),
    minGY: Math.max(0, Math.floor(cull.minY / TILE)),
    maxGY: Math.min(GRID_H - 1, Math.ceil(cull.maxY / TILE) - 1),
  };
}

/** Snap to integer pixel — avoids sub-pixel AA cost. */
function px(v: number): number {
  return v | 0;
}

function isCellVisible(gx: number, gy: number, cull: CullBounds): boolean {
  const ox = gx * TILE;
  const oy = gy * TILE;
  return ox + TILE > cull.minX && ox < cull.maxX && oy + TILE > cull.minY && oy < cull.maxY;
}

function bookColor(x: number, y: number): string {
  const arr = COLORS.bookColors;
  return arr[(x * 7 + y * 13) % arr.length];
}

/** Warehouse aisle floor — dark blue-gray, lets wood shelves pop. */
const PASSAGE_FLOOR = {
  base: '#2c303c',
  speckA: '#262a34',
  speckB: '#232730',
  seam: '#363b48',
} as const;

/** Start bay floor — slightly lighter dock tone. */
const START_FLOOR = {
  base: '#323848',
  edge: '#c9a227',
  mark: '#3a4050',
} as const;

/** Static wall palette — concrete + metal frame (no gradients). */
const WALL_PIXEL = {
  concrete: '#3a3e4c',
  concreteHi: '#484e5e',
  concreteLo: '#2a2e3a',
  mortar: '#323642',
  metal: '#566074',
  metalHi: '#6e7890',
  metalLo: '#404858',
  rivet: '#8a94a8',
  beam: '#525868',
} as const;

/** Lightweight ground shadow — single fill, no shadowBlur. */
function drawGroundShadow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  footY: number,
  rx = 11,
  ry = 4,
) {
  ctx.fillStyle = 'rgba(0,0,0,0.24)';
  ctx.beginPath();
  ctx.ellipse(px(cx), px(footY), rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawPassageFloorTile(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  gx: number,
  gy: number,
) {
  ctx.fillStyle = PASSAGE_FLOOR.base;
  ctx.fillRect(ox, oy, TILE, TILE);

  ctx.fillStyle = PASSAGE_FLOOR.seam;
  ctx.fillRect(ox, oy + TILE - 1, TILE, 1);
  ctx.fillRect(ox + TILE - 1, oy, 1, TILE);

  const seed = gx * 17 + gy * 31;
  for (let i = 0; i < 4; i++) {
    if ((seed + i * 5) % 4 !== 0) continue;
    const px0 = ox + ((seed + i * 11) % (TILE - 2)) + 1;
    const py0 = oy + ((seed + i * 17) % (TILE - 2)) + 1;
    ctx.fillStyle = i % 2 === 0 ? PASSAGE_FLOOR.speckA : PASSAGE_FLOOR.speckB;
    ctx.fillRect(px0, py0, 1, 1);
  }
}

function drawStartCorridorTile(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  gx: number,
  gy: number,
) {
  const isLeftEdge = gx === START_ZONE_X_MIN;
  ctx.fillStyle = isLeftEdge ? START_FLOOR.base : '#363c4a';
  ctx.fillRect(ox, oy, TILE, TILE);

  if (isLeftEdge) {
    ctx.fillStyle = START_FLOOR.edge;
    ctx.fillRect(ox, oy + 5, 2, TILE - 10);
  } else {
    ctx.fillStyle = 'rgba(201,162,39,0.18)';
    ctx.fillRect(ox, oy + TILE - 2, TILE, 1);
    ctx.fillRect(ox + TILE - 1, oy, 1, TILE);
  }

  ctx.fillStyle = START_FLOOR.mark;
  if ((gx + gy) % 5 === 0) {
    ctx.fillRect(ox + 10, oy + 14, 6, 2);
  }
}

/** Dense wood / old-book palette for S (shelf) tiles — visual only. */
const SHELF_PIXEL = {
  backDark: '#140c06',
  backMid: '#221610',
  backLight: '#2e1e14',
  frameDark: '#2a1a0c',
  frameMid: '#5a3818',
  frameLight: '#8a5830',
  frameHi: '#b07840',
  grain: '#3a2414',
  board: '#4a3018',
  boardLight: '#6a4428',
  boardShadow: '#2a1808',
  dust: '#9a9080',
  label: '#c8a850',
  page: '#d8d0c0',
} as const;

function drawLegacyFloorBase(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  gx: number,
  gy: number,
) {
  ctx.fillStyle = '#2a2e3a';
  ctx.fillRect(ox, oy, TILE, TILE);
}

/** Full-canvas warm sepia tint — single pass, no gradients. */
export function applyRetroColorFilter(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const prevOp = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = 'rgba(255, 235, 205, 0.09)';
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = prevOp;
}

export function render(ctx: CanvasRenderingContext2D, state: GameState, opts: RenderOpts) {
  renderInternal(ctx, state, opts);
}

export interface CharacterDrawOpts {
  moving?: boolean;
  squash?: number;
  speedBoost?: boolean;
  pushThrough?: boolean;
  jamStun?: boolean;
  rivalIndex?: number;
}

export function drawCharacterAt(
  ctx: CanvasRenderingContext2D,
  fx: number,
  fy: number,
  facing: 'up' | 'down' | 'left' | 'right',
  blink: number,
  stunned: boolean,
  who: 'player' | 'rival',
  opts?: CharacterDrawOpts,
) {
  drawCharacter(ctx, fx, fy, facing, blink, stunned, who, opts);
}

/** Yellow ▼ marker above the player — drawn last so it stays visible over CPU overlap. */
export function drawPlayerMarkerAt(
  ctx: CanvasRenderingContext2D,
  fx: number,
  fy: number,
  blink: number,
) {
  const cx = fx * TILE + TILE / 2;
  const cy = fy * TILE + TILE / 2;
  const bob = Math.sin(blink * Math.PI * 2 * 1.6) * 1.8;
  const baseY = cy - 20 + bob;
  const tipY = baseY + 9;

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';

  // Outline
  ctx.fillStyle = '#1a1200';
  ctx.beginPath();
  ctx.moveTo(px(cx), px(tipY + 1));
  ctx.lineTo(px(cx - 8), px(baseY - 1));
  ctx.lineTo(px(cx + 8), px(baseY - 1));
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#ffd54f';
  ctx.beginPath();
  ctx.moveTo(px(cx), px(tipY));
  ctx.lineTo(px(cx - 7), px(baseY));
  ctx.lineTo(px(cx + 7), px(baseY));
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.fillRect(px(cx - 1), px(baseY + 1), 2, 3);

  ctx.restore();
}

export function drawPickGaugeAt(
  ctx: CanvasRenderingContext2D,
  fx: number,
  fy: number,
  progress: number,
  who: 'player' | 'rival',
) {
  const color = who === 'rival' ? COLORS.rivalGauge : COLORS.gauge;
  const colorLight = who === 'rival' ? COLORS.rivalGaugeLight : COLORS.gaugeLight;
  drawPickGauge(ctx, fx, fy, progress, color, colorLight);
}

export function drawCollisionFxAt(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  timer: number,
) {
  drawCollisionFx(ctx, gx, gy, timer);
}

export function eraseFloorCell(ctx: CanvasRenderingContext2D, state: GameState, gx: number, gy: number) {
  const t = state.grid[gy]?.[gx];
  if (t !== 'F' && t !== 'G') return;
  const ox = gx * TILE;
  const oy = gy * TILE;
  if (t === 'F') {
    drawPassageFloorTile(ctx, ox, oy, gx, gy);
  } else {
    drawLegacyFloorBase(ctx, ox, oy, gx, gy);
    drawGoalCell(ctx, ox, oy);
  }
}

function drawGoalCell(ctx: CanvasRenderingContext2D, ox: number, oy: number) {
  ctx.fillStyle = COLORS.goalDark;
  ctx.fillRect(ox, oy, TILE, TILE);
  const slatH = 4;
  for (let i = 0; i < Math.floor(TILE / slatH); i++) {
    const sy = oy + 2 + i * slatH;
    const slatGrad = ctx.createLinearGradient(ox, sy, ox, sy + slatH - 1);
    slatGrad.addColorStop(0, COLORS.goalLight);
    slatGrad.addColorStop(0.3, COLORS.goal);
    slatGrad.addColorStop(0.7, COLORS.goalMetal);
    slatGrad.addColorStop(1, COLORS.goalMetalDark);
    ctx.fillStyle = slatGrad;
    ctx.fillRect(ox + 2, sy, TILE - 4, slatH - 1);
    if (i % 2 === 1) {
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(ox + 2, sy, TILE - 4, 1);
    }
  }
  ctx.fillStyle = COLORS.goalLight;
  ctx.fillRect(ox, oy, TILE, 1);
  ctx.fillRect(ox, oy, 1, TILE);
}

function renderInternal(ctx: CanvasRenderingContext2D, state: GameState, opts: RenderOpts) {
  const { grid } = state;
  const { cull } = opts;
  ctx.imageSmoothingEnabled = false;

  drawFloor(ctx, grid, state, cull);

  const range = cull ? tileRange(cull) : { minGX: 0, maxGX: GRID_W - 1, minGY: 0, maxGY: GRID_H - 1 };

  for (let y = range.minGY; y <= range.maxGY; y++) {
    for (let x = range.minGX; x <= range.maxGX; x++) {
      if (grid[y][x] === 'S') {
        const loc = state.shelfLocations[shelfLocationKey(x, y)];
        drawShelf(ctx, x, y, x * TILE, y * TILE, loc);
      }
    }
  }

  for (let y = range.minGY; y <= range.maxGY; y++) {
    for (let x = range.minGX; x <= range.maxGX; x++) {
      if (grid[y][x] === 'W') {
        drawWall(ctx, x, y, x * TILE, y * TILE);
      }
    }
  }

  drawGoals(ctx, state, opts.blink, cull);

  const pt = state.targets[state.currentTarget];
  if (pt && !pt.done && (!cull || isCellVisible(pt.x, pt.y, cull))) {
    drawTargetGlow(ctx, pt.x, pt.y, opts.blink, COLORS.glow, true);
  }

  if (state.tutorialReachCell && (!cull || isCellVisible(state.tutorialReachCell.x, state.tutorialReachCell.y, cull))) {
    drawTargetGlow(
      ctx,
      state.tutorialReachCell.x,
      state.tutorialReachCell.y,
      opts.blink,
      COLORS.glow,
      false,
    );
  }

  for (const rival of state.rivals) {
    if (cull && !isCellVisible(rival.x, rival.y, cull)) continue;
    drawRival(
      ctx,
      rival.x,
      rival.y,
      rival.facing,
      opts.blink,
      rival.stun > 0,
      rival.id,
    );
    if (rival.isPicking) {
      const palette = RIVAL_PALETTE[rival.id % RIVAL_PALETTE.length];
      drawPickGauge(ctx, rival.x, rival.y, rival.pickProgress, palette.body, palette.light);
    }
  }

  if (!cull || isCellVisible(state.player.x, state.player.y, cull)) {
    drawPlayer(ctx, state.player.x, state.player.y, state.player.facing, opts.blink, state.player.stun > 0);
    if (state.isPicking) {
      drawPickGauge(ctx, state.player.x, state.player.y, state.pickProgress, COLORS.gauge, COLORS.gaugeLight);
    }
  }

  if (state.collisionFx > 0 && state.collisionPos) {
    const cp = state.collisionPos;
    if (!cull || isCellVisible(cp.x, cp.y, cull)) {
      drawCollisionFx(ctx, cp.x, cp.y, state.collisionFx);
    }
  }
}

function drawFloor(
  ctx: CanvasRenderingContext2D,
  grid: string[][],
  state: GameState,
  cull?: CullBounds,
) {
  const range = cull ? tileRange(cull) : { minGX: 0, maxGX: GRID_W - 1, minGY: 0, maxGY: GRID_H - 1 };

  for (let y = range.minGY; y <= range.maxGY; y++) {
    for (let x = range.minGX; x <= range.maxGX; x++) {
      const t = grid[y][x];
      if (t !== 'F' && t !== 'G') continue;
      const ox = x * TILE;
      const oy = y * TILE;

      if (t === 'F') {
        if (isStartCorridorX(x)) {
          drawStartCorridorTile(ctx, ox, oy, x, y);
        } else {
          drawPassageFloorTile(ctx, ox, oy, x, y);
        }
      } else {
        drawLegacyFloorBase(ctx, ox, oy, x, y);
      }

      if (flowAt(x, y)) {
        const playerWrong =
          state.player.x === x &&
          state.player.y === y &&
          isWrongWay(x, y, state.player.lastMoveDir);
        const rivalWrong = state.rivals.some(
          (rival) =>
            rival.x === x &&
            rival.y === y &&
            isWrongWay(x, y, rival.lastMoveDir),
        );
        drawFlowArrow(ctx, x, y, TILE, playerWrong || rivalWrong);
      }
    }
  }
  drawMainAisleCenterLine(ctx, TILE, cull?.minX, cull?.maxX);
}

function drawWall(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  ox: number,
  oy: number,
) {
  const isTop = gy === 0;
  const isBottom = gy === GRID_H - 1;
  const isLeft = gx === 0;
  const isRight = gx === GRID_W - 1;

  ctx.fillStyle = WALL_PIXEL.concrete;
  ctx.fillRect(ox, oy, TILE, TILE);

  for (let row = 0; row < 6; row++) {
    const sy = oy + row * 6;
    ctx.fillStyle = row % 2 === 0 ? WALL_PIXEL.mortar : WALL_PIXEL.concreteHi;
    ctx.fillRect(ox + 1, sy, TILE - 2, 1);
  }

  if (isLeft || isRight) {
    const mx = isLeft ? ox + TILE - 5 : ox;
    ctx.fillStyle = WALL_PIXEL.metalLo;
    ctx.fillRect(mx, oy, 5, TILE);
    ctx.fillStyle = WALL_PIXEL.metalHi;
    ctx.fillRect(mx + (isLeft ? 3 : 1), oy + 1, 1, TILE - 2);
    for (let ry = 6; ry < TILE - 4; ry += 10) {
      ctx.fillStyle = WALL_PIXEL.rivet;
      ctx.fillRect(mx + 2, oy + ry, 2, 2);
    }
  }

  if (isTop) {
    ctx.fillStyle = WALL_PIXEL.beam;
    ctx.fillRect(ox, oy + TILE - 5, TILE, 5);
    ctx.fillStyle = WALL_PIXEL.concreteLo;
    ctx.fillRect(ox, oy + TILE - 2, TILE, 2);
  }

  if (isBottom) {
    ctx.fillStyle = WALL_PIXEL.concreteLo;
    ctx.fillRect(ox, oy, TILE, 4);
    ctx.fillStyle = WALL_PIXEL.mortar;
    ctx.fillRect(ox, oy + 3, TILE, 1);
  }

  ctx.fillStyle = WALL_PIXEL.concreteLo;
  ctx.fillRect(ox, oy, 1, TILE);
  ctx.fillRect(ox + TILE - 1, oy, 1, TILE);
}

function drawShelf(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  ox: number,
  oy: number,
  locationNumber?: number,
) {
  drawGroundShadow(ctx, ox + TILE / 2, oy + TILE - 2, 14, 3);

  const seed = gx * 23 + gy * 41;
  const frame = 3;
  const innerL = ox + frame;
  const innerR = ox + TILE - frame;
  const innerT = oy + frame;
  const innerB = oy + TILE - frame;

  ctx.fillStyle = '#1e1610';
  ctx.fillRect(ox, oy, TILE, TILE);

  ctx.fillStyle = SHELF_PIXEL.backMid;
  ctx.fillRect(ox + frame, oy + frame, TILE - frame * 2, TILE - frame * 2);

  ctx.fillStyle = SHELF_PIXEL.frameDark;
  ctx.fillRect(ox, oy, TILE, frame);
  ctx.fillRect(ox, oy + TILE - frame, TILE, frame);
  ctx.fillRect(ox, oy, frame, TILE);
  ctx.fillRect(ox + TILE - frame, oy, frame, TILE);

  ctx.fillStyle = SHELF_PIXEL.frameLight;
  ctx.fillRect(ox + 1, oy + 1, TILE - 2, 1);
  ctx.fillRect(ox + 1, oy + 1, 1, TILE - 2);

  const shelfYs = [oy + 11, oy + 23];
  for (const sy of shelfYs) {
    ctx.fillStyle = SHELF_PIXEL.board;
    ctx.fillRect(innerL, sy, innerR - innerL, 2);
    ctx.fillStyle = SHELF_PIXEL.boardLight;
    ctx.fillRect(innerL, sy, innerR - innerL, 1);
  }

  const rows = [
    { top: innerT, bottom: shelfYs[0] - 1 },
    { top: shelfYs[0] + 3, bottom: shelfYs[1] - 1 },
    { top: shelfYs[1] + 3, bottom: innerB },
  ];

  for (let r = 0; r < rows.length; r++) {
    const { top, bottom } = rows[r];
    const rowH = bottom - top;
    let bx = innerL + 1;
    while (bx < innerR - 2) {
      const w = 2 + ((seed + r * 7 + bx) % 3);
      if (bx + w >= innerR - 1) break;
      ctx.fillStyle = bookColor(gx + bx, gy + r);
      ctx.fillRect(bx, top, w, rowH);
      ctx.fillStyle = COLORS.bookHighlight;
      ctx.fillRect(bx, top, 1, rowH);
      ctx.fillStyle = COLORS.bookShadow;
      ctx.fillRect(bx + w - 1, top, 1, rowH);
      if ((seed + bx + r) % 4 === 0 && rowH > 5) {
        ctx.fillStyle = SHELF_PIXEL.label;
        ctx.fillRect(bx, top + 2, w, 2);
      }
      bx += w + 1;
    }
  }

  if (locationNumber != null) {
    ctx.fillStyle = 'rgba(12, 10, 8, 0.72)';
    ctx.fillRect(ox + 3, oy + TILE - 11, 14, 9);
    ctx.fillStyle = '#e8dcc0';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(locationNumber), ox + 5, oy + TILE - 6);
  }
}

function drawTargetGlow(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  blink: number,
  color: string,
  showArrow: boolean,
) {
  const ox = gx * TILE;
  const oy = gy * TILE;
  const pulse = 0.5 + 0.5 * Math.sin(blink * Math.PI * 2 * (showArrow ? 2.2 : 1.5));
  const rgb = hexToRgb(color);
  const intensity = showArrow ? 1.25 : 0.75;
  const alpha = (0.35 + 0.25 * pulse) * intensity;

  ctx.fillStyle = `rgba(${rgb},${alpha * 0.35})`;
  ctx.fillRect(ox, oy, TILE, TILE);

  ctx.strokeStyle = `rgba(${rgb},${(0.85 + 0.15 * pulse) * intensity})`;
  ctx.lineWidth = showArrow ? 3 : 1.5;
  ctx.setLineDash(showArrow ? [6, 3] : [3, 5]);
  ctx.strokeRect(ox + 1, oy + 1, TILE - 2, TILE - 2);
  ctx.setLineDash([]);

  if (showArrow) {
    const ax = px(ox + TILE / 2);
    const ay = px(oy - 8 - pulse * 5);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(ax, ay + 8);
    ctx.lineTo(ax - 6, ay);
    ctx.lineTo(ax + 6, ay);
    ctx.closePath();
    ctx.fill();
  }
}

function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r},${g},${b}`;
}

function drawGoals(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  blink: number,
  cull?: CullBounds,
) {
  const allPicked = state.currentTarget >= state.targets.length;
  for (const g of state.goals) {
    if (cull && !isCellVisible(g.x, g.y, cull)) continue;
    drawGoalAt(ctx, g.x, g.y, allPicked, blink);
  }
}

function drawGoalAt(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  allPicked: boolean,
  blink: number,
) {
  const ox = gx * TILE;
  const oy = gy * TILE;
  const pulse = 0.5 + 0.5 * Math.sin(blink * Math.PI * 2);

  ctx.fillStyle = '#2a2e3a';
  ctx.fillRect(ox, oy, TILE, TILE);

  ctx.fillStyle = WALL_PIXEL.metalLo;
  ctx.fillRect(ox, oy, 4, TILE);

  const slatH = 4;
  for (let i = 0; i < Math.floor(TILE / slatH); i++) {
    const sy = oy + 2 + i * slatH;
    ctx.fillStyle = i % 2 === 0 ? '#8a7850' : '#6a5c40';
    ctx.fillRect(ox + 4, sy, TILE - 5, slatH - 1);
    ctx.fillStyle = '#a89058';
    ctx.fillRect(ox + 4, sy, TILE - 5, 1);
  }

  ctx.fillStyle = WALL_PIXEL.rivet;
  ctx.fillRect(ox + 1, oy + 8, 2, 2);
  ctx.fillRect(ox + 1, oy + 22, 2, 2);

  if (allPicked) {
    ctx.fillStyle = `rgba(201,162,39,${0.2 + 0.15 * pulse})`;
    ctx.fillRect(ox + 2, oy + 2, TILE - 3, TILE - 4);
  }
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  facing: 'up' | 'down' | 'left' | 'right',
  blink: number,
  stunned: boolean,
) {
  drawCharacter(ctx, gx, gy, facing, blink, stunned, 'player');
}

function drawRival(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  facing: 'up' | 'down' | 'left' | 'right',
  blink: number,
  stunned: boolean,
  rivalIndex = 0,
) {
  drawCharacter(ctx, gx, gy, facing, blink, stunned, 'rival', { rivalIndex });
}

function drawCharacter(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  facing: 'up' | 'down' | 'left' | 'right',
  blink: number,
  stunned: boolean,
  who: 'player' | 'rival',
  opts?: CharacterDrawOpts,
) {
  const cx = px(gx * TILE + TILE / 2);
  const cy = px(gy * TILE + TILE / 2);
  const moving = opts?.moving ?? false;
  const walkSpeed = moving ? 2.2 : 1.2;
  const wob = Math.sin(blink * Math.PI * 2 * walkSpeed + (who === 'rival' ? 1 : 0)) * (moving ? 2 : 1.2);
  const oy = px(wob * 0.25);
  const squash = opts?.squash ?? 1;

  ctx.save();
  ctx.translate(cx, cy + oy);
  ctx.scale(1, squash);
  ctx.translate(-cx, -(cy + oy));

  const palette =
    who === 'rival'
      ? RIVAL_PALETTE[(opts?.rivalIndex ?? 0) % RIVAL_PALETTE.length]
      : null;
  const body = who === 'player' ? COLORS.player : palette!.body;
  const bodyDark = who === 'player' ? COLORS.playerDark : palette!.dark;
  const outline = who === 'player' ? COLORS.playerOutline : palette!.outline;
  const stunColor = who === 'player' ? COLORS.playerStun : palette!.stun;
  const speedBoost = opts?.speedBoost && who === 'player' && !stunned;
  const pushThrough = opts?.pushThrough && who === 'player' && !stunned;

  if (speedBoost && moving) {
    ctx.globalAlpha = 0.28;
    const trailDx = facing === 'left' ? 7 : facing === 'right' ? -7 : 0;
    const trailDy = facing === 'up' ? 7 : facing === 'down' ? -7 : 0;
    ctx.fillStyle = '#7ae5ff';
    ctx.fillRect(px(cx + trailDx - 9), px(cy + oy + trailDy - 8), 18, 16);
    ctx.globalAlpha = 1;
  }

  if (pushThrough) {
    const pulse = 0.5 + 0.5 * Math.sin(blink * Math.PI * 3);
    ctx.strokeStyle = `rgba(255,90,80,${0.55 + 0.35 * pulse})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy + oy, 18 + pulse * 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (speedBoost) {
    const pulse = 0.55 + 0.45 * Math.sin(blink * Math.PI * 5);
    ctx.strokeStyle = `rgba(59,212,255,${0.45 * pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy + oy, 20, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Shadow under feet
  drawGroundShadow(ctx, cx, gy * TILE + TILE - 3, 10, 3);

  // Legs under body
  ctx.fillStyle = bodyDark;
  ctx.fillRect(px(cx - 6), px(cy + 6 + oy), 4, 5);
  ctx.fillRect(px(cx + 2), px(cy + 6 + oy), 4, 5);

  const bx = px(cx - 9);
  const by = px(cy - 9 + oy);
  const bw = 18;
  const bh = 16;
  ctx.fillStyle = stunned ? stunColor : speedBoost ? '#5ee8ff' : body;
  roundRectFill(ctx, bx, by, bw, bh, 4);

  ctx.strokeStyle = outline;
  ctx.lineWidth = 1;
  roundRectStroke(ctx, bx, by, bw, bh, 4);

  ctx.fillStyle = outline;
  ctx.fillRect(px(cx - 6), px(cy + 10 + oy), 4, 2);
  ctx.fillRect(px(cx + 2), px(cy + 10 + oy), 4, 2);

  ctx.fillStyle = bodyDark;
  roundRectFill(ctx, bx, px(cy + 3 + oy), bw, 4, 2);
  ctx.fillStyle = outline;
  ctx.fillRect(Math.round(cx - 1), Math.round(cy + 3 + oy), 2, 4);

  // Highlight on head
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(Math.round(cx - 7), Math.round(cy - 8 + oy), 12, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(Math.round(cx - 7), Math.round(cy - 6 + oy), 2, 4);

  // Eyes
  const ey = cy - 3 + oy;
  if (stunned) {
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.5;
    for (const ox2 of [-5, 2]) {
      ctx.beginPath();
      ctx.moveTo(cx + ox2, ey - 2);
      ctx.lineTo(cx + ox2 + 3, ey + 2);
      ctx.moveTo(cx + ox2 + 3, ey - 2);
      ctx.lineTo(cx + ox2, ey + 2);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = '#fff';
    ctx.fillRect(Math.round(cx - 5), Math.round(ey), 3, 3);
    ctx.fillRect(Math.round(cx + 2), Math.round(ey), 3, 3);
    ctx.fillStyle = outline;
    switch (facing) {
      case 'down':
        ctx.fillRect(Math.round(cx - 4), Math.round(ey + 1), 1, 2);
        ctx.fillRect(Math.round(cx + 3), Math.round(ey + 1), 1, 2);
        break;
      case 'up':
        ctx.fillRect(Math.round(cx - 4), Math.round(ey), 1, 1);
        ctx.fillRect(Math.round(cx + 3), Math.round(ey), 1, 1);
        break;
      case 'left':
        ctx.fillRect(Math.round(cx - 4), Math.round(ey + 1), 1, 2);
        break;
      case 'right':
        ctx.fillRect(Math.round(cx + 3), Math.round(ey + 1), 1, 2);
        break;
    }
  }

  if (stunned) {
    if (opts?.jamStun) {
      drawJamStunIcon(ctx, cx, cy + oy - 18, blink);
    } else {
      drawStunStars(ctx, cx, cy + oy - 14, blink);
    }
  }

  ctx.restore();
}

function drawJamStunIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  blink: number,
) {
  const wob = Math.sin(blink * Math.PI * 4) * 1.5;
  ctx.save();
  ctx.translate(cx, cy + wob);

  ctx.fillStyle = 'rgba(12,16,32,0.85)';
  ctx.strokeStyle = '#ff5a5a';
  ctx.lineWidth = 1.5;
  ctx.fillRect(-11, -10, 22, 16);
  ctx.strokeRect(-11.5, -10.5, 23, 17);

  ctx.strokeStyle = '#9fb0d8';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  // Wi-Fi arcs (offline — no bottom dot)
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(0, 2, 4 + i * 3, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  }

  // X mark
  ctx.strokeStyle = '#ff5a5a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-7, -6);
  ctx.lineTo(7, 6);
  ctx.moveTo(7, -6);
  ctx.lineTo(-7, 6);
  ctx.stroke();

  ctx.restore();
}

function drawStunStars(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  blink: number,
) {
  const rot = blink * Math.PI * 2;
  for (let i = 0; i < 3; i++) {
    const ang = rot + (i / 3) * Math.PI * 2;
    const sx = cx + Math.cos(ang) * 10;
    const sy = cy + Math.sin(ang) * 4;
    ctx.fillStyle = '#ffe46b';
    ctx.beginPath();
    ctx.moveTo(sx, sy - 3);
    ctx.lineTo(sx + 2, sy);
    ctx.lineTo(sx, sy + 3);
    ctx.lineTo(sx - 2, sy);
    ctx.closePath();
    ctx.fill();
  }
}

function drawPickGauge(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  progress: number,
  color: string,
  colorLight: string,
) {
  const w = TILE + 8;
  const h = 7;
  const ox = gx * TILE - 4;
  const oy = gy * TILE - 13;
  const nearDone = progress > 0.85;
  const pulse = nearDone ? 0.5 + 0.5 * Math.sin(Date.now() * 0.012) : 0;

  // Background
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRectFill(ctx, ox, oy, w, h, 2);
  ctx.fillStyle = COLORS.gaugeBg;
  ctx.fillRect(ox + 1, oy + 1, w - 2, h - 2);

  if (nearDone) {
    ctx.strokeStyle = `rgba(255,255,255,${0.25 + pulse * 0.35})`;
    ctx.lineWidth = 1;
    roundRectStroke(ctx, ox - 1, oy - 1, w + 2, h + 2, 3);
  }

  // Fill — flat color
  const fillW = Math.round((w - 2) * Math.min(1, progress));
  if (fillW > 0) {
    ctx.fillStyle = color;
    ctx.fillRect(ox + 1, oy + 1, fillW, h - 2);
  }

  // Border
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1;
  roundRectStroke(ctx, ox, oy, w, h, 2);
}

function drawCollisionFx(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  timer: number,
) {
  const cx = px(gx * TILE + TILE / 2);
  const cy = px(gy * TILE + TILE / 2);
  const t = timer / 600;
  const radius = px((1 - t) * TILE * 0.9);

  ctx.strokeStyle = `rgba(255,200,120,${t})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.55, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = `rgba(255,255,255,${t * 0.35})`;
  ctx.fillRect(cx - 4, cy - 4, 8, 8);
}

function roundRectFill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

function roundRectStroke(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.stroke();
}

void isShelf;
