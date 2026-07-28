export type Difficulty = 'easy' | 'normal' | 'hard';

export interface DifficultyConfig {
  label: string;
  shortLabel: string;
  description: string;
  stepMs: number;
  pickMs: number;
  flowBonus: number;
  wrongWayPenalty: number;
  /** Easy only: chance to skip a move step (0–1). */
  hesitateChance: number;
  /** Easy only: ms before starting a pick when adjacent. */
  pickDelayMs: number;
}

export const DIFFICULTY_PRESETS: Record<Difficulty, DifficultyConfig> = {
  easy: {
    label: 'EASY',
    shortLabel: 'かんたん',
    description: '動きとピックがゆっくり。たまに迷う。',
    stepMs: 720,
    pickMs: 4300,
    flowBonus: 0.12,
    wrongWayPenalty: 1.1,
    hesitateChance: 0.14,
    pickDelayMs: 500,
  },
  normal: {
    label: 'NORMAL',
    shortLabel: 'ふつう',
    description: 'バランス標準。今まで通りのCPU。',
    stepMs: 580,
    pickMs: 3500,
    flowBonus: 0.2,
    wrongWayPenalty: 0.8,
    hesitateChance: 0,
    pickDelayMs: 0,
  },
  hard: {
    label: 'HARD',
    shortLabel: 'むずかしい',
    description: '素早くピック。最短ルートを積極的に取る。',
    stepMs: 450,
    pickMs: 2550,
    flowBonus: 0.28,
    wrongWayPenalty: 0.45,
    hesitateChance: 0,
    pickDelayMs: 0,
  },
};

export function getDifficultyConfig(d: Difficulty): DifficultyConfig {
  return DIFFICULTY_PRESETS[d];
}
