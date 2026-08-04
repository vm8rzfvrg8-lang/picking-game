import { PLAYER_COOLDOWN_MS, PALETTE } from './constants';

/** Max time between picks to maintain combo (ms). */
export const COMBO_WINDOW_MS = 5000;

/** Max combo tier — each tier increases move speed. */
export const COMBO_MAX_TIER = 5;

/** Move cooldown multiplier per combo tier (tier 0 = no combo). Mild curve — max ~1.43× speed. */
export const COMBO_COOLDOWN_MULT: readonly number[] = [1, 0.93, 0.86, 0.8, 0.75, 0.7];

export function getComboSpeedTier(combo: number): number {
  return Math.min(COMBO_MAX_TIER, Math.max(0, combo));
}

/** Apply combo speed tiers on top of an already-adjusted base cooldown. */
export function getComboMoveCooldown(baseCooldownMs: number, combo: number): number {
  const tier = getComboSpeedTier(combo);
  return baseCooldownMs * COMBO_COOLDOWN_MULT[tier];
}

/** Returns true if combo was reset this frame. */
export function tickComboExpiry(
  combo: number,
  lastPickSuccessElapsed: number,
  elapsed: number,
): { combo: number; expired: boolean } {
  if (combo <= 0 || lastPickSuccessElapsed < 0) {
    return { combo, expired: false };
  }
  if (elapsed - lastPickSuccessElapsed > COMBO_WINDOW_MS) {
    return { combo: 0, expired: true };
  }
  return { combo, expired: false };
}

/** Called when the player completes a pick. Returns updated combo state. */
export function registerPickComboSuccess(
  combo: number,
  lastPickSuccessElapsed: number,
  elapsed: number,
): { combo: number; tier: number; chained: boolean } {
  let nextCombo = 0;
  let chained = false;

  if (lastPickSuccessElapsed >= 0 && elapsed - lastPickSuccessElapsed <= COMBO_WINDOW_MS) {
    nextCombo = combo + 1;
    chained = nextCombo > 0;
  }

  return {
    combo: nextCombo,
    tier: getComboSpeedTier(nextCombo),
    chained,
  };
}

const COMBO_DISPLAY_COLORS: Record<number, string> = {
  1: PALETTE.uiBlue,
  2: PALETTE.glowGreen,
  3: PALETTE.glowRed,
  4: '#a855f7',
};

export function isRainbowCombo(combo: number): boolean {
  return combo >= 5;
}

export function getComboDisplayColor(combo: number): string {
  if (isRainbowCombo(combo)) return PALETTE.pixelWhite;
  return COMBO_DISPLAY_COLORS[combo] ?? PALETTE.uiBlue;
}

/** Canvas / VFX color — rainbow hue cycles when combo ≥ 5. */
export function getComboCanvasColor(combo: number, timeSec: number): string {
  if (isRainbowCombo(combo)) {
    const hue = (timeSec * 160) % 360;
    return `hsl(${hue}, 100%, 58%)`;
  }
  return getComboDisplayColor(combo);
}

export function comboMoveCooldownForPlayer(
  combo: number,
  skillsAdjustedCooldown: number = PLAYER_COOLDOWN_MS,
): number {
  return getComboMoveCooldown(skillsAdjustedCooldown, combo);
}

/** Ms remaining before combo expires (for UI). */
export function comboTimeRemaining(
  lastPickSuccessElapsed: number,
  elapsed: number,
): number {
  if (lastPickSuccessElapsed < 0) return 0;
  return Math.max(0, COMBO_WINDOW_MS - (elapsed - lastPickSuccessElapsed));
}
