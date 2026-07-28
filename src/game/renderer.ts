import { COLORS, GameState, GRID_H, GRID_W, TILE } from './constants';
import { drawFlowArrow, drawMainAisleCenterLine, flowAt, isWrongWay } from './flow';
import { isGoalCell, isShelf } from './levelgen';

export interface RenderOpts {
  blink: number; // seconds, for pulsing
}

function bookColor(x: number, y: number): string {
  const arr = COLORS.bookColors;
  return arr[(x * 7 + y * 13) % arr.length];
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
  const checker = (gx + gy) % 2 === 0;
  ctx.fillStyle = checker ? COLORS.floorA : COLORS.floorB;
  ctx.fillRect(ox, oy, TILE, TILE);
  const grad = ctx.createRadialGradient(
    ox + TILE / 2, oy + TILE / 2, 1,
    ox + TILE / 2, oy + TILE / 2, TILE * 0.7,
  );
  grad.addColorStop(0, 'rgba(255,255,255,0.04)');
  grad.addColorStop(1, 'rgba(0,0,0,0.08)');
  ctx.fillStyle = grad;
  ctx.fillRect(ox, oy, TILE, TILE);
  if (t === 'G') {
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
  ctx.imageSmoothingEnabled = false;

  drawFloor(ctx, grid, state);
  drawGridLines(ctx);

  // Bookshelves
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (grid[y][x] === 'S') {
        drawShelf(ctx, x, y, x * TILE, y * TILE);
      }
    }
  }

  // Outer walls
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (grid[y][x] === 'W') {
        drawWall(ctx, x, y, x * TILE, y * TILE);
      }
    }
  }

  // Goal shutters embedded in wall
  drawGoals(ctx, state, opts.blink);

  // Player's current target glow (yellow)
  const pt = state.targets[state.currentTarget];
  if (pt && !pt.done) {
    drawTargetGlow(ctx, pt.x, pt.y, opts.blink, COLORS.glow, true);
  }

  if (state.tutorialReachCell) {
    drawTargetGlow(
      ctx,
      state.tutorialReachCell.x,
      state.tutorialReachCell.y,
      opts.blink,
      COLORS.glow,
      false,
    );
  }

  // Rival
  drawRival(ctx, state.rival.x, state.rival.y, state.rival.facing, opts.blink, state.rival.stun > 0);
  if (state.rival.isPicking) {
    drawPickGauge(ctx, state.rival.x, state.rival.y, state.rival.pickProgress, COLORS.rivalGauge, COLORS.rivalGaugeLight);
  }

  // Player
  drawPlayer(ctx, state.player.x, state.player.y, state.player.facing, opts.blink, state.player.stun > 0);
  if (state.isPicking) {
    drawPickGauge(ctx, state.player.x, state.player.y, state.pickProgress, COLORS.gauge, COLORS.gaugeLight);
  }

  // Collision effect
  if (state.collisionFx > 0 && state.collisionPos) {
    drawCollisionFx(ctx, state.collisionPos.x, state.collisionPos.y, state.collisionFx);
  }
}

function drawFloor(ctx: CanvasRenderingContext2D, grid: string[][], state: GameState) {
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const t = grid[y][x];
      if (t !== 'F' && t !== 'G') continue;
      const ox = x * TILE;
      const oy = y * TILE;
      const checker = (x + y) % 2 === 0;
      const base = checker ? COLORS.floorA : COLORS.floorB;
      ctx.fillStyle = base;
      ctx.fillRect(ox, oy, TILE, TILE);

      const grad = ctx.createRadialGradient(
        ox + TILE / 2, oy + TILE / 2, 1,
        ox + TILE / 2, oy + TILE / 2, TILE * 0.7,
      );
      grad.addColorStop(0, 'rgba(255,255,255,0.04)');
      grad.addColorStop(1, 'rgba(0,0,0,0.08)');
      ctx.fillStyle = grad;
      ctx.fillRect(ox, oy, TILE, TILE);

      if ((x * 3 + y * 7) % 5 === 0) {
        ctx.fillStyle = COLORS.floorC;
        ctx.fillRect(ox + ((x * 5) % (TILE - 2)), oy + ((y * 3) % (TILE - 2)), 2, 2);
      }

      if (flowAt(x, y)) {
        const playerWrong =
          state.player.x === x &&
          state.player.y === y &&
          isWrongWay(x, y, state.player.lastMoveDir);
        const rivalWrong =
          state.rival.x === x &&
          state.rival.y === y &&
          isWrongWay(x, y, state.rival.lastMoveDir);
        drawFlowArrow(ctx, x, y, TILE, playerWrong || rivalWrong);
      }
    }
  }
  drawMainAisleCenterLine(ctx, TILE);
}

function drawGridLines(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = COLORS.floorGrout;
  ctx.lineWidth = 1;
  for (let x = 0; x <= GRID_W; x++) {
    ctx.beginPath();
    ctx.moveTo(Math.round(x * TILE) + 0.5, 0);
    ctx.lineTo(Math.round(x * TILE) + 0.5, GRID_H * TILE);
    ctx.stroke();
  }
  for (let y = 0; y <= GRID_H; y++) {
    ctx.beginPath();
    ctx.moveTo(0, Math.round(y * TILE) + 0.5);
    ctx.lineTo(GRID_W * TILE, Math.round(y * TILE) + 0.5);
    ctx.stroke();
  }
}

function drawWall(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  ox: number,
  oy: number,
) {
  // Top face — main wall surface
  const grad = ctx.createLinearGradient(ox, oy, ox, oy + TILE);
  grad.addColorStop(0, COLORS.wallTopLight);
  grad.addColorStop(0.5, COLORS.wallTop);
  grad.addColorStop(1, COLORS.wallTopDark);
  ctx.fillStyle = grad;
  ctx.fillRect(ox, oy, TILE, TILE);

  // Brick pattern
  const brickH = 8;
  const brickW = 16;
  const offset = (gy % 2) * (brickW / 2);
  ctx.fillStyle = COLORS.wallMortar;
  for (let row = 0; row < Math.ceil(TILE / brickH); row++) {
    const by = oy + row * brickH;
    ctx.fillRect(ox, by, TILE, 1);
    for (let col = 0; col < Math.ceil(TILE / brickW) + 1; col++) {
      const bx = ox + col * brickW - offset;
      if (bx >= ox && bx < ox + TILE) {
        ctx.fillRect(bx, by, 1, brickH);
      }
    }
  }

  // Brick shading
  for (let row = 0; row < Math.ceil(TILE / brickH); row++) {
    const by = oy + row * brickH + 1;
    for (let col = 0; col < Math.ceil(TILE / brickW) + 1; col++) {
      const bx = ox + col * brickW - offset;
      if (bx >= ox && bx < ox + TILE - 1) {
        // Top highlight
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(bx + 1, by, brickW - 2, 1);
        // Bottom shadow
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(bx + 1, by + brickH - 2, brickW - 2, 1);
      }
    }
  }

  // Bottom edge — dark base for depth
  ctx.fillStyle = COLORS.wallSideDark;
  ctx.fillRect(ox, oy + TILE - 3, TILE, 3);
  ctx.fillStyle = COLORS.wallEdge;
  ctx.fillRect(ox, oy, 1, TILE);
  ctx.fillRect(ox + TILE - 1, oy, 1, TILE);
  ctx.fillRect(ox, oy, TILE, 1);
}

function drawShelf(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  ox: number,
  oy: number,
) {
  // Dark recessed back
  const backGrad = ctx.createLinearGradient(ox, oy, ox, oy + TILE);
  backGrad.addColorStop(0, COLORS.shelfBackDark);
  backGrad.addColorStop(0.5, COLORS.shelfBack);
  backGrad.addColorStop(1, COLORS.shelfBackDark);
  ctx.fillStyle = backGrad;
  ctx.fillRect(ox, oy, TILE, TILE);

  // Wood frame
  const frameW = 3;
  const frameGrad = ctx.createLinearGradient(ox, oy, ox + TILE, oy);
  frameGrad.addColorStop(0, COLORS.shelfWoodDark);
  frameGrad.addColorStop(0.3, COLORS.shelfWood);
  frameGrad.addColorStop(0.7, COLORS.shelfWoodLight);
  frameGrad.addColorStop(1, COLORS.shelfWoodDark);
  ctx.fillStyle = frameGrad;
  // Top and bottom boards
  ctx.fillRect(ox, oy, TILE, frameW);
  ctx.fillRect(ox, oy + TILE - frameW, TILE, frameW);
  // Left and right posts
  ctx.fillRect(ox, oy, frameW, TILE);
  ctx.fillRect(ox + TILE - frameW, oy, frameW, TILE);

  // Wood grain on frame
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(ox + 1, oy + 1, TILE - 2, 1);
  ctx.fillRect(ox + 1, oy + TILE - 2, TILE - 2, 1);
  ctx.fillStyle = COLORS.shelfWoodHighlight;
  ctx.fillRect(ox, oy, TILE, 1);
  ctx.fillRect(ox, oy + TILE - frameW, TILE, 1);

  // Shelf boards (horizontal dividers)
  const shelfY1 = Math.round(oy + TILE * 0.33);
  const shelfY2 = Math.round(oy + TILE * 0.66);
  for (const sy of [shelfY1, shelfY2]) {
    const bGrad = ctx.createLinearGradient(ox, sy - 2, ox, sy + 2);
    bGrad.addColorStop(0, COLORS.shelfBoardLight);
    bGrad.addColorStop(0.5, COLORS.shelfBoard);
    bGrad.addColorStop(1, COLORS.shelfWoodDark);
    ctx.fillStyle = bGrad;
    ctx.fillRect(ox + frameW, sy - 2, TILE - frameW * 2, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(ox + frameW, sy - 2, TILE - frameW * 2, 1);
  }

  // Books on each shelf
  const rows = [oy + 4, shelfY1 + 1, shelfY2 + 1];
  const rowEnds = [shelfY1 - 3, shelfY2 - 3, oy + TILE - 4];
  for (let r = 0; r < 3; r++) {
    let bx = ox + frameW + 1;
    const limit = ox + TILE - frameW - 1;
    while (bx < limit) {
      const w = 2 + ((gx * 3 + gy * 5 + r * 7 + bx) % 3);
      const h = rowEnds[r] - rows[r];
      const c = bookColor(gx + bx, gy + r);
      // Book spine
      ctx.fillStyle = c;
      ctx.fillRect(bx, rows[r], w, h);
      // Spine highlight (left edge)
      ctx.fillStyle = COLORS.bookHighlight;
      ctx.fillRect(bx, rows[r], 1, h);
      // Spine shadow (right edge)
      ctx.fillStyle = COLORS.bookShadow;
      ctx.fillRect(bx + w - 1, rows[r], 1, h);
      // Top page line
      if (h > 4) {
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(bx, rows[r], w, 1);
      }
      bx += w + 1;
    }
  }

  // Top frame highlight
  ctx.fillStyle = COLORS.shelfWoodHighlight;
  ctx.fillRect(ox + 1, oy, TILE - 2, 1);
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
  const pad = showArrow ? 4 : 3;
  const radius = 0.72;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const grad = ctx.createRadialGradient(
    ox + TILE / 2, oy + TILE / 2, 2,
    ox + TILE / 2, oy + TILE / 2, TILE * radius,
  );
  grad.addColorStop(0, `rgba(${rgb},${(0.72 + 0.28 * pulse) * intensity})`);
  grad.addColorStop(0.55, `rgba(${rgb},${(0.32 + 0.18 * pulse) * intensity})`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(ox - pad, oy - pad, TILE + pad * 2, TILE + pad * 2);
  ctx.restore();

  ctx.strokeStyle = `rgba(${rgb},${(0.85 + 0.15 * pulse) * intensity})`;
  ctx.lineWidth = showArrow ? 3 : 1.5;
  ctx.setLineDash(showArrow ? [6, 3] : [3, 5]);
  ctx.strokeRect(ox + 1, oy + 1, TILE - 2, TILE - 2);
  ctx.setLineDash([]);

  // Inner bright rim
  if (showArrow) {
    ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.25 * pulse})`;
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + 3, oy + 3, TILE - 6, TILE - 6);
  }

  if (showArrow) {
    const ax = ox + TILE / 2;
    const ay = oy - 8 - pulse * 5;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(ax, ay + 8);
    ctx.lineTo(ax - 6, ay);
    ctx.lineTo(ax + 6, ay);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(ax - 1, ay + 1, 2, 4);
  }
}

function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r},${g},${b}`;
}

function drawGoals(ctx: CanvasRenderingContext2D, state: GameState, blink: number) {
  const allPicked = state.currentTarget >= state.targets.length;
  for (const g of state.goals) {
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
    ctx.fillRect(ox + 1, sy, TILE - 2, slatH - 1);
    if (i % 2 === 1) {
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(ox + 1, sy, TILE - 2, 1);
    }
  }

  ctx.fillStyle = COLORS.goalLight;
  ctx.fillRect(ox, oy, 2, TILE);
  ctx.fillStyle = COLORS.goalMetalDark;
  ctx.fillRect(ox + TILE - 3, oy + TILE / 2 - 2, 2, 4);

  if (allPicked) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(
      ox + TILE / 2, oy + TILE / 2, 3,
      ox + TILE / 2, oy + TILE / 2, TILE * 0.9,
    );
    g.addColorStop(0, `rgba(255,228,107,${0.5 + 0.3 * pulse})`);
    g.addColorStop(0.5, `rgba(255,228,107,${0.2 + 0.1 * pulse})`);
    g.addColorStop(1, 'rgba(255,228,107,0)');
    ctx.fillStyle = g;
    ctx.fillRect(ox - 12, oy - 12, TILE + 24, TILE + 24);
    ctx.restore();
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
) {
  drawCharacter(ctx, gx, gy, facing, blink, stunned, 'rival');
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
  const cx = gx * TILE + TILE / 2;
  const cy = gy * TILE + TILE / 2;
  const moving = opts?.moving ?? false;
  const walkSpeed = moving ? 2.2 : 1.2;
  const wob = Math.sin(blink * Math.PI * 2 * walkSpeed + (who === 'rival' ? 1 : 0)) * (moving ? 2 : 1.2);
  const oy = wob * 0.25;
  const squash = opts?.squash ?? 1;

  ctx.save();
  ctx.translate(cx, cy + oy);
  ctx.scale(1, squash);
  ctx.translate(-cx, -(cy + oy));

  const body = who === 'player' ? COLORS.player : COLORS.rival;
  const bodyLight = who === 'player' ? COLORS.playerLight : COLORS.rivalLight;
  const bodyDark = who === 'player' ? COLORS.playerDark : COLORS.rivalDark;
  const outline = who === 'player' ? COLORS.playerOutline : COLORS.rivalOutline;
  const stunColor = who === 'player' ? COLORS.playerStun : COLORS.rivalStun;
  const speedBoost = opts?.speedBoost && who === 'player' && !stunned;
  const pushThrough = opts?.pushThrough && who === 'player' && !stunned;

  if (speedBoost && moving) {
    ctx.save();
    ctx.globalAlpha = 0.28;
    const trailDx =
      facing === 'left' ? 7 : facing === 'right' ? -7 : facing === 'up' ? 0 : 0;
    const trailDy =
      facing === 'up' ? 7 : facing === 'down' ? -7 : 0;
    ctx.fillStyle = '#7ae5ff';
    ctx.fillRect(Math.round(cx + trailDx - 9), Math.round(cy + oy + trailDy - 8), 18, 16);
    ctx.globalAlpha = 0.16;
    ctx.fillRect(Math.round(cx + trailDx * 1.6 - 9), Math.round(cy + oy + trailDy * 1.6 - 8), 18, 16);
    ctx.restore();
  }

  if (pushThrough) {
    ctx.save();
    const pulse = 0.5 + 0.5 * Math.sin(blink * Math.PI * 3);
    ctx.strokeStyle = `rgba(255,90,80,${0.55 + 0.35 * pulse})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy + oy, 18 + pulse * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,160,140,${0.35 + 0.2 * pulse})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy + oy, 14, 0, Math.PI * 2);
    ctx.stroke();
    const barrier = ctx.createRadialGradient(cx, cy + oy, 8, cx, cy + oy, 22);
    barrier.addColorStop(0, 'rgba(255,80,70,0.08)');
    barrier.addColorStop(1, `rgba(255,40,40,${0.22 * pulse})`);
    ctx.fillStyle = barrier;
    ctx.beginPath();
    ctx.arc(cx, cy + oy, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (speedBoost) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.55 + 0.45 * Math.sin(blink * Math.PI * 5);
    const aura = ctx.createRadialGradient(cx, cy + oy, 2, cx, cy + oy, 24);
    aura.addColorStop(0, `rgba(180,255,255,${0.65 * pulse})`);
    aura.addColorStop(0.55, `rgba(59,212,255,${0.3 * pulse})`);
    aura.addColorStop(1, 'rgba(59,212,255,0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(cx, cy + oy, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${0.45 * pulse})`;
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const ang = blink * 4 + i * (Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * 12, cy + oy + Math.sin(ang) * 8);
      ctx.lineTo(cx + Math.cos(ang) * 20, cy + oy + Math.sin(ang) * 14);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Shadow
  ctx.fillStyle = COLORS.shadow;
  ctx.beginPath();
  ctx.ellipse(cx, gy * TILE + TILE - 4, 11, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Legs
  ctx.fillStyle = bodyDark;
  ctx.fillRect(Math.round(cx - 6), Math.round(cy + 6 + oy), 4, 5);
  ctx.fillRect(Math.round(cx + 2), Math.round(cy + 6 + oy), 4, 5);
  // Feet
  ctx.fillStyle = outline;
  ctx.fillRect(Math.round(cx - 6), Math.round(cy + 10 + oy), 4, 2);
  ctx.fillRect(Math.round(cx + 2), Math.round(cy + 10 + oy), 4, 2);

  // Body — rounded rect with gradient
  const bx = cx - 9;
  const by = cy - 9 + oy;
  const bw = 18;
  const bh = 16;
  const bodyGrad = ctx.createLinearGradient(bx, by, bx, by + bh);
  if (speedBoost) {
    bodyGrad.addColorStop(0, '#b8ffff');
    bodyGrad.addColorStop(0.5, '#5ee8ff');
    bodyGrad.addColorStop(1, '#2ab8e8');
  } else {
    bodyGrad.addColorStop(0, bodyLight);
    bodyGrad.addColorStop(0.5, body);
    bodyGrad.addColorStop(1, bodyDark);
  }
  ctx.fillStyle = stunned ? stunColor : bodyGrad;
  roundRectFill(ctx, bx, by, bw, bh, 4);

  // Body outline
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1;
  roundRectStroke(ctx, bx, by, bw, bh, 4);

  // Belt
  ctx.fillStyle = bodyDark;
  roundRectFill(ctx, bx, cy + 3 + oy, bw, 4, 2);
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

  // Fill with gradient
  const fillW = Math.round((w - 2) * Math.min(1, progress));
  if (fillW > 0) {
    const fillGrad = ctx.createLinearGradient(ox, oy, ox, oy + h);
    fillGrad.addColorStop(0, colorLight);
    fillGrad.addColorStop(1, color);
    ctx.fillStyle = fillGrad;
    ctx.fillRect(ox + 1, oy + 1, fillW, h - 2);
    // Shine
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(ox + 1, oy + 1, fillW, 1);
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
  const cx = gx * TILE + TILE / 2;
  const cy = gy * TILE + TILE / 2;
  const t = timer / 600;
  const radius = (1 - t) * TILE * 0.9;
  const ringPulse = 0.6 + 0.4 * Math.sin(t * Math.PI * 4);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // Impact ring
  ctx.strokeStyle = `rgba(255,200,120,${t * ringPulse})`;
  ctx.lineWidth = 3 * t;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.55, 0, Math.PI * 2);
  ctx.stroke();

  // Central flash
  const flashGrad = ctx.createRadialGradient(cx, cy, 1, cx, cy, radius);
  flashGrad.addColorStop(0, `rgba(255,255,255,${t * 0.6})`);
  flashGrad.addColorStop(0.3, `rgba(255,240,200,${t * 0.3})`);
  flashGrad.addColorStop(1, 'rgba(255,200,100,0)');
  ctx.fillStyle = flashGrad;
  ctx.fillRect(cx - radius - 4, cy - radius - 4, radius * 2 + 8, radius * 2 + 8);

  // Star burst ring
  ctx.strokeStyle = `rgba(255,255,255,${t})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Spark lines
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2 + t * 2;
    const r1 = radius * 0.4;
    const r2 = radius * 1.15;
    ctx.strokeStyle = `rgba(255,255,200,${t * 0.8})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
    ctx.lineTo(cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2);
    ctx.stroke();
  }

  // Impact stars
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const sx = cx + Math.cos(ang) * radius * 0.7;
    const sy = cy + Math.sin(ang) * radius * 0.7;
    ctx.fillStyle = `rgba(255,255,255,${t})`;
    ctx.fillRect(Math.round(sx - 1), Math.round(sy), 2, 1);
    ctx.fillRect(Math.round(sx), Math.round(sy - 1), 1, 2);
  }

  ctx.restore();
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
