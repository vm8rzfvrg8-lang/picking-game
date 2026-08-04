import { GRID_H, GRID_W, TILE } from './constants';
import { gridDecorOffset, gridWorldX, gridWorldY } from './camera';
import { getComboCanvasColor } from './combo';
import { PALETTE } from './palette';
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

/** Golden book orb tweened from shelf toward the collector. */
export interface PickAbsorbOrb {
  startX: number;
  startY: number;
  x: number;
  y: number;
  elapsed: number;
  flyMs: number;
  fadeElapsed: number;
  phase: 'fly' | 'fade';
  /** Quadratic-bezier control lift (px above path). */
  arcLift: number;
  /** Horizontal curve bias for a wider arc. */
  sideBias: number;
  color: string;
  highlight: string;
  size: number;
  who: 'player' | 'rival';
  rivalId?: number;
  trailAcc: number;
}

/** Sparkle motes left along the book's flight path. */
export interface OrbTrailSpark {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  size: number;
  twinkle: number;
}

/** Brief hop + white flash when a pick orb is absorbed. */
export interface HarvestFeedback {
  timer: number;
  maxTimer: number;
  who: 'player' | 'rival';
  rivalId?: number;
}

export interface AbsorbTargetLookup {
  player: { x: number; y: number };
  rivals: Record<number, { x: number; y: number }>;
}

export interface VfxState {
  particles: Particle[];
  pickFlashes: PickFlash[];
  popTexts: PopText[];
  trailMarks: TrailMark[];
  pickAbsorbOrbs: PickAbsorbOrb[];
  orbTrailSparks: OrbTrailSpark[];
  harvestFeedbacks: HarvestFeedback[];
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
    pickAbsorbOrbs: [],
    orbTrailSparks: [],
    harvestFeedbacks: [],
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
  vfx.pickAbsorbOrbs = [];
  vfx.orbTrailSparks = [];
  vfx.harvestFeedbacks = [];
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

const PICK_ORB_COLORS = [
  { body: PALETTE.cautionYellow, highlight: '#fff5a8' },
  { body: PALETTE.safetyOrange, highlight: PALETTE.cautionYellow },
  { body: PALETTE.pixelWhite, highlight: PALETTE.cautionYellow },
] as const;

const ORB_COUNT = 1;
const ORB_SIZE = 15;
const ORB_FLY_MS = 320;
const ORB_FADE_MS = 80;
const HARVEST_FX_MS = 220;
const ORB_TRAIL_INTERVAL_MS = 28;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutSine(t: number): number {
  return 0.5 - 0.5 * Math.cos(Math.PI * t);
}

/** Quadratic bezier with live end point — arcs up then homes to moving target. */
function computeArcOrbPosition(
  orb: PickAbsorbOrb,
  endX: number,
  endY: number,
  t: number,
): { x: number; y: number } {
  const e = easeInOutSine(t);
  const ctrlX = (orb.startX + endX) * 0.5 + orb.sideBias;
  const ctrlY = Math.min(orb.startY, endY) - orb.arcLift;
  const u = 1 - e;
  return {
    x: u * u * orb.startX + 2 * u * e * ctrlX + e * e * endX,
    y: u * u * orb.startY + 2 * u * e * ctrlY + e * e * endY,
  };
}

function spawnOrbTrailSpark(vfx: VfxState, x: number, y: number) {
  vfx.orbTrailSparks.push({
    x: x + (Math.random() - 0.5) * 6,
    y: y + (Math.random() - 0.5) * 6,
    life: 260 + Math.random() * 140,
    maxLife: 400,
    size: 1 + Math.random() * 1.5,
    twinkle: Math.random() * Math.PI * 2,
  });
}

function resolveAbsorbTargetPx(
  who: 'player' | 'rival',
  rivalId: number | undefined,
  targets: AbsorbTargetLookup | undefined,
): { x: number; y: number } | null {
  if (!targets) return null;
  const grid =
    who === 'player'
      ? targets.player
      : rivalId != null
        ? targets.rivals[rivalId]
        : undefined;
  if (!grid) return null;
  return {
    x: grid.x * TILE + TILE / 2,
    y: grid.y * TILE + TILE / 2 - 6,
  };
}

function spawnAbsorbFeedback(
  vfx: VfxState,
  x: number,
  y: number,
  who: 'player' | 'rival',
  rivalId?: number,
) {
  vfx.harvestFeedbacks.push({
    timer: HARVEST_FX_MS,
    maxTimer: HARVEST_FX_MS,
    who,
    rivalId,
  });

  const sparkColors = [PALETTE.cautionYellow, PALETTE.pixelWhite, PALETTE.safetyOrange];
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2 + Math.random() * 0.4;
    const spd = 28 + Math.random() * 40;
    vfx.particles.push({
      x,
      y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      life: 140 + Math.random() * 80,
      maxLife: 220,
      color: sparkColors[i % sparkColors.length],
      size: 1 + Math.random(),
      gravity: 0,
    });
  }
}

/** Per-character harvest hop / flash strengths for entity drawing. */
export function getHarvestCharacterFx(
  vfx: VfxState,
  who: 'player' | 'rival',
  rivalId?: number,
): { yOffsetPx: number; flashAlpha: number } {
  let yOffsetPx = 0;
  let flashAlpha = 0;

  for (const fx of vfx.harvestFeedbacks) {
    if (fx.who !== who) continue;
    if (who === 'rival' && fx.rivalId !== rivalId) continue;
    const t = 1 - fx.timer / fx.maxTimer;
    yOffsetPx = Math.max(yOffsetPx, -5 * Math.sin(t * Math.PI));
    const peak = t < 0.35 ? t / 0.35 : Math.max(0, 1 - (t - 0.35) / 0.65);
    flashAlpha = Math.max(flashAlpha, peak * 0.72);
  }

  return { yOffsetPx, flashAlpha };
}

export function triggerPickComplete(
  vfx: VfxState,
  gx: number,
  gy: number,
  who: 'player' | 'rival',
  rivalId?: number,
) {
  const cx = gx * TILE + TILE / 2;
  const cy = gy * TILE + TILE / 2;

  vfx.pickFlashes.push({ gx, gy, timer: 360, who });

  for (let i = 0; i < ORB_COUNT; i++) {
    const palette = PICK_ORB_COLORS[i % PICK_ORB_COLORS.length];
    const ang = Math.random() * Math.PI * 2;
    const spawnR = 3 + Math.random() * 6;
    const sx = cx + Math.cos(ang) * spawnR;
    const sy = cy + Math.sin(ang) * spawnR - 4;
    vfx.pickAbsorbOrbs.push({
      startX: sx,
      startY: sy,
      x: sx,
      y: sy,
      elapsed: 0,
      flyMs: ORB_FLY_MS,
      fadeElapsed: 0,
      phase: 'fly',
      arcLift: 34 + Math.random() * 14,
      sideBias: (Math.random() - 0.5) * 24,
      color: palette.body,
      highlight: palette.highlight,
      size: ORB_SIZE,
      who,
      rivalId,
      trailAcc: 0,
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
      color: [PALETTE.cautionYellow, PALETTE.uiBlue, PALETTE.pixelWhite, '#4db8ff'][i % 4],
      size: 2 + Math.random() * 3,
      gravity: 80,
    });
  }
}

/** Subtle shake on each countdown tick; stronger on GO! */
export function triggerCountdownPulse(vfx: VfxState, strong = false) {
  vfx.shakeDuration = strong ? 320 : 140;
  vfx.shakeMs = vfx.shakeDuration;
  vfx.shakeMag = strong ? 3.8 : 1.35;
}

/** Radial burst at viewport center when race starts (grid-local particle coords). */
export function triggerRaceGoBurst(
  vfx: VfxState,
  centerGridLocalX: number,
  centerGridLocalY: number,
) {
  const burstColors = [PALETTE.safetyOrange, PALETTE.pixelWhite, PALETTE.cautionYellow];
  for (let i = 0; i < 48; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = 90 + Math.random() * 220;
    vfx.particles.push({
      x: centerGridLocalX + (Math.random() - 0.5) * 24,
      y: centerGridLocalY + (Math.random() - 0.5) * 24,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd - 40,
      life: 550 + Math.random() * 650,
      maxLife: 1200,
      color: burstColors[i % burstColors.length],
      size: 2 + Math.random() * 4,
      gravity: 60,
    });
  }
  for (let i = 0; i < 20; i++) {
    const ang = (i / 20) * Math.PI * 2;
    const spd = 140 + Math.random() * 80;
    vfx.particles.push({
      x: centerGridLocalX,
      y: centerGridLocalY,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd,
      life: 400 + Math.random() * 350,
      maxLife: 750,
      color: i % 2 === 0 ? PALETTE.safetyOrange : PALETTE.pixelWhite,
      size: 3 + Math.random() * 2,
      gravity: 0,
    });
  }
}

/** Compute grid-local burst origin at viewport center from camera state. */
export function countdownBurstOrigin(
  cameraX: number,
  cameraY: number,
  scale: number,
  viewW: number,
  viewH: number,
): { x: number; y: number } {
  const decor = gridDecorOffset();
  const centerWorldX = cameraX + viewW / scale / 2;
  const centerWorldY = cameraY + viewH / scale / 2;
  return {
    x: centerWorldX - decor.x,
    y: centerWorldY - decor.y,
  };
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

export function updateVfx(
  vfx: VfxState,
  dtMs: number,
  playing: boolean,
  absorbTargets?: AbsorbTargetLookup,
) {
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

  vfx.harvestFeedbacks = vfx.harvestFeedbacks
    .map((g) => ({ ...g, timer: g.timer - dtMs }))
    .filter((g) => g.timer > 0);

  vfx.orbTrailSparks = vfx.orbTrailSparks
    .map((s) => ({ ...s, life: s.life - dtMs }))
    .filter((s) => s.life > 0);

  const remainingOrbs: PickAbsorbOrb[] = [];
  for (const orb of vfx.pickAbsorbOrbs) {
    const target = resolveAbsorbTargetPx(orb.who, orb.rivalId, absorbTargets);

    if (orb.phase === 'fly') {
      orb.elapsed += dtMs;
      const t = Math.min(1, orb.elapsed / orb.flyMs);

      if (target) {
        const pos = computeArcOrbPosition(orb, target.x, target.y, t);
        orb.x = pos.x;
        orb.y = pos.y;
      }

      orb.trailAcc += dtMs;
      while (orb.trailAcc >= ORB_TRAIL_INTERVAL_MS) {
        orb.trailAcc -= ORB_TRAIL_INTERVAL_MS;
        if (t > 0.04 && t < 0.98) spawnOrbTrailSpark(vfx, orb.x, orb.y);
      }

      if (t >= 1) {
        if (target) {
          orb.x = target.x;
          orb.y = target.y;
          spawnAbsorbFeedback(vfx, target.x, target.y, orb.who, orb.rivalId);
        }
        orb.phase = 'fade';
        orb.fadeElapsed = 0;
      }
      remainingOrbs.push(orb);
      continue;
    }

    orb.fadeElapsed += dtMs;
    if (orb.fadeElapsed < ORB_FADE_MS) {
      remainingOrbs.push(orb);
    }
  }
  vfx.pickAbsorbOrbs = remainingOrbs;

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
    const t = f.timer / 360;
    const ox = f.gx * TILE;
    const oy = f.gy * TILE;
    ctx.fillStyle = `rgba(245, 197, 24, ${0.32 * t})`;
    ctx.fillRect(ox, oy, TILE, TILE);
    ctx.strokeStyle = `rgba(255, 240, 168, ${0.55 * t})`;
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

function drawBookOrb(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  _size: number,
  body: string,
  highlight: string,
  alpha: number,
  scale = 1,
) {
  const cx = Math.round(x);
  const cy = Math.round(y);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);

  // Soft outer glow ring — caution yellow bloom (no shadowBlur)
  const glowLayers: ReadonlyArray<[number, number]> = [
    [15, 0.045],
    [12, 0.075],
    [9, 0.11],
    [7, 0.17],
    [5, 0.26],
  ];
  for (const [pad, a] of glowLayers) {
    ctx.globalAlpha = alpha * a;
    ctx.fillStyle = PALETTE.cautionYellow;
    ctx.fillRect(cx - pad, cy - pad + 1, pad * 2, pad * 2 - 1);
  }
  // Inner warm halo
  ctx.globalAlpha = alpha * 0.14;
  ctx.fillStyle = PALETTE.pixelWhite;
  ctx.fillRect(cx - 4, cy - 3, 8, 7);

  // Sparkle motes (orbiting glints)
  const sparks: ReadonlyArray<[number, number, number]> = [
    [-8, -5, 1],
    [7, -6, 1],
    [-6, 7, 1],
    [8, 5, 1],
    [0, -9, 2],
    [-9, 2, 1],
  ];
  for (const [sx, sy, sz] of sparks) {
    ctx.globalAlpha = alpha * (sz > 1 ? 0.75 : 0.55);
    ctx.fillStyle = sz > 1 ? highlight : PALETTE.pixelWhite;
    ctx.fillRect(cx + sx, cy + sy, sz, sz);
  }

  // --- 14×15px book sprite (3/4 view), centered on cx,cy ---
  const bx = cx - 7;
  const by = cy - 7;
  const W = 14;
  const H = 15;
  const spineW = 4;
  const fx = bx + spineW;
  const fw = W - spineW;

  ctx.globalAlpha = alpha;

  // Drop shadow
  ctx.fillStyle = '#1a1008';
  ctx.fillRect(bx, by + H, W, 1);
  ctx.fillRect(bx + W, by + 2, 1, H - 1);

  // Dark outer outline
  ctx.fillStyle = '#2a1808';
  ctx.fillRect(bx - 1, by, W + 2, H + 1);

  // Spine (left edge depth)
  ctx.fillStyle = '#4a3018';
  ctx.fillRect(bx, by + 1, spineW, H - 2);
  ctx.fillStyle = '#6a4428';
  ctx.fillRect(bx + 1, by + 2, spineW - 1, H - 4);
  ctx.fillStyle = '#8a5838';
  ctx.fillRect(bx + 2, by + 3, spineW - 2, H - 6);

  // Cover — top-to-bottom gold gradient
  ctx.fillStyle = '#fff8b0';
  ctx.fillRect(fx, by + 1, fw, 3);
  ctx.fillStyle = highlight;
  ctx.fillRect(fx, by + 4, fw, 3);
  ctx.fillStyle = body;
  ctx.fillRect(fx, by + 7, fw, 2);
  ctx.fillStyle = '#e89028';
  ctx.fillRect(fx, by + 9, fw, 2);
  ctx.fillStyle = '#b86818';
  ctx.fillRect(fx, by + 11, fw, 2);

  // Cover title bands
  ctx.fillStyle = '#fffce8';
  ctx.fillRect(fx + 1, by + 5, fw - 3, 1);
  ctx.fillRect(fx + 2, by + 8, fw - 4, 1);

  // Page block (bottom fore-edge)
  ctx.fillStyle = '#f2ece0';
  ctx.fillRect(fx, by + H - 3, fw, 3);
  ctx.fillStyle = '#ddd4c4';
  ctx.fillRect(fx + 1, by + H - 2, fw - 2, 1);
  ctx.fillRect(fx + 1, by + H - 1, fw - 2, 1);

  // Right-side thickness (3/4 perspective)
  ctx.fillStyle = '#c87828';
  ctx.fillRect(bx + W - 2, by + 3, 2, H - 7);
  ctx.fillStyle = '#a06018';
  ctx.fillRect(bx + W - 1, by + 4, 1, H - 9);

  // Cream pixel outline
  ctx.fillStyle = '#fffef5';
  ctx.fillRect(fx, by, fw, 1);
  ctx.fillRect(fx + fw - 1, by + 1, 1, H - 4);
  ctx.fillRect(fx, by + 1, 1, 1);
  ctx.fillRect(bx + spineW - 1, by + 1, 1, 1);

  // Cover gloss (upper-right catch light)
  ctx.globalAlpha = alpha * 0.7;
  ctx.fillStyle = PALETTE.pixelWhite;
  ctx.fillRect(fx + fw - 3, by + 2, 1, 2);

  ctx.restore();
}

/** Draw homing pick orbs and character absorb glow (call after entities). */
export function drawPickAbsorbVfx(
  ctx: CanvasRenderingContext2D,
  vfx: VfxState,
  playerVisual: { x: number; y: number },
  rivalVisuals: Record<number, { x: number; y: number }>,
  cull?: import('./camera').CullBounds,
) {
  const decor = gridDecorOffset();
  const timeSec = performance.now() / 1000;

  for (const spark of vfx.orbTrailSparks) {
    if (cull) {
      const wx = spark.x + decor.x;
      const wy = spark.y + decor.y;
      if (wx >= cull.maxX || wx + spark.size <= cull.minX || wy >= cull.maxY || wy + spark.size <= cull.minY) {
        continue;
      }
    }
    const lifeT = spark.life / spark.maxLife;
    const twinkle = 0.45 + 0.55 * Math.abs(Math.sin(timeSec * 9 + spark.twinkle));
    ctx.globalAlpha = lifeT * twinkle * 0.85;
    ctx.fillStyle = lifeT > 0.5 ? PALETTE.pixelWhite : PALETTE.cautionYellow;
    const s = spark.size;
    ctx.fillRect(Math.round(spark.x - s / 2), Math.round(spark.y - s / 2), Math.ceil(s), Math.ceil(s));
  }
  ctx.globalAlpha = 1;

  for (const orb of vfx.pickAbsorbOrbs) {
    if (cull) {
      const wx = orb.x + decor.x;
      const wy = orb.y + decor.y;
      if (wx >= cull.maxX || wx + orb.size <= cull.minX || wy >= cull.maxY || wy + orb.size <= cull.minY) {
        continue;
      }
    }

    let alpha = 1;
    let scale = 1;
    if (orb.phase === 'fly') {
      const t = Math.min(1, orb.elapsed / orb.flyMs);
      scale = 1 + easeInOutSine(t) * 0.32;
    } else {
      alpha = Math.max(0, 1 - orb.fadeElapsed / ORB_FADE_MS);
      scale = 1.38;
    }

    drawBookOrb(ctx, orb.x, orb.y, orb.size, orb.color, orb.highlight, alpha, scale);
  }

  for (const fx of vfx.harvestFeedbacks) {
    const grid =
      fx.who === 'player'
        ? playerVisual
        : fx.rivalId != null
          ? rivalVisuals[fx.rivalId]
          : null;
    if (!grid) continue;

    const { flashAlpha } = getHarvestCharacterFx(vfx, fx.who, fx.rivalId);
    if (flashAlpha <= 0.02) continue;

    const cx = grid.x * TILE + TILE / 2;
    const cy = grid.y * TILE + TILE / 2 - 4;
    if (cull) {
      const wx = cx + decor.x;
      const wy = cy + decor.y;
      if (wx >= cull.maxX || wx <= cull.minX || wy >= cull.maxY || wy <= cull.minY) continue;
    }

    ctx.save();
    ctx.globalAlpha = flashAlpha;
    ctx.fillStyle = PALETTE.pixelWhite;
    ctx.fillRect(Math.round(cx - TILE * 0.34), Math.round(cy - TILE * 0.38), Math.round(TILE * 0.68), Math.round(TILE * 0.72));
    ctx.globalAlpha = flashAlpha * 0.45;
    ctx.fillStyle = PALETTE.cautionYellow;
    ctx.fillRect(Math.round(cx - TILE * 0.28), Math.round(cy - TILE * 0.32), Math.round(TILE * 0.56), Math.round(TILE * 0.6));
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
