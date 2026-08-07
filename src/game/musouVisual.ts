import { TILE, type Direction, type Facing } from './constants';
import { gridWorldX, gridWorldY } from './camera';

const DIR_DELTA: Record<Direction, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

export const MUSOU_TRAIL_MAX = 8;
/** ~2 frames at 60fps */
export const MUSOU_TRAIL_CAPTURE_MS = 34;
/** Teleport / stale-sample guard (world pixels). */
export const MUSOU_TRAIL_WARP_PX = 100;

const SHOCKWAVE_R0 = 5;
const SHOCKWAVE_MAX_R = 50;
const SHOCKWAVE_GROWTH_PER_FRAME = 1.2;
const SHOCKWAVE_ALPHA_DECAY_PER_FRAME = 0.1;
/** Arrival shockwave expands to exactly 2 tile radius. */
const ARRIVAL_SHOCKWAVE_MAX_R = TILE * 2;
const ARRIVAL_SHOCKWAVE_GROWTH = 1.35;
const ARRIVAL_SHOCKWAVE_ALPHA_DECAY = 0.14;
/** Center flash: ~3 frames @ 60fps. */
const ARRIVAL_FLASH_MS = 50;
/** Full arrival burst duration. */
const ARRIVAL_BURST_MS = 580;
const ARRIVAL_RING_COUNT = 3;
const ARRIVAL_PARTICLE_MIN = 15;
const ARRIVAL_PARTICLE_MAX = 20;
const REF_FRAME_MS = 1000 / 60;

export interface TrailHistoryEntry {
  /** World-space pixel center (includes decor padding). */
  wx: number;
  wy: number;
}

export interface TrailGridSnapshot {
  gx: number;
  gy: number;
}

export interface MusouTrailDrawOffset {
  decorX: number;
  decorY: number;
}

export interface MusouShockwaveFx {
  x: number;
  y: number;
  r: number;
  maxR: number;
  alpha: number;
  /** Faster pop for musou arrival (1 tile radius). */
  arrival?: boolean;
}

export interface MusouArrivalParticle {
  angle: number;
  /** Outward speed multiplier (tile-units per second). */
  speed: number;
  size: number;
  /** true = yellow tint, false = cyan. */
  warm: boolean;
}

export interface MusouArrivalFx {
  gx: number;
  gy: number;
  timer: number;
  maxTimer: number;
  particles: MusouArrivalParticle[];
}

export interface MusouTrailState {
  trailHistory: TrailHistoryEntry[];
  trailCaptureAcc: number;
  shockwaves: MusouShockwaveFx[];
  arrival: MusouArrivalFx | null;
  wasCapturing: boolean;
  lastSampleWx: number | null;
  lastSampleWy: number | null;
}

export function createMusouTrailState(): MusouTrailState {
  return {
    trailHistory: [],
    trailCaptureAcc: 0,
    shockwaves: [],
    arrival: null,
    wasCapturing: false,
    lastSampleWx: null,
    lastSampleWy: null,
  };
}

/** Ensure trail/shockwave buffers exist (handles hot-reload or legacy VfxState). */
export function ensureMusouTrailState(state: MusouTrailState | null | undefined): MusouTrailState {
  if (!state) return createMusouTrailState();

  const legacy = state as MusouTrailState & {
    afterimages?: { x: number; y: number }[];
    hitRings?: MusouShockwaveFx[];
    afterimageAcc?: number;
  };

  if (!Array.isArray(state.trailHistory)) {
    state.trailHistory =
      legacy.afterimages?.map((e) => {
        if ('wx' in e && 'wy' in e) return { wx: (e as TrailHistoryEntry).wx, wy: (e as TrailHistoryEntry).wy };
        const leg = e as { x: number; y: number };
        return gridToWorldCenter(leg.x, leg.y);
      }) ?? [];
  }
  if (!Array.isArray(state.shockwaves)) {
    state.shockwaves = [];
  }
  if (typeof state.trailCaptureAcc !== 'number') {
    state.trailCaptureAcc = legacy.afterimageAcc ?? 0;
  }
  if (state.arrival === undefined) state.arrival = null;
  if (typeof state.wasCapturing !== 'boolean') state.wasCapturing = false;
  if (state.lastSampleWx === undefined) state.lastSampleWx = null;
  if (state.lastSampleWy === undefined) state.lastSampleWy = null;

  return state;
}

export function gridToWorldCenter(gx: number, gy: number): TrailHistoryEntry {
  return {
    wx: gridWorldX(gx) + TILE / 2,
    wy: gridWorldY(gy) + TILE / 2,
  };
}

/** Clear afterimage trail only (keeps shockwaves / arrival FX). */
export function clearMusouTrailHistory(state: MusouTrailState | null | undefined) {
  const trail = ensureMusouTrailState(state);
  trail.trailHistory = [];
  trail.trailCaptureAcc = 0;
  trail.lastSampleWx = null;
  trail.lastSampleWy = null;
}

export function resetMusouTrailState(state: MusouTrailState | null | undefined) {
  const trail = ensureMusouTrailState(state);
  trail.trailHistory = [];
  trail.trailCaptureAcc = 0;
  trail.shockwaves = [];
  trail.arrival = null;
  trail.wasCapturing = false;
  trail.lastSampleWx = null;
  trail.lastSampleWy = null;
}

function worldDistSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function shouldClearTrailForWarp(trail: MusouTrailState, wx: number, wy: number): boolean {
  const limit = MUSOU_TRAIL_WARP_PX * MUSOU_TRAIL_WARP_PX;
  if (trail.lastSampleWx != null && trail.lastSampleWy != null) {
    if (worldDistSq(wx, wy, trail.lastSampleWx, trail.lastSampleWy) > limit) return true;
  }
  if (trail.trailHistory.length > 0) {
    const last = trail.trailHistory[trail.trailHistory.length - 1];
    if (worldDistSq(wx, wy, last.wx, last.wy) > limit) return true;
  }
  return false;
}

function frameScale(dtMs: number): number {
  return dtMs / REF_FRAME_MS;
}

function tickShockwaves(trail: MusouTrailState, dtMs: number) {
  const scale = frameScale(dtMs);
  trail.shockwaves = trail.shockwaves.filter((sw) => {
    const growth = sw.arrival ? ARRIVAL_SHOCKWAVE_GROWTH : SHOCKWAVE_GROWTH_PER_FRAME;
    const decay = sw.arrival ? ARRIVAL_SHOCKWAVE_ALPHA_DECAY : SHOCKWAVE_ALPHA_DECAY_PER_FRAME;
    sw.r = Math.min(sw.maxR, sw.r * Math.pow(growth, scale));
    sw.alpha -= decay * scale;
    return sw.alpha > 0;
  });
}

export function tickMusouTrail(
  state: MusouTrailState | null | undefined,
  dtMs: number,
  capturing: boolean,
  snapshot: TrailGridSnapshot | null,
): MusouTrailState {
  const trail = ensureMusouTrailState(state);

  tickShockwaves(trail, dtMs);

  if (trail.arrival) {
    trail.arrival.timer -= dtMs;
    if (trail.arrival.timer <= 0) trail.arrival = null;
  }

  if (capturing && !trail.wasCapturing) {
    clearMusouTrailHistory(trail);
  }

  if (!capturing) {
    trail.trailCaptureAcc = 0;
    if (trail.wasCapturing) {
      clearMusouTrailHistory(trail);
    }
    trail.wasCapturing = false;
    return trail;
  }

  trail.wasCapturing = true;

  if (!snapshot) return trail;

  const { wx, wy } = gridToWorldCenter(snapshot.gx, snapshot.gy);

  if (shouldClearTrailForWarp(trail, wx, wy)) {
    clearMusouTrailHistory(trail);
  }
  trail.lastSampleWx = wx;
  trail.lastSampleWy = wy;

  trail.trailCaptureAcc += dtMs;
  if (trail.trailCaptureAcc < MUSOU_TRAIL_CAPTURE_MS) return trail;
  trail.trailCaptureAcc = 0;

  trail.trailHistory.push({ wx, wy });
  if (trail.trailHistory.length > MUSOU_TRAIL_MAX) {
    trail.trailHistory.shift();
  }

  return trail;
}

export function triggerMusouHitRing(state: MusouTrailState | null | undefined, gx: number, gy: number) {
  const trail = ensureMusouTrailState(state);
  trail.shockwaves.push({
    x: gx * TILE + TILE / 2,
    y: gy * TILE + TILE / 2,
    r: SHOCKWAVE_R0,
    maxR: SHOCKWAVE_MAX_R,
    alpha: 1,
  });
  if (trail.shockwaves.length > 8) trail.shockwaves.shift();
}

export function triggerMusouArrivalShockwave(state: MusouTrailState | null | undefined, gx: number, gy: number) {
  const trail = ensureMusouTrailState(state);
  const particles: MusouArrivalParticle[] = [];
  const count =
    ARRIVAL_PARTICLE_MIN +
    Math.floor(Math.random() * (ARRIVAL_PARTICLE_MAX - ARRIVAL_PARTICLE_MIN + 1));
  for (let i = 0; i < count; i++) {
    particles.push({
      angle: Math.random() * Math.PI * 2,
      speed: 2.2 + Math.random() * 3.8,
      size: 2.5 + Math.random() * 4.5,
      warm: Math.random() < 0.38,
    });
  }
  trail.arrival = {
    gx,
    gy,
    timer: ARRIVAL_BURST_MS,
    maxTimer: ARRIVAL_BURST_MS,
    particles,
  };
}

/** @deprecated Use triggerMusouArrivalShockwave — kept for legacy call sites. */
export function triggerMusouArrivalBurst(state: MusouTrailState | null | undefined, gx: number, gy: number) {
  triggerMusouArrivalShockwave(state, gx, gy);
}

function drawCyanSilhouetteAt(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  const bx = Math.round(cx - 9);
  const by = Math.round(cy - 9);
  ctx.fillStyle = '#00ffff';
  ctx.fillRect(bx, by + 2, 18, 14);
  ctx.fillRect(Math.round(cx - 7), Math.round(cy - 10), 14, 5);
  ctx.fillRect(Math.round(cx - 6), Math.round(cy + 6), 4, 5);
  ctx.fillRect(Math.round(cx + 2), Math.round(cy + 6), 4, 5);
}

/** Neon cyan afterimage trail — draw before the live player (decor-local coords). */
export function drawMusouAfterimages(
  ctx: CanvasRenderingContext2D,
  state: MusouTrailState | null | undefined,
  offset: MusouTrailDrawOffset,
) {
  const trail = ensureMusouTrailState(state);
  const history = trail.trailHistory;
  if (history.length === 0) return;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (let i = 0; i < history.length; i++) {
    const entry = history[i];
    const count = history.length;
    const alpha = count <= 1 ? 0.4 : 0.05 + (i / (count - 1)) * 0.35;
    if (alpha <= 0.01) continue;

    const cx = entry.wx - offset.decorX;
    const cy = entry.wy - offset.decorY;

    ctx.shadowBlur = 10;
    ctx.shadowColor = 'cyan';
    ctx.globalAlpha = alpha;
    drawCyanSilhouetteAt(ctx, cx, cy);
  }

  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

function facingToTrailDir(facing: Facing, moveDir: Direction | null): Direction {
  if (moveDir) return moveDir;
  switch (facing) {
    case 'up':
      return 'up';
    case 'down':
      return 'down';
    case 'left':
      return 'left';
    case 'right':
      return 'right';
  }
}

function oppositeDir(dir: Direction): Direction {
  switch (dir) {
    case 'up':
      return 'down';
    case 'down':
      return 'up';
    case 'left':
      return 'right';
    case 'right':
      return 'left';
  }
}

/** Flowing speed lines + foot pulse while musou is active. */
export function drawMusouDashAura(
  ctx: CanvasRenderingContext2D,
  gridX: number,
  gridY: number,
  facing: Facing,
  blink: number,
  moveDir: Direction | null,
) {
  const cx = gridX * TILE + TILE / 2;
  const cy = gridY * TILE + TILE / 2;
  const pulse = 0.55 + 0.45 * Math.sin(blink * Math.PI * 7);
  const trailDir = oppositeDir(facingToTrailDir(facing, moveDir));
  const back = DIR_DELTA[trailDir];

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const footY = cy + 10;
  ctx.strokeStyle = `rgba(0, 255, 255, ${0.4 * pulse})`;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(cx, footY, 14 + pulse * 4, 5 + pulse * 2, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = `rgba(0, 220, 255, ${0.25 * pulse})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(cx, footY, 9 + pulse * 2, 3 + pulse, 0, 0, Math.PI * 2);
  ctx.stroke();

  const scroll = (blink * 90) % 14;
  for (let i = 0; i < 5; i++) {
    const dist = 10 + i * 11 + scroll;
    const spread = (i - 2) * 4;
    const lx = cx + back.dx * dist + (back.dy !== 0 ? spread : 0);
    const ly = cy + back.dy * dist + (back.dx !== 0 ? spread : 0);
    const len = 16 - i * 2;
    const w = 3 - i * 0.35;
    const a = (0.45 - i * 0.06) * pulse;
    const nx = lx + back.dx * len;
    const ny = ly + back.dy * len;

    ctx.strokeStyle = `rgba(0, 255, 255, ${a})`;
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(nx, ny);
    ctx.stroke();
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

/** Expanding cyan ring shockwaves on musou hit. */
export function drawMusouHitRings(ctx: CanvasRenderingContext2D, state: MusouTrailState | null | undefined) {
  const trail = ensureMusouTrailState(state);
  if (trail.shockwaves.length === 0) return;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (const sw of trail.shockwaves) {
    if (sw.alpha <= 0) continue;
    ctx.strokeStyle = `rgba(0, 255, 255, ${sw.alpha})`;
    ctx.lineWidth = sw.arrival ? 5 : 4;
    ctx.beginPath();
    ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
    ctx.stroke();
    if (sw.arrival && sw.alpha > 0.35) {
      ctx.strokeStyle = `rgba(180, 255, 255, ${sw.alpha * 0.45})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.r * 0.72, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

export function drawMusouArrivalBurst(ctx: CanvasRenderingContext2D, arrival: MusouArrivalFx) {
  const elapsed = arrival.maxTimer - arrival.timer;
  const t = elapsed / arrival.maxTimer;
  const cx = arrival.gx * TILE + TILE / 2;
  const cy = arrival.gy * TILE + TILE / 2;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // B. Center flash — quick cyan-white burst (~1–3 frames)
  const flashT = Math.min(1, elapsed / ARRIVAL_FLASH_MS);
  if (flashT < 1) {
    const flashEase = 1 - flashT * flashT;
    const flashR = TILE * (1 + (1 - flashT) * 0.5);
    const coreA = flashEase * 0.95;
    const rimA = flashEase * 0.55;

    ctx.fillStyle = `rgba(220, 255, 255, ${coreA})`;
    ctx.beginPath();
    ctx.arc(cx, cy, flashR * 0.55, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(0, 255, 255, ${rimA})`;
    ctx.beginPath();
    ctx.arc(cx, cy, flashR, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(255, 255, 255, ${coreA * 0.7})`;
    ctx.beginPath();
    ctx.arc(cx, cy, flashR * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }

  // A. Multi-layer shockwave rings — staggered, max 2 tiles
  for (let ring = 0; ring < ARRIVAL_RING_COUNT; ring++) {
    const delay = ring * 0.09;
    const ringT = Math.max(0, t - delay);
    if (ringT <= 0) continue;

    const expand = Math.min(1, ringT / 0.52);
    const ease = 1 - Math.pow(1 - expand, 2.2);
    const r = 5 + (ARRIVAL_SHOCKWAVE_MAX_R - 5) * ease;
    const fade = (1 - expand) * (0.9 - ring * 0.18);
    if (fade <= 0.01) continue;

    const colors = [
      `rgba(0, 255, 255, ${fade})`,
      `rgba(0, 190, 255, ${fade * 0.85})`,
      `rgba(60, 140, 255, ${fade * 0.7})`,
    ];
    ctx.strokeStyle = colors[ring] ?? colors[2];
    ctx.lineWidth = 6 - ring * 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    if (ring === 0 && fade > 0.4) {
      ctx.strokeStyle = `rgba(180, 255, 255, ${fade * 0.35})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.78, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // C. Radial particle burst — shrink + fade outward
  const particleFade = t > 0.7 ? (1 - t) / 0.3 : 1;
  for (const p of arrival.particles ?? []) {
    const dist = p.speed * TILE * t * 2.1;
    const px = cx + Math.cos(p.angle) * dist;
    const py = cy + Math.sin(p.angle) * dist;
    const size = Math.max(0.5, p.size * (1 - t * 0.88));
    const alpha = (1 - t * 0.92) * particleFade;
    if (alpha <= 0.02 || size <= 0.5) continue;

    if (p.warm) {
      ctx.fillStyle = `rgba(255, 230, 90, ${alpha})`;
    } else {
      ctx.fillStyle = `rgba(0, 255, 255, ${alpha})`;
    }
    ctx.beginPath();
    ctx.arc(px, py, size, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.45})`;
    ctx.beginPath();
    ctx.arc(px, py, size * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}
