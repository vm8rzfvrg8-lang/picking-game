import { TILE } from './grid';

/** 電波狂乱の円形範囲半径（タイル単位）。 */
export const JAM_LIGHTNING_RADIUS_TILES = 7;

/** 展開演出の稲妻本数（従来比 −20%）。 */
export const JAM_LIGHTNING_BOLT_COUNT_MAIN = 29;
/** 発動バーストの稲妻本数（従来比 −20%）。 */
export const JAM_LIGHTNING_BOLT_COUNT_BURST = 26;
/** デフォルト生成本数。 */
export const JAM_LIGHTNING_BOLT_COUNT_DEFAULT = 18;

export interface JamLightningBolt {
  points: { x: number; y: number }[];
  /** 0 = blue-dominant, 1 = yellow-dominant */
  tone: number;
  width: number;
  branch?: { points: { x: number; y: number }[]; tone: number; width: number };
}

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function buildZigZagBolt(
  cx: number,
  cy: number,
  angle: number,
  length: number,
  rand: () => number,
  segments: number,
): { x: number; y: number }[] {
  const points: { x: number; y: number }[] = [{ x: cx, y: cy }];
  const perp = angle + Math.PI / 2;
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const dist = length * t;
    const jagMag = 10 + rand() * 18;
    const jag = (rand() > 0.5 ? 1 : -1) * jagMag * (1 - t * 0.25);
    points.push({
      x: cx + Math.cos(angle) * dist + Math.cos(perp) * jag,
      y: cy + Math.sin(angle) * dist + Math.sin(perp) * jag,
    });
  }
  return points;
}

function buildBranch(
  from: { x: number; y: number },
  baseAngle: number,
  length: number,
  rand: () => number,
): { x: number; y: number }[] {
  const branchAngle = baseAngle + (rand() - 0.5) * 1.4;
  return buildZigZagBolt(from.x, from.y, branchAngle, length, rand, 2 + Math.floor(rand() * 2));
}

/** Generate radiating lightning bolts for 電波狂乱 (no dome — bolts only). */
export function generateJamLightningBolts(
  cx: number,
  cy: number,
  radiusTiles: number,
  seed: number,
  count = JAM_LIGHTNING_BOLT_COUNT_DEFAULT,
): JamLightningBolt[] {
  const rand = seeded(seed);
  const maxLen = radiusTiles * TILE * (0.82 + rand() * 0.12);
  const bolts: JamLightningBolt[] = [];

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (rand() - 0.5) * 0.55;
    const len = maxLen * (0.65 + rand() * 0.35);
    const segments = 4 + Math.floor(rand() * 4);
    const points = buildZigZagBolt(cx, cy, angle, len, rand, segments);
    const tone = rand();
    const width = 1.8 + rand() * 1.6;

    let branch: JamLightningBolt['branch'];
    if (rand() > 0.45 && points.length >= 3) {
      const forkIdx = 1 + Math.floor(rand() * (points.length - 2));
      const forkFrom = points[forkIdx];
      const branchPts = buildBranch(forkFrom, angle, len * (0.25 + rand() * 0.2), rand);
      branch = {
        points: branchPts,
        tone: rand(),
        width: width * 0.65,
      };
    }

    bolts.push({ points, tone, width, branch });
  }

  return bolts;
}

function strokeBoltPath(
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  tone: number,
  width: number,
  alpha: number,
) {
  if (points.length < 2 || alpha <= 0) return;

  const blue = tone < 0.55;
  const outline = blue ? `rgba(20, 40, 140, ${alpha * 0.85})` : `rgba(140, 90, 10, ${alpha * 0.8})`;
  const core = blue ? `rgba(80, 200, 255, ${alpha})` : `rgba(255, 230, 80, ${alpha})`;
  const hot = blue ? `rgba(200, 245, 255, ${alpha * 0.95})` : `rgba(255, 255, 200, ${alpha})`;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.strokeStyle = outline;
  ctx.lineWidth = width + 2.5;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();

  ctx.strokeStyle = core;
  ctx.lineWidth = width + 0.5;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();

  ctx.strokeStyle = hot;
  ctx.lineWidth = Math.max(1, width * 0.45);
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
}

/** 円形リング・円弧（ドーム塗りつぶしなし）。 */
export function drawJamLightningRings(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radiusPx: number,
  alpha: number,
  flicker = 0,
) {
  if (alpha <= 0) return;

  const pulse = 0.82 + 0.18 * Math.sin(flicker * Math.PI * 8);
  const a = alpha * pulse;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  ctx.strokeStyle = `rgba(80, 180, 255, ${a * 0.6})`;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = `rgba(255, 240, 80, ${a * 0.72})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, radiusPx * 0.74, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = `rgba(120, 220, 255, ${a * 0.45})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, radiusPx * 0.48, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = `rgba(255, 230, 100, ${a * 0.8})`;
  ctx.lineWidth = 3;
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2 + flicker * 0.9;
    ctx.beginPath();
    ctx.arc(cx, cy, radiusPx * (0.86 + (i % 3) * 0.05), ang, ang + Math.PI * 0.38);
    ctx.stroke();
  }

  ctx.restore();
}

/** リング＋稲妻をまとめて描画。 */
export function drawJamLightningEffect(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radiusTiles: number,
  bolts: JamLightningBolt[],
  alpha: number,
  flicker = 0,
) {
  drawJamLightningRings(ctx, cx, cy, radiusTiles * TILE, alpha, flicker);
  drawJamLightningBolts(ctx, bolts, alpha, flicker);
}

/** Draw pre-generated bolts — lightning only, no dome fill. */
export function drawJamLightningBolts(
  ctx: CanvasRenderingContext2D,
  bolts: JamLightningBolt[],
  alpha: number,
  flicker = 0,
) {
  if (alpha <= 0 || bolts.length === 0) return;

  const pulse = 0.75 + 0.25 * Math.sin(flicker * Math.PI * 10);
  const a = alpha * pulse;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (const bolt of bolts) {
    strokeBoltPath(ctx, bolt.points, bolt.tone, bolt.width, a);
    if (bolt.branch) {
      strokeBoltPath(ctx, bolt.branch.points, bolt.branch.tone, bolt.branch.width, a * 0.85);
    }
  }

  ctx.restore();
}

/** One-shot burst at skill activation (same bolt style, radius-7 reach). */
export function drawJamLightningBurst(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  progress: number,
  blink: number,
  seed = 42,
) {
  const alpha = (1 - progress * 0.85) * (0.9 + 0.1 * Math.sin(blink * Math.PI * 6));
  if (alpha <= 0.02) return;

  const bolts = generateJamLightningBolts(
    cx,
    cy,
    JAM_LIGHTNING_RADIUS_TILES,
    seed + Math.floor(progress * 100),
    JAM_LIGHTNING_BOLT_COUNT_BURST,
  );
  drawJamLightningEffect(ctx, cx, cy, JAM_LIGHTNING_RADIUS_TILES, bolts, alpha, blink + progress * 4);
}
