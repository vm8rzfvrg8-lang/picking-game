import type { GameState } from './constants';
import { bfsPath, isWalkable } from './levelgen';

/** Equipped skill types (extend here when adding skills). */
export enum SkillType {
  SuperSpeed = 'superSpeed',
  PushThrough = 'pushThrough',
  JamSignal = 'jamSignal',
}

export const SKILL_TYPES: SkillType[] = [
  SkillType.SuperSpeed,
  SkillType.PushThrough,
  SkillType.JamSignal,
];

export interface SkillDefinition {
  type: SkillType;
  label: string;
  shortLabel: string;
  description: string;
  /** Effect duration on player; 0 = instant. */
  durationMs: number;
}

export const SKILL_DEFINITIONS: Record<SkillType, SkillDefinition> = {
  [SkillType.SuperSpeed]: {
    type: SkillType.SuperSpeed,
    label: '無双疾走',
    shortLabel: '疾走',
    description: '次の棚まで自動疾走（3倍速・無敵）',
    durationMs: 0,
  },
  [SkillType.PushThrough]: {
    type: SkillType.PushThrough,
    label: '覇道威圧',
    shortLabel: '威圧',
    description: '5秒間、前方半円で相手を吹き飛ばし',
    durationMs: 5000,
  },
  [SkillType.JamSignal]: {
    type: SkillType.JamSignal,
    label: '電波狂乱',
    shortLabel: '電波',
    description: '周囲の相手の棚ガイドを5秒間遮断',
    durationMs: 0,
  },
};

export interface SkillState {
  gaugeMs: number;
  activeId: SkillType | null;
  activeRemainingMs: number;
}

export const SKILL_GAUGE_FILL_MS = 10000;
export const SKILL_MUSOU_SPEED_MULT = 3;
export const SKILL_HADOU_SPEED_MULT = 1.3;
export const SKILL_JAM_GUIDE_HIDDEN_MS = 5000;
/** 電波狂乱中、1歩ごとに停止する確率。 */
export const SKILL_JAM_CONFUSED_STOP_CHANCE = 0.38;
export const SKILL_JAM_RADIUS = 7;
export const SKILL_HADOU_ARC_RADIUS = 2;
export const SKILL_MUSOU_FADE_MS = 600;

const NEIGHBOR_DELTAS: ReadonlyArray<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function createInitialSkills(): SkillState {
  return { gaugeMs: 0, activeId: null, activeRemainingMs: 0 };
}

export function getSkillDefinition(type: SkillType): SkillDefinition {
  return SKILL_DEFINITIONS[type];
}

export function getActiveSkillDuration(skills: SkillState): number {
  if (!skills.activeId) return 0;
  return SKILL_DEFINITIONS[skills.activeId].durationMs;
}

export function isMusouRunning(state: GameState): boolean {
  return state.musouRunPath != null && state.musouRunIndex < state.musouRunPath.length;
}

export function isMusouActive(state: GameState): boolean {
  return (
    isMusouRunning(state) ||
    (state.skills.activeId === SkillType.SuperSpeed && state.musouFadeMs > 0)
  );
}

export function isSuperSpeedActive(skills: SkillState, state?: GameState): boolean {
  if (state && isMusouActive(state)) return true;
  return skills.activeId === SkillType.SuperSpeed && skills.activeRemainingMs > 0;
}

export function isPushThroughActive(skills: SkillState): boolean {
  return skills.activeId === SkillType.PushThrough && skills.activeRemainingMs > 0;
}

/** @deprecated Use isSuperSpeedActive */
export function isSpeedBoostActive(skills: SkillState): boolean {
  return isSuperSpeedActive(skills);
}

export function getSkillGaugeRatio(skills: SkillState): number {
  return Math.min(1, skills.gaugeMs / SKILL_GAUGE_FILL_MS);
}

export function isSkillEffectActive(skills: SkillState, state?: GameState): boolean {
  if (state && isMusouActive(state)) return true;
  return skills.activeRemainingMs > 0;
}

export function isSkillReady(skills: SkillState, state?: GameState): boolean {
  if (state && isMusouRunning(state)) return false;
  return skills.gaugeMs >= SKILL_GAUGE_FILL_MS && !isSkillEffectActive(skills, state);
}

export function getPlayerMoveCooldown(baseCooldownMs: number, skills: SkillState, state: GameState): number {
  if (isMusouRunning(state)) return baseCooldownMs / SKILL_MUSOU_SPEED_MULT;
  if (isPushThroughActive(skills)) return baseCooldownMs / SKILL_HADOU_SPEED_MULT;
  return baseCooldownMs;
}

/** @deprecated Use getPlayerMoveCooldown */
export function getSuperSpeedMoveCooldown(baseCooldownMs: number, skills: SkillState): number {
  return isSuperSpeedActive(skills) ? baseCooldownMs / SKILL_MUSOU_SPEED_MULT : baseCooldownMs;
}

/** @deprecated Use getSuperSpeedMoveCooldown */
export function getSpeedBoostMoveCooldown(baseCooldownMs: number, skills: SkillState): number {
  return getSuperSpeedMoveCooldown(baseCooldownMs, skills);
}

export function tickOneSkillState(
  skills: SkillState,
  dtMs: number,
  opts?: { freezeSuperSpeedTimer?: boolean },
): { skills: SkillState; changed: boolean } {
  const next = { ...skills };
  let changed = false;

  if (next.activeRemainingMs > 0) {
    if (opts?.freezeSuperSpeedTimer && next.activeId === SkillType.SuperSpeed) {
      // 無双疾走は到着までタイマーを止める
    } else {
      const remaining = Math.max(0, next.activeRemainingMs - dtMs);
      if (remaining !== next.activeRemainingMs) {
        next.activeRemainingMs = remaining;
        next.activeId = remaining > 0 ? next.activeId : null;
        changed = true;
      }
    }
  } else if (next.gaugeMs < SKILL_GAUGE_FILL_MS) {
    next.gaugeMs = Math.min(SKILL_GAUGE_FILL_MS, next.gaugeMs + dtMs);
    changed = true;
  }

  return { skills: next, changed };
}

export function tickSkills(state: GameState, dtMs: number): GameState {
  const freezeSuperSpeed = isMusouRunning(state);
  const player = tickOneSkillState(state.skills, dtMs, { freezeSuperSpeedTimer: freezeSuperSpeed });
  let rivalsChanged = false;
  const rivalSkills = state.rivalSkills.map((rs) => {
    const rival = tickOneSkillState(rs, dtMs);
    if (rival.changed) rivalsChanged = true;
    return rival.skills;
  });

  let musouFadeMs = state.musouFadeMs;
  if (musouFadeMs > 0) {
    musouFadeMs = Math.max(0, musouFadeMs - dtMs);
  }

  if (!player.changed && !rivalsChanged && musouFadeMs === state.musouFadeMs) return state;
  return {
    ...state,
    skills: player.skills,
    rivalSkills,
    musouFadeMs,
    version: state.version + 1,
  };
}

export interface SkillUseResult {
  state: GameState;
  used: boolean;
  skillId?: SkillType;
}

export function fillSkillGauge(skills: SkillState): SkillState {
  return {
    ...skills,
    gaugeMs: SKILL_GAUGE_FILL_MS,
    activeId: null,
    activeRemainingMs: 0,
  };
}

/** Shortest path from player to a walkable cell adjacent to the current pick target. */
export function buildPathToCurrentTarget(state: GameState): { x: number; y: number }[] | null {
  const target = state.targets[state.currentTarget];
  if (!target || target.done) return null;

  let bestPath: { x: number; y: number }[] | null = null;
  let bestLen = Infinity;

  for (const [adx, ady] of NEIGHBOR_DELTAS) {
    const ax = target.x + adx;
    const ay = target.y + ady;
    if (!isWalkable(state.grid, ax, ay)) continue;
    const path = bfsPath(state.grid, state.player.x, state.player.y, ax, ay);
    if (!path) continue;
    if (path.length < bestLen) {
      bestLen = path.length;
      bestPath = path;
    }
  }

  return bestPath;
}

/** Skill entry point — uses the skill equipped on GameState.selectedSkill. */
export function useSkill(state: GameState): SkillUseResult {
  const tutorialSkill = state.phase === 'tutorial' && state.tutorialSubStep > 0;
  if (state.phase !== 'playing' && !tutorialSkill) return { state, used: false };
  if (!isSkillReady(state.skills, state)) return { state, used: false };
  if (
    tutorialSkill &&
    state.tutorialLockedSkill &&
    state.selectedSkill !== state.tutorialLockedSkill
  ) {
    return { state, used: false };
  }
  return applySkill(state, state.selectedSkill);
}

function applySkill(state: GameState, skillId: SkillType): SkillUseResult {
  switch (skillId) {
    case SkillType.SuperSpeed:
      return applySuperSpeedSkill(state);
    case SkillType.PushThrough:
      return applyPushThroughSkill(state);
    case SkillType.JamSignal:
      return applyJamSignalSkill(state);
    default:
      return { state, used: false };
  }
}

function resetGauge(skills: SkillState): SkillState {
  return { ...skills, gaugeMs: 0, activeId: null, activeRemainingMs: 0 };
}

function applySuperSpeedSkill(state: GameState): SkillUseResult {
  const path = buildPathToCurrentTarget(state);
  if (!path || path.length === 0) return { state, used: false };

  return {
    state: {
      ...state,
      musouRunPath: path,
      musouRunIndex: 0,
      musouStepAccum: 0,
      musouFadeMs: 0,
      skills: {
        gaugeMs: 0,
        activeId: SkillType.SuperSpeed,
        activeRemainingMs: 999999,
      },
      version: state.version + 1,
    },
    used: true,
    skillId: SkillType.SuperSpeed,
  };
}

function applyPushThroughSkill(state: GameState): SkillUseResult {
  const def = SKILL_DEFINITIONS[SkillType.PushThrough];
  return {
    state: {
      ...state,
      skills: {
        gaugeMs: 0,
        activeId: SkillType.PushThrough,
        activeRemainingMs: def.durationMs,
      },
      version: state.version + 1,
    },
    used: true,
    skillId: SkillType.PushThrough,
  };
}

function applyJamSignalSkill(state: GameState): SkillUseResult {
  const px = state.player.x;
  const py = state.player.y;
  const rivals = state.rivals.map((rival) => {
    const dx = rival.x - px;
    const dy = rival.y - py;
    const dist = Math.hypot(dx, dy);
    if (dist > SKILL_JAM_RADIUS) return rival;
    return {
      ...rival,
      jamGuideHiddenMs: SKILL_JAM_GUIDE_HIDDEN_MS,
      jamStun: true,
      isPicking: false,
      pickProgress: 0,
      pickWaitTimer: 0,
      unstickMovesLeft: 0,
    };
  });

  return {
    state: {
      ...state,
      skills: resetGauge(state.skills),
      rivals,
      version: state.version + 1,
    },
    used: true,
    skillId: SkillType.JamSignal,
  };
}

export function facingToVector(facing: 'up' | 'down' | 'left' | 'right'): { x: number; y: number } {
  switch (facing) {
    case 'up':
      return { x: 0, y: -1 };
    case 'down':
      return { x: 0, y: 1 };
    case 'left':
      return { x: -1, y: 0 };
    case 'right':
      return { x: 1, y: 0 };
  }
}

/** Front semicircle (forward + left/right) within radius tiles. */
export function isInHadouArc(
  px: number,
  py: number,
  facing: 'up' | 'down' | 'left' | 'right',
  tx: number,
  ty: number,
  radius = SKILL_HADOU_ARC_RADIUS,
): boolean {
  const dx = tx - px;
  const dy = ty - py;
  if (dx * dx + dy * dy > radius * radius) return false;
  const fwd = facingToVector(facing);
  return dx * fwd.x + dy * fwd.y >= -0.25;
}

/** Circular area for 電波狂乱 (radius 7 tiles). */
export function isInJamRadius(
  cx: number,
  cy: number,
  tx: number,
  ty: number,
  radius = SKILL_JAM_RADIUS,
): boolean {
  const dx = tx - cx;
  const dy = ty - cy;
  return dx * dx + dy * dy <= radius * radius;
}

export function isRivalJamActive(rival: { jamGuideHiddenMs: number }): boolean {
  return rival.jamGuideHiddenMs > 0;
}

export function completeMusouRun(state: GameState): GameState {
  return {
    ...state,
    musouRunPath: null,
    musouRunIndex: 0,
    musouStepAccum: 0,
    musouFadeMs: SKILL_MUSOU_FADE_MS,
    skills: {
      ...state.skills,
      activeId: null,
      activeRemainingMs: 0,
    },
    version: state.version + 1,
  };
}
