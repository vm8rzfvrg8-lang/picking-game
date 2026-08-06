// Tile types on the grid
export type Tile =
  | 'F' // Floor (walkable aisle)
  | 'W' // Outer wall
  | 'S' // Bookshelf (solid, pickable target when active)
  | 'G'; // Goal zone (shutter, right edge)

export type Facing = 'up' | 'down' | 'left' | 'right';
export type Direction = Facing;

import type { KnockbackState } from './knockback';

export type TrapKind = 'bananaPeel';

export interface TrapEntity {
  id: number;
  kind: TrapKind;
  x: number;
  y: number;
  /** False once stepped on (no re-trigger); may still fade out visually. */
  active: boolean;
  /** Ms remaining for post-step fade/slide; 0 = idle or fully gone. */
  fadeMs: number;
  /** Normalized slide direction when fade started. */
  fadeDirX: number;
  fadeDirY: number;
  /** Visual slide offset in pixels during fade. */
  fadeSlideX: number;
  fadeSlideY: number;
}

export interface PlayerEntity {
  x: number;
  y: number;
  facing: Facing;
  spawn: { x: number; y: number };
  stun: number; // >0 = frozen (ms remaining)
  lastMoveDir: Direction | null;
  /** Generic knockback motion (traps, gimmicks, items). */
  knockback: KnockbackState | null;
  /** Immunity to random knockback while > 0 (ms). */
  knockbackImmuneMs: number;
  /** Hide pick-point guide while > 0 (ms) — 電波狂乱. */
  jamGuideHiddenMs: number;
}

export interface RivalEntity {
  id: number;
  x: number;
  y: number;
  facing: Facing;
  spawn: { x: number; y: number };
  moveTimer: number; // ms accumulator for step cadence
  stun: number; // >0 = frozen (ms remaining)
  targets: PickTarget[]; // rival's own pick list
  currentTarget: number; // index into targets[]
  pickProgress: number; // 0..1
  isPicking: boolean;
  reachedGoal: boolean;
  lastMoveDir: Direction | null;
  allowWrongWay: boolean; // CPU shortcut mode
  pickWaitTimer: number; // ms until pick starts (easy delay)
  /** True while stunned by 妨害電波 (Wi-Fi icon). */
  jamStun: boolean;
  /** Ms without meaningful movement while pathing (stack detect). */
  stuckMs: number;
  stuckAnchorX: number;
  stuckAnchorY: number;
  /** Remaining forced sidestep moves to break deadlocks. */
  unstickMovesLeft: number;
  /** Per-CPU route dispersion seed in [0, 1). */
  routeSeed: number;
  /** Ms blocked while pushing the same entity. */
  pushStuckMs: number;
  /** Index of blocking rival, or -1 for player. */
  pushBlockerIndex: number | null;
  /** Elapsed time when entering current 1-wide corridor (-1 if none). */
  narrowCorridorSince: number;
  /** Generic knockback motion (traps, gimmicks, items). */
  knockback: KnockbackState | null;
  /** Immunity to random knockback while > 0 (ms). */
  knockbackImmuneMs: number;
  /** Hide pick-point guide while > 0 (ms) — 電波狂乱. */
  jamGuideHiddenMs: number;
}

// A pick target: a bookshelf cell with location number and pick order
export interface PickTarget {
  index: number; // 0-based pick sequence
  locationNumber: number; // 1-based warehouse shelf location
  x: number;
  y: number;
  done: boolean;
}

/** World map width in tiles (horizontal warehouse repeat). */
export { GRID_W, GRID_H, VIEWPORT_W, VIEWPORT_H, TILE } from './grid';

export const MIN_CPU_COUNT = 1;
export const MAX_CPU_COUNT = 7;
export const DEFAULT_CPU_COUNT = 7;

export const PICK_COUNT = 30;
/** Configurable pick-goal options on the start screen (also max). */
export const PICK_COUNT_OPTIONS = [5, 10, 15, 20, 25, 30] as const;
export const DEFAULT_PICK_COUNT = 10;

export function clampPickCount(count: number): number {
  const n = Math.round(count);
  if (PICK_COUNT_OPTIONS.includes(n as (typeof PICK_COUNT_OPTIONS)[number])) return n;
  return DEFAULT_PICK_COUNT;
}
export const PICK_DURATION_MS = 2000; // 2-second pick countdown

/** Decorative break-room columns drawn left of the warehouse (10 tiles = bg illustration). */
export const LEFT_DECOR_COLS = 10;
/** Decorative header row above the warehouse (1 tile = top banner illustration). */
export const TOP_DECOR_ROWS = 1;
export const RIVAL_STEP_MS = 580; // rival moves one cell every this many ms
/** CPU stack detection: no progress for this long triggers sidestep. */
export const RIVAL_STUCK_DETECT_MS = 460;
/** Sidestep moves executed when unsticking. */
export const RIVAL_UNSTICK_MOVE_COUNT = 2;
/** Push deadlock: yield after this long unable to advance past a blocker. */
export const RIVAL_PUSH_STUCK_MS = 200;
export const PLAYER_COOLDOWN_MS = 130; // player move cooldown
export const COLLISION_STUN_MS = 1500; // legacy fallback
export const COLLISION_STUN_LOSER_MS = 800;
export const COLLISION_STUN_WINNER_MS = 300;
export const YIELD_COLLISION_WINDOW_MS = 3000;
export const YIELD_COLLISION_COUNT = 2;
/** Set false to disable yield timeout while tuning collision rules. */
export const YIELD_TIMEOUT_ENABLED = false;
export const RIVAL_WRONG_WAY_DISTANCE = 4;
export const RIVAL_WRONG_WAY_CHANCE = 0.12;
export const WRONG_WAY_PATH_PENALTY = 12;
export const WRONG_WAY_PATH_PENALTY_SHORT = 6;
export const RIVAL_PICK_DURATION_MS = 3500; // rival picks slightly slower

/** Per-frame cap for hot-path loops (AI, collision, BFS) to avoid runaway iteration. */
export const MAX_LOOP_ITERATIONS_PER_FRAME = 10;

import type { Difficulty } from './difficulty';
import type { SkillState, SkillType } from './skills';
import { PALETTE, paletteAlpha } from './palette';

export { PALETTE } from './palette';

export type { Difficulty } from './difficulty';
export type { SkillState, SkillType } from './skills';
export { SkillType } from './skills';

export type Phase = 'start' | 'tutorial' | 'playing' | 'won' | 'lost';

/** CPU body colors (index 0–6) — anchored to shared palette. */
export const RIVAL_PALETTE = [
  { body: PALETTE.safetyOrange, light: '#ffb040', dark: '#a86000', outline: '#5a3800', stun: '#7a5a3a' },
  { body: '#ff5a8a', light: '#ff8cb0', dark: '#a83058', outline: PALETTE.pixelBlack, stun: '#7a4a58' },
  { body: PALETTE.glowGreen, light: '#4dff8a', dark: '#00a848', outline: PALETTE.pixelBlack, stun: '#4a7a58' },
  { body: '#8a5aff', light: '#b08aff', dark: '#5820a8', outline: PALETTE.pixelBlack, stun: '#5a4a7a' },
  { body: PALETTE.cautionYellow, light: '#ffe060', dark: '#a88010', outline: '#5a500a', stun: '#7a755a' },
  { body: PALETTE.uiBlue, light: '#4db8ff', dark: '#0070cc', outline: PALETTE.pixelBlack, stun: '#4a687a' },
  { body: PALETTE.glowRed, light: '#ff6080', dark: '#a81838', outline: PALETTE.pixelBlack, stun: '#7a584a' },
] as const;

export interface GameState {
  grid: Tile[][];
  player: PlayerEntity;
  rivals: RivalEntity[];
  /** Selected CPU count (1–7) for the current session. */
  cpuCount: number;
  /** Pick targets required to unlock the goal (5–30). */
  pickCount: number;
  targets: PickTarget[]; // player's ordered pick list
  currentTarget: number; // index into targets[] of the next to pick
  /** 1-based shelf location numbers keyed as "x,y". */
  shelfLocations: Record<string, number>;
  pickProgress: number; // 0..1 gauge fill while picking
  isPicking: boolean;
  goals: { x: number; y: number }[];
  phase: Phase;
  elapsed: number; // ms since play start
  version: number;
  collisionFx: number; // >0 = collision animation timer (ms)
  collisionPos: { x: number; y: number } | null;
  collisionPairCount: number;
  lastCollisionElapsed: number;
  yieldFx: 'player' | 'rival' | null;
  yieldFxTimer: number;
  difficulty: Difficulty;
  seed: number;
  /** Tutorial: CPU movement/collision enabled (steps 4–5). */
  tutorialRivalActive: boolean;
  /** Tutorial: CPU moves against lane flow (step 5). */
  tutorialRivalWrongWay: boolean;
  /** Tutorial step 5 active sub-step (0 = not in skill step). */
  tutorialSubStep: 0 | 1 | 2 | 3;
  /** Step 5-2: cell the player must reach. */
  tutorialReachCell: { x: number; y: number } | null;
  /** Step 5-2: CPU stays put as a blocker. */
  tutorialRivalBlock: boolean;
  /** Step 5-3: CPU is mid-pick for jam practice. */
  tutorialRivalForcePick: boolean;
  /** Tutorial: only this skill may be used (step 5). */
  tutorialLockedSkill: SkillType | null;
  selectedSkill: SkillType;
  skills: SkillState;
  /** Per-CPU skill gauge/effects (for ゴリ押し etc.). */
  rivalSkills: SkillState[];
  /** Consecutive pick combo count (display); speed caps at tier 5. */
  pickCombo: number;
  /** Game elapsed (ms) when the last pick succeeded; -1 = none yet. */
  lastPickSuccessElapsed: number;
  /** Highest pickCombo reached this race (HUD / floater peak). */
  maxPickCombo: number;
  /** Racers that crossed the goal line, in finish order. */
  finishOrder: Array<{ kind: 'player' } | { kind: 'rival'; id: number }>;
  /** Map-placed traps (banana peels, etc.). */
  traps: TrapEntity[];
  /** 無双疾走: auto-run path to next pick (null = inactive). */
  musouRunPath: { x: number; y: number }[] | null;
  musouRunIndex: number;
  musouStepAccum: number;
  /** Fade-out timer after 無双疾走 arrival (ms). */
  musouFadeMs: number;
}

export function clampCpuCount(count: number): number {
  return Math.max(MIN_CPU_COUNT, Math.min(MAX_CPU_COUNT, Math.round(count)));
}

export function setPrimaryRival(state: GameState, rival: RivalEntity): GameState {
  const rivals = [...state.rivals];
  rivals[0] = rival;
  return { ...state, rivals };
}

export const COLORS = {
  // Floor — warehouse grey epoxy
  floorA: PALETTE.floorGrey,
  floorB: '#7a828a',
  floorC: '#6a727a',
  floorLine: paletteAlpha(PALETTE.pixelBlack, 0.25),
  floorGrout: PALETTE.bgDark,
  floorHighlight: paletteAlpha(PALETTE.pixelWhite, 0.03),

  // Walls — concrete + metal from bg dark
  wallTop: '#6a7080',
  wallTopLight: '#8a929a',
  wallTopDark: '#4a5058',
  wallSide: PALETTE.bgDark,
  wallSideDark: PALETTE.pixelBlack,
  wallEdge: PALETTE.pixelBlack,
  wallBrick: '#5a6070',
  wallBrickLight: PALETTE.floorGrey,
  wallBrickDark: '#3a4048',
  wallMortar: '#2a2e38',

  // Shelves — wood tones from palette
  shelfBack: PALETTE.pixelBlack,
  shelfBackDark: '#0a0a0e',
  shelfWood: PALETTE.shelfWood,
  shelfWoodLight: '#8a5c3a',
  shelfWoodDark: '#4a3018',
  shelfWoodHighlight: '#a07048',
  shelfBoard: '#5a3818',
  shelfBoardLight: PALETTE.shelfWood,

  // Books — richer palette
  bookColors: [
    '#d44a4a', '#4a8ad4', '#5ab85a', '#d4a04a',
    '#9a5ad4', '#d47a5a', '#4ad4c4', '#c4c44a',
    '#6a8aff', '#ff6a9a', '#3ad4a0', '#ffaa3a',
  '#a06aff', '#5ad4d4', '#ff5a5a', '#5affb0',
  '#ffd05a', '#7a9aff', '#ff8e5a', '#a0ffa0',
  '#ff5aaa', '#5affff', '#ffdd5a', '#aa5aff',
  '#5aff5a', '#ff7a7a', '#7aff7a', '#ffaa5a',
  '#5a7aff', '#ff5a5a', '#aaff5a', '#5a5aff',
  '#ffaa7a', '#7affff', '#ff5aff', '#aaffaa',
  '#ffdd7a', '#7a7aff', '#ff7aaa', '#aaff7a',
  '#ffddaa', '#7affaa', '#ff5a7a', '#5aaaff',
  '#ff7aff', '#aaff5a', '#5a5aff', '#ffaa5a',
  '#5affaa', '#ff5a5a', '#aaffff', '#ffdd5a',
    '#d44a4a', '#4a8ad4', '#5ab85a', '#d4a04a',
    '#9a5ad4', '#d47a5a', '#4ad4c4', '#c4c44a',
    '#6a8aff', '#ff6a9a', '#3ad4a0', '#ffaa3a',
    '#a06aff', '#5ad4d4', '#ff5a5a', '#5affb0',
    '#ffd05a', '#7a9aff', '#ff8e5a', '#a0ffa0',
    '#ff5aaa', '#5affff', '#ffdd5a', '#aa5aff',
    '#5aff5a', '#ff7a7a', '#7aff7a', '#ffaa5a',
    '#5a7aff', '#ff5a5a', '#aaff5a', '#5a5aff',
    '#ffaa7a', '#7affff', '#ff5aff', '#aaffaa',
    '#ffdd7a', '#7a7aff', '#ff7aaa', '#aaff7a',
    '#ffddaa', '#7affaa', '#ff5a7a', '#5aaaff',
    '#ff7aff', '#aaff5a', '#5a5aff', '#ffaa5a',
    '#5affaa', '#ff5a5a', '#aaffff', '#ffdd5a',
  ],
  bookHighlight: 'rgba(255,255,255,0.25)',
  bookShadow: 'rgba(0,0,0,0.3)',

  // Player — UI blue hero
  player: PALETTE.uiBlue,
  playerLight: '#4db8ff',
  playerDark: '#0070cc',
  playerOutline: PALETTE.pixelBlack,
  playerStun: '#6a8aa8',

  // Rival — safety orange
  rival: PALETTE.safetyOrange,
  rivalLight: '#ffb040',
  rivalDark: '#a86000',
  rivalOutline: '#5a3800',
  rivalStun: '#7a5a3a',

  // Goal — caution yellow shutter
  goal: PALETTE.cautionYellow,
  goalLight: '#ffe060',
  goalDark: '#a88010',
  goalMetal: '#d4a820',
  goalMetalDark: '#907010',

  // Glows and gauges
  glow: PALETTE.cautionYellow,
  rivalGlow: PALETTE.safetyOrange,
  gauge: PALETTE.uiBlue,
  gaugeLight: '#4db8ff',
  gaugeBg: paletteAlpha(PALETTE.pixelWhite, 0.12),
  rivalGauge: PALETTE.safetyOrange,
  rivalGaugeLight: '#ffb040',
  rivalGaugeBg: paletteAlpha(PALETTE.pixelWhite, 0.12),

  // Effects
  shadow: paletteAlpha(PALETTE.pixelBlack, 0.4),
  shadowSoft: paletteAlpha(PALETTE.pixelBlack, 0.2),
  text: PALETTE.pixelWhite,
  textSoft: PALETTE.floorGrey,
  textDim: '#6a727a',
  collision: PALETTE.pixelWhite,
} as const;
