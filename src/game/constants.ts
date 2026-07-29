// Tile types on the grid
export type Tile =
  | 'F' // Floor (walkable aisle)
  | 'W' // Outer wall
  | 'S' // Bookshelf (solid, pickable target when active)
  | 'G'; // Goal zone (shutter, right edge)

export type Facing = 'up' | 'down' | 'left' | 'right';
export type Direction = Facing;

export interface PlayerEntity {
  x: number;
  y: number;
  facing: Facing;
  spawn: { x: number; y: number };
  stun: number; // >0 = frozen (ms remaining)
  lastMoveDir: Direction | null;
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
}

// A pick target: a bookshelf cell with an index (order to pick in)
export interface PickTarget {
  index: number; // 0-based order
  x: number;
  y: number;
  done: boolean;
}

export const GRID_W = 18;
export const GRID_H = 14;
export const TILE = 36;

export const MIN_CPU_COUNT = 1;
export const MAX_CPU_COUNT = 7;
export const DEFAULT_CPU_COUNT = 7;

export const PICK_COUNT = 5;
export const PICK_DURATION_MS = 2500; // 2.5-second pick countdown
export const RIVAL_STEP_MS = 580; // rival moves one cell every this many ms
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
import { createInitialSkills } from './skills';

export type { Difficulty } from './difficulty';
export type { SkillState, SkillType } from './skills';
export { SkillType } from './skills';

export type Phase = 'start' | 'tutorial' | 'playing' | 'won' | 'lost';

/** CPU body colors (index 0–6). */
export const RIVAL_PALETTE = [
  { body: '#ff8c42', light: '#ffb070', dark: '#a85a20', outline: '#5a2e0a', stun: '#7a5a3a' },
  { body: '#ff5a8a', light: '#ff8cb0', dark: '#a83058', outline: '#5a1830', stun: '#7a4a58' },
  { body: '#5aff8a', light: '#8affb0', dark: '#20a858', outline: '#0a5a30', stun: '#4a7a58' },
  { body: '#8a5aff', light: '#b08aff', dark: '#5820a8', outline: '#300a5a', stun: '#5a4a7a' },
  { body: '#ffdd5a', light: '#ffee8a', dark: '#a89820', outline: '#5a500a', stun: '#7a755a' },
  { body: '#5ad4ff', light: '#8ae5ff', dark: '#2088a8', outline: '#0a485a', stun: '#4a687a' },
  { body: '#ff7a5a', light: '#ffa08a', dark: '#a84820', outline: '#5a280a', stun: '#7a584a' },
] as const;

export interface GameState {
  grid: Tile[][];
  player: PlayerEntity;
  rivals: RivalEntity[];
  /** Selected CPU count (1–7) for the current session. */
  cpuCount: number;
  targets: PickTarget[]; // player's ordered pick list
  currentTarget: number; // index into targets[] of the next to pick (0..PICK_COUNT)
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
  // Floor — warm stone tiles with subtle variation
  floorA: '#3a3550',
  floorB: '#423d5c',
  floorC: '#383350',
  floorLine: 'rgba(80,70,110,0.25)',
  floorGrout: '#2a2638',
  floorHighlight: 'rgba(255,255,255,0.03)',

  // Walls — stone brick with depth
  wallTop: '#6a7088',
  wallTopLight: '#8088a4',
  wallTopDark: '#545a72',
  wallSide: '#3e4258',
  wallSideDark: '#2a2e40',
  wallEdge: '#1a1e2e',
  wallBrick: '#5a6078',
  wallBrickLight: '#6e7490',
  wallBrickDark: '#444a60',
  wallMortar: '#363a4e',

  // Shelves — rich wood
  shelfBack: '#2a1a0e',
  shelfBackDark: '#1a0e06',
  shelfWood: '#8a5a30',
  shelfWoodLight: '#b07840',
  shelfWoodDark: '#5a3818',
  shelfWoodHighlight: '#c89058',
  shelfBoard: '#6a4220',
  shelfBoardLight: '#8a5a30',

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

  // Player — cyan hero with depth
  player: '#3bd4ff',
  playerLight: '#7ae5ff',
  playerDark: '#1a7ea8',
  playerOutline: '#0a3a5a',
  playerStun: '#7a9aa8',

  // Rival — orange rival with depth
  rival: '#ff8c42',
  rivalLight: '#ffb070',
  rivalDark: '#a85a20',
  rivalOutline: '#5a2e0a',
  rivalStun: '#7a5a3a',

  // Goal — golden metallic shutter
  goal: '#ffe46b',
  goalLight: '#fff5a8',
  goalDark: '#a8862a',
  goalMetal: '#c8a840',
  goalMetalDark: '#8a7028',

  // Glows and gauges
  glow: '#ffe46b',
  rivalGlow: '#ff8c42',
  gauge: '#3bd4ff',
  gaugeLight: '#7ae5ff',
  gaugeBg: 'rgba(255,255,255,0.12)',
  rivalGauge: '#ff8c42',
  rivalGaugeLight: '#ffb070',
  rivalGaugeBg: 'rgba(255,255,255,0.12)',

  // Effects
  shadow: 'rgba(0,0,0,0.4)',
  shadowSoft: 'rgba(0,0,0,0.2)',
  text: '#e8ecff',
  textSoft: '#9fb0d8',
  textDim: '#5a6a8d',
  collision: '#ffffff',
} as const;
