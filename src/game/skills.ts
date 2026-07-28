import type { GameState } from './constants';

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
    label: '超早歩き',
    shortLabel: '加速',
    description: '3秒間、移動速度1.5倍',
    durationMs: 3000,
  },
  [SkillType.PushThrough]: {
    type: SkillType.PushThrough,
    label: 'ゴリ押し',
    shortLabel: '無敵',
    description: '5秒間ノックバック無効・相手を押し出し',
    durationMs: 5000,
  },
  [SkillType.JamSignal]: {
    type: SkillType.JamSignal,
    label: '妨害電波',
    shortLabel: '妨害',
    description: '相手全員を1.5秒スタン',
    durationMs: 0,
  },
};

export interface SkillState {
  gaugeMs: number;
  activeId: SkillType | null;
  activeRemainingMs: number;
}

export const SKILL_GAUGE_FILL_MS = 10000;
export const SKILL_SUPER_SPEED_MULT = 1.5;
export const SKILL_SUPER_SPEED_MOVE_COOLDOWN_MULT = 1 / SKILL_SUPER_SPEED_MULT;
export const SKILL_JAM_STUN_MS = 1500;

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

export function isSkillEffectActive(skills: SkillState): boolean {
  return skills.activeRemainingMs > 0;
}

export function isSuperSpeedActive(skills: SkillState): boolean {
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

export function isSkillReady(skills: SkillState): boolean {
  return skills.gaugeMs >= SKILL_GAUGE_FILL_MS && !isSkillEffectActive(skills);
}

export function getSuperSpeedMoveCooldown(baseCooldownMs: number, skills: SkillState): number {
  return isSuperSpeedActive(skills)
    ? baseCooldownMs * SKILL_SUPER_SPEED_MOVE_COOLDOWN_MULT
    : baseCooldownMs;
}

/** @deprecated Use getSuperSpeedMoveCooldown */
export function getSpeedBoostMoveCooldown(baseCooldownMs: number, skills: SkillState): number {
  return getSuperSpeedMoveCooldown(baseCooldownMs, skills);
}

export function tickOneSkillState(skills: SkillState, dtMs: number): { skills: SkillState; changed: boolean } {
  const next = { ...skills };
  let changed = false;

  if (next.activeRemainingMs > 0) {
    const remaining = Math.max(0, next.activeRemainingMs - dtMs);
    if (remaining !== next.activeRemainingMs) {
      next.activeRemainingMs = remaining;
      next.activeId = remaining > 0 ? next.activeId : null;
      changed = true;
    }
  } else if (next.gaugeMs < SKILL_GAUGE_FILL_MS) {
    next.gaugeMs = Math.min(SKILL_GAUGE_FILL_MS, next.gaugeMs + dtMs);
    changed = true;
  }

  return { skills: next, changed };
}

export function tickSkills(state: GameState, dtMs: number): GameState {
  const player = tickOneSkillState(state.skills, dtMs);
  const rival = tickOneSkillState(state.rivalSkills, dtMs);
  if (!player.changed && !rival.changed) return state;
  return {
    ...state,
    skills: player.skills,
    rivalSkills: rival.skills,
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

/** Skill entry point — uses the skill equipped on GameState.selectedSkill. */
export function useSkill(state: GameState): SkillUseResult {
  const tutorialSkill = state.phase === 'tutorial' && state.tutorialSubStep > 0;
  if (state.phase !== 'playing' && !tutorialSkill) return { state, used: false };
  if (!isSkillReady(state.skills)) return { state, used: false };
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
  const def = SKILL_DEFINITIONS[SkillType.SuperSpeed];
  return {
    state: {
      ...state,
      skills: {
        gaugeMs: 0,
        activeId: SkillType.SuperSpeed,
        activeRemainingMs: def.durationMs,
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
  return {
    state: {
      ...state,
      skills: resetGauge(state.skills),
      rival: {
        ...state.rival,
        stun: SKILL_JAM_STUN_MS,
        jamStun: true,
        isPicking: false,
        pickProgress: 0,
      },
      version: state.version + 1,
    },
    used: true,
    skillId: SkillType.JamSignal,
  };
}
