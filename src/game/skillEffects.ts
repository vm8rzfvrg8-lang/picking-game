import { TILE } from './constants';
import { SkillType } from './skills';

export const SKILL_BURST_MS = 500;

/** 3×3 tiles centered on player. */
export const SKILL_BURST_PX = TILE * 3;

export interface SkillBurstState {
  skill: SkillType;
  timer: number;
}

export function createSkillBurst(skill: SkillType): SkillBurstState {
  return { skill, timer: SKILL_BURST_MS };
}

/** Progress 0 (start) → 1 (end). */
export function skillBurstProgress(state: SkillBurstState): number {
  return 1 - state.timer / SKILL_BURST_MS;
}

export function skillBurstAlpha(state: SkillBurstState): number {
  const t = state.timer / SKILL_BURST_MS;
  return Math.min(1, t * 1.4);
}

/**
 * Draw player-centered skill activation burst (3×3 tiles).
 * Pass grid-unit float position so the effect follows interpolated player movement.
 * Replace inner drawSkill*Effect bodies with sprite images later if needed.
 */
export function drawSkillBurstEffect(
  ctx: CanvasRenderingContext2D,
  skill: SkillType,
  gridX: number,
  gridY: number,
  progress: number,
  alpha: number,
  blink = 0,
) {
  if (alpha <= 0) return;
  const cx = gridX * TILE + TILE / 2;
  const cy = gridY * TILE + TILE / 2;

  ctx.save();
  ctx.globalAlpha = alpha;

  switch (skill) {
    case SkillType.SuperSpeed:
      drawSuperSpeedBurst(ctx, cx, cy, progress, blink);
      break;
    case SkillType.PushThrough:
      drawPushThroughBurst(ctx, cx, cy, progress, blink);
      break;
    case SkillType.JamSignal:
      drawJamSignalBurst(ctx, cx, cy, progress, blink);
      break;
  }

  ctx.restore();
}

/** 超早歩き: wind + yellow/orange shockwave from feet */
function drawSuperSpeedBurst(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  progress: number,
  blink: number,
) {
  const half = SKILL_BURST_PX / 2;
  const expand = 0.35 + progress * 0.65;
  const ringR = half * expand;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const ground = ctx.createRadialGradient(cx, cy + 8, 2, cx, cy, ringR);
  ground.addColorStop(0, 'rgba(255,240,120,0.55)');
  ground.addColorStop(0.45, 'rgba(255,180,60,0.35)');
  ground.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = ground;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 6, ringR * 0.95, ringR * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();

  for (let i = 0; i < 3; i++) {
    const r = ringR * (0.4 + i * 0.22 + progress * 0.15);
    ctx.strokeStyle = `rgba(255,${200 - i * 30},${80 - i * 20},${0.65 - i * 0.15})`;
    ctx.lineWidth = 3 - i * 0.6;
    ctx.beginPath();
    ctx.arc(cx, cy + 4, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(255,255,200,0.5)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2 + progress * 2.5;
    const len = ringR * (0.45 + progress * 0.4);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * 8, cy + Math.sin(ang) * 5);
    ctx.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len * 0.55);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(255,255,220,0.25)';
  for (let i = 0; i < 5; i++) {
    const wx = cx - half + ((i + blink * 3) % 5) * (SKILL_BURST_PX / 4);
    ctx.fillRect(wx, cy - 4 + (i % 2) * 6, 14 + progress * 10, 3);
  }

  ctx.restore();
}

/** ゴリ押し: red / purple force burst rings */
function drawPushThroughBurst(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  progress: number,
) {
  const half = SKILL_BURST_PX / 2;
  const expand = 0.25 + progress * 0.85;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const core = ctx.createRadialGradient(cx, cy, 4, cx, cy, half * expand);
  core.addColorStop(0, 'rgba(255,100,90,0.7)');
  core.addColorStop(0.35, 'rgba(200,40,80,0.45)');
  core.addColorStop(0.7, 'rgba(120,20,100,0.2)');
  core.addColorStop(1, 'rgba(80,0,60,0)');
  ctx.fillStyle = core;
  ctx.fillRect(cx - half, cy - half, SKILL_BURST_PX, SKILL_BURST_PX);

  for (let i = 0; i < 4; i++) {
    const r = half * (0.3 + i * 0.18 + progress * 0.35);
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(255,70,60,0.75)' : 'rgba(180,50,140,0.6)';
    ctx.lineWidth = 4 - i * 0.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2 + progress * 0.8;
    const dist = half * (0.35 + progress * 0.55);
    const sx = cx + Math.cos(ang) * dist;
    const sy = cy + Math.sin(ang) * dist;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(sx, sy);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(255,120,100,0.5)';
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,60,50,0.55)';
    ctx.fillRect(sx - 3, sy - 3, 6, 6);
  }

  ctx.restore();
}

/** 妨害電波: blue/yellow electric pulse */
function drawJamSignalBurst(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  progress: number,
  blink: number,
) {
  const half = SKILL_BURST_PX / 2;
  const pulse = 0.5 + 0.5 * Math.sin(blink * Math.PI * 8);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const field = ctx.createRadialGradient(cx, cy, 2, cx, cy, half);
  field.addColorStop(0, `rgba(120,220,255,${0.45 * pulse})`);
  field.addColorStop(0.5, `rgba(80,140,255,${0.25 * pulse})`);
  field.addColorStop(1, 'rgba(40,60,200,0)');
  ctx.fillStyle = field;
  ctx.fillRect(cx - half, cy - half, SKILL_BURST_PX, SKILL_BURST_PX);

  ctx.strokeStyle = `rgba(255,240,80,${0.8 * (1 - progress * 0.5)})`;
  ctx.lineWidth = 2.5;
  for (let ring = 0; ring < 2; ring++) {
    const r = half * (0.35 + ring * 0.25 + progress * 0.3);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(200,240,255,0.85)';
  ctx.lineWidth = 2;
  const bolts = 6;
  for (let i = 0; i < bolts; i++) {
    const baseAng = (i / bolts) * Math.PI * 2 + progress * 3;
    let px = cx;
    let py = cy;
    ctx.beginPath();
    ctx.moveTo(px, py);
    const segments = 4;
    for (let s = 1; s <= segments; s++) {
      const t = s / segments;
      const dist = half * (0.25 + progress * 0.65) * t;
      const jag = (s % 2 === 0 ? 1 : -1) * 10 * (1 - t);
      px = cx + Math.cos(baseAng) * dist + Math.sin(baseAng) * jag;
      py = cy + Math.sin(baseAng) * dist + Math.cos(baseAng) * jag;
      ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  ctx.fillStyle = `rgba(255,255,120,${0.7 * pulse})`;
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2 + blink * 2;
    ctx.fillRect(
      cx + Math.cos(ang) * (half * 0.55) - 2,
      cy + Math.sin(ang) * (half * 0.55) - 2,
      4,
      4,
    );
  }

  ctx.restore();
}
