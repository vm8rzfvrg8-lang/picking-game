import { GRID_H, GRID_W, TILE } from './constants';
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
  vfx.shakeMs = strong ? 420 : 320;
  vfx.shakeMag = strong ? 5.5 : 3.5;
}

export function triggerPickComplete(
  vfx: VfxState,
  gx: number,
  gy: number,
  who: 'player' | 'rival',
  index: number,
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
    label: `#${index + 1} GET!`,
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
  if (vfx.shakeMs <= 0) return { x: 0, y: 0 };
  const t = vfx.shakeMs / 420;
  const mag = vfx.shakeMag * t * t;
  return {
    x: (Math.random() - 0.5) * mag * 2,
    y: (Math.random() - 0.5) * mag * 2,
  };
}

export function drawVfx(ctx: CanvasRenderingContext2D, vfx: VfxState) {
  for (const f of vfx.pickFlashes) {
    const t = f.timer / 520;
    const ox = f.gx * TILE;
    const oy = f.gy * TILE;
    const rgb = f.who === 'player' ? '59,212,255' : '255,140,66';
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(
      ox + TILE / 2, oy + TILE / 2, 2,
      ox + TILE / 2, oy + TILE / 2, TILE * 0.85,
    );
    g.addColorStop(0, `rgba(${rgb},${0.55 * t})`);
    g.addColorStop(0.5, `rgba(255,228,107,${0.25 * t})`);
    g.addColorStop(1, 'rgba(255,228,107,0)');
    ctx.fillStyle = g;
    ctx.fillRect(ox - 6, oy - 6, TILE + 12, TILE + 12);
    ctx.restore();

    ctx.strokeStyle = `rgba(255,255,255,${0.7 * t})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(ox + 2, oy + 2, TILE - 4, TILE - 4);
  }

  for (const p of vfx.particles) {
    const a = Math.min(1, p.life / (p.maxLife * 0.35));
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), Math.ceil(p.size), Math.ceil(p.size));
  }
  ctx.globalAlpha = 1;

  for (const t of vfx.popTexts) {
    const a = Math.min(1, t.timer / 200);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = 'bold 9px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(t.label, t.x + 1, t.y + 1);
    ctx.fillStyle = t.color;
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
export function drawTrailMarks(ctx: CanvasRenderingContext2D, vfx: VfxState) {
  for (const t of vfx.trailMarks) {
    const alpha = Math.min(1, t.timer / TRAIL_MARK_MS);
    drawFlowTrailArrow(ctx, t.gx, t.gy, TILE, t.kind, alpha);
  }
}
