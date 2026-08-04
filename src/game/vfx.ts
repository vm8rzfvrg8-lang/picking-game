import { GRID_H, GRID_W, TILE } from './constants';
import { gridDecorOffset, gridWorldX, gridWorldY } from './camera';
import { getComboCanvasColor } from './combo';
import { SkillType } from './skills';
import { classifyMoveTrail, drawFlowTrailArrow } from './flow';
import type { Direction } from './constants';
import {
  createSkillBurst,
  drawSkillBurstEffect,
  skillBurstAlpha,
  skillBurstProgress,
  type SkillBurstState,
} from './skillEffects';

const TRAIL_MARK_MS = 500;

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  gravity: number;
}

export interface PickFlash {
  gx: number;
  gy: number;
  timer: number;
  who: 'player' | 'rival';
}

export interface PopText {
  x: number;
  y: number;
  timer: number;
  label: string;
  color: string;
  /** When set, color follows combo palette (incl. rainbow for ≥5). */
  comboLevel?: number;
}

export interface TrailMark {
  gx: number;
  gy: number;
  kind: 'flow' | 'wrong';
  timer: number;
}

export interface VfxState {
  particles: Particle[];
  pickFlashes: PickFlash[];
  popTexts: PopText[];
  trailMarks: TrailMark[];
  skillBurst: SkillBurstState | null;
  shakeMs: number;
  shakeDuration: number;
  shakeMag: number;
  ambientAcc: number;
}

export function createVfx(): VfxState {
  return {
    particles: [],
    pickFlashes: [],
    popTexts: [],
    trailMarks: [],
    skillBurst: null,
    shakeMs: 0,
    shakeDuration: 0,
    shakeMag: 0,
    ambientAcc: 0,
  };
}

export function resetVfx(vfx: VfxState) {
  vfx.particles = [];
  vfx.pickFlashes = [];
  vfx.popTexts = [];
  vfx.trailMarks = [];
  vfx.skillBurst = null;
  vfx.shakeMs = 0;
  vfx.shakeDuration = 0;
  vfx.shakeMag = 0;
  vfx.ambientAcc = 0;
}

export function triggerTrailMark(
  vfx: VfxState,
  gx: number,
  gy: number,
  moveDir: Direction,
) {
  const kind = classifyMoveTrail(gx, gy, moveDir);
  if (!kind) return;
  const existing = vfx.trailMarks.find((t) => t.gx === gx && t.gy === gy);
  if (existing) {
    existing.kind = kind;
    existing.timer = TRAIL_MARK_MS;
  } else {
    vfx.trailMarks.push({ gx, gy, kind, timer: TRAIL_MARK_MS });
  }
}

export function triggerSkillActivate(
  vfx: VfxState,
  skill: SkillType,
  gridX: number,
  gridY: number,
) {
  vfx.skillBurst = createSkillBurst(skill);

  const cx = gridX * TILE + TILE / 2;
  const cy = gridY * TILE + TILE / 2;
  const label =
    skill === SkillType.PushThrough
      ? 'PUSH!'
      : skill === SkillType.JamSignal
        ? 'JAM!'
        : 'SPEED UP!';
  const colors =
    skill === SkillType.PushThrough
      ? ['#ff5a5a', '#ff8a80']
      : skill === SkillType.JamSignal
        ? ['#a06aff', '#c89bff']
        : ['#ffe46b', '#ffaa3a'];

  vfx.popTexts.push({
    x: cx,
    y: cy - 14,
    timer: 450,
    label,
    color: colors[0],
  });
}

export function triggerCollisionShake(vfx: VfxState, strong = false) {
  vfx.shakeDuration = strong ? 200 : 150;
  vfx.shakeMs = vfx.shakeDuration;
  vfx.shakeMag = strong ? 2.2 : 1.4;
}

export function triggerComboPop(
  vfx: VfxState,
  gx: number,
  gy: number,
  combo: number,
) {
  const cx = gx * TILE + TILE / 2;
  const cy = gy * TILE + TILE / 2;
  const color = getComboCanvasColor(combo, performance.now() / 1000);

  vfx.popTexts.push({
    x: cx,
    y: cy - 22,
    timer: 900,
    label: `${combo} COMBO!`,
    color,
    comboLevel: combo,
  });
  vfx.popTexts.push({
    x: cx,
    y: cy - 36,
    timer: 750,
    label: combo >= 5 ? 'ZONE!' : 'SPEED UP!',
    color,
    comboLevel: combo,
  });

  const particleColors =
    combo >= 5
      ? ['#FF3333', '#FFB830', '#00FF7F', '#00BFFF', '#A855F7']
      : [color, color];

  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    vfx.particles.push({
      x: cx,
      y: cy - 18,
      vx: Math.cos(ang) * 50,
      vy: Math.sin(ang) * 50 - 40,
      life: 320,
      maxLife: 320,
      color: particleColors[i % particleColors.length],
      size: 2,
      gravity: 80,
    });
  }
}

export function triggerPickComplete(
  vfx: VfxState,
  gx: number,
  gy: number,
  who: 'player' | 'rival',
  locationNumber: number,
) {
  const cx = gx * TILE + TILE / 2;
  const cy = gy * TILE + TILE / 2;
  const base = who === 'player' ? '#3bd4ff' : '#ff8c42';
  const light = who === 'player' ? '#7ae5ff' : '#ffb070';
  const gold = '#ffe46b';

  vfx.pickFlashes.push({ gx, gy, timer: 520, who });

  vfx.popTexts.push({
    x: cx,
    y: cy - 8,
    timer: 700,
    label: `#${locationNumber} GET!`,
    color: base,
  });

  for (let i = 0; i < 14; i++) {
    const ang = (i / 14) * Math.PI * 2 + Math.random() * 0.4;
    const spd = 40 + Math.random() * 90;
    vfx.particles.push({
      x: cx + (Math.random() - 0.5) * 8,
      y: cy + (Math.random() - 0.5) * 8,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd - 30,
      life: 400 + Math.random() * 280,
      maxLife: 680,
      color: i % 3 === 0 ? gold : i % 2 === 0 ? light : base,
      size: 1.5 + Math.random() * 2.5,
      gravity: 120,
    });
  }
}

export function triggerGoalUnlock(vfx: VfxState, goals: { x: number; y: number }[]) {
  for (const g of goals) {
    const cx = g.x * TILE + TILE / 2;
    const cy = g.y * TILE + TILE / 2;
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2;
      const spd = 25 + Math.random() * 45;
      vfx.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 20,
        life: 600 + Math.random() * 400,
        maxLife: 1000,
        color: i % 2 === 0 ? '#ffe46b' : '#fff5a8',
        size: 2 + Math.random() * 2,
        gravity: 40,
      });
    }
  }
  vfx.popTexts.push({
    x: goals[0].x * TILE + TILE / 2,
    y: goals[0].y * TILE - 18,
    timer: 900,
    label: 'GOAL OPEN!',
    color: '#ffe46b',
  });
}

export function triggerWinBurst(vfx: VfxState, gx: number, gy: number) {
  const cx = gx * TILE + TILE / 2;
  const cy = gy * TILE + TILE / 2;
  for (let i = 0; i < 24; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = 50 + Math.random() * 120;
    vfx.particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd - 60,
      life: 700 + Math.random() * 500,
      maxLife: 1200,
      color: ['#ffe46b', '#3bd4ff', '#fff5a8', '#7ae5ff'][i % 4],
      size: 2 + Math.random() * 3,
      gravity: 80,
    });
  }
}

function spawnAmbientDust(vfx: VfxState) {
  if (vfx.particles.filter((p) => p.gravity === 0).length > 18) return;
  vfx.particles.push({
    x: Math.random() * TILE * GRID_W,
    y: Math.random() * TILE * GRID_H,
    vx: (Math.random() - 0.5) * 6,
    vy: -2 - Math.random() * 4,
    life: 2000 + Math.random() * 2000,
    maxLife: 4000,
    color: 'rgba(255,235,200,0.35)',
    size: 1 + Math.random(),
    gravity: 0,
  });
}

export function updateVfx(vfx: VfxState, dtMs: number, playing: boolean) {
  if (playing) {
    vfx.ambientAcc += dtMs;
    if (vfx.ambientAcc >= 900) {
      vfx.ambientAcc = 0;
      spawnAmbientDust(vfx);
    }
  }

  if (vfx.shakeMs > 0) vfx.shakeMs = Math.max(0, vfx.shakeMs - dtMs);

  if (vfx.skillBurst) {
    vfx.skillBurst.timer -= dtMs;
    if (vfx.skillBurst.timer <= 0) vfx.skillBurst = null;
  }

  vfx.pickFlashes = vfx.pickFlashes
    .map((f) => ({ ...f, timer: f.timer - dtMs }))
    .filter((f) => f.timer > 0);

  vfx.popTexts = vfx.popTexts
    .map((t) => ({ ...t, timer: t.timer - dtMs, y: t.y - dtMs * 0.035 }))
    .filter((t) => t.timer > 0);

  vfx.trailMarks = vfx.trailMarks
    .map((t) => ({ ...t, timer: t.timer - dtMs }))
    .filter((t) => t.timer > 0);

  const dt = dtMs / 1000;
  vfx.particles = vfx.particles.filter((p) => {
    p.life -= dtMs;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += p.gravity * dt;
    p.vx *= p.gravity === 0 ? 1 : 0.98;
    return p.life > 0;
  });
}

export function getShakeOffset(vfx: VfxState): { x: number; y: number } {
  if (vfx.shakeMs <= 0 || vfx.shakeDuration <= 0) return { x: 0, y: 0 };
  const t = vfx.shakeMs / vfx.shakeDuration;
  const mag = vfx.shakeMag * t * t;
  return {
    x: (Math.random() - 0.5) * mag * 2,
    y: (Math.random() - 0.5) * mag * 2,
  };
}

export function drawVfx(ctx: CanvasRenderingContext2D, vfx: VfxState, cull?: import('./camera').CullBounds) {
  const decor = gridDecorOffset();
  for (const f of vfx.pickFlashes) {
    if (cull) {
      const wx = gridWorldX(f.gx);
      const wy = gridWorldY(f.gy);
      if (wx + TILE <= cull.minX || wx >= cull.maxX || wy + TILE <= cull.minY || wy >= cull.maxY) continue;
    }
    const t = f.timer / 520;
    const ox = f.gx * TILE;
    const oy = f.gy * TILE;
    ctx.fillStyle = f.who === 'player' ? `rgba(59,212,255,${0.4 * t})` : `rgba(255,140,66,${0.4 * t})`;
    ctx.fillRect(ox, oy, TILE, TILE);
    ctx.strokeStyle = `rgba(255,255,255,${0.6 * t})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(ox + 2, oy + 2, TILE - 4, TILE - 4);
  }

  for (const p of vfx.particles) {
    if (cull) {
      const wx = p.x + decor.x;
      const wy = p.y + decor.y;
      if (wx >= cull.maxX || wx + p.size <= cull.minX || wy >= cull.maxY || wy + p.size <= cull.minY) continue;
    }
    const a = Math.min(1, p.life / (p.maxLife * 0.35));
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), Math.ceil(p.size), Math.ceil(p.size));
  }
  ctx.globalAlpha = 1;

  for (const t of vfx.popTexts) {
    const a = Math.min(1, t.timer / 200);
    const fillColor =
      t.comboLevel != null
        ? getComboCanvasColor(t.comboLevel, performance.now() / 1000)
        : t.color;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = 'bold 9px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(t.label, t.x + 1, t.y + 1);
    ctx.fillStyle = fillColor;
    ctx.fillText(t.label, t.x, t.y);
    ctx.restore();
  }
}

/** Draw player-followed skill burst (call with live player grid position). */
export function drawSkillBurst(
  ctx: CanvasRenderingContext2D,
  vfx: VfxState,
  playerGridX: number,
  playerGridY: number,
  blink: number,
) {
  if (!vfx.skillBurst) return;
  const burst = vfx.skillBurst;
  drawSkillBurstEffect(
    ctx,
    burst.skill,
    playerGridX,
    playerGridY,
    skillBurstProgress(burst),
    skillBurstAlpha(burst),
    blink,
  );
}

/** Draw lane trail marks (call after entities so departed tiles stay visible). */
export function drawTrailMarks(ctx: CanvasRenderingContext2D, vfx: VfxState, cull?: import('./camera').CullBounds) {
  for (const t of vfx.trailMarks) {
    if (cull && !isTrailVisible(t.gx, t.gy, cull)) continue;
    const alpha = Math.min(1, t.timer / TRAIL_MARK_MS);
    drawFlowTrailArrow(ctx, t.gx, t.gy, TILE, t.kind, alpha);
  }
}

function isTrailVisible(gx: number, gy: number, cull: import('./camera').CullBounds): boolean {
  const ox = gridWorldX(gx);
  const oy = gridWorldY(gy);
  return ox + TILE > cull.minX && ox < cull.maxX && oy + TILE > cull.minY && oy < cull.maxY;
}
