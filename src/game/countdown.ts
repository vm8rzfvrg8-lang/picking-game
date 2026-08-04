/** Race start countdown sequence labels. */
export const COUNTDOWN_STEPS = ['3', '2', '1', 'GO!'] as const;

export type CountdownLabel = (typeof COUNTDOWN_STEPS)[number];

/** Display duration per step (ms). */
export const COUNTDOWN_STEP_MS = 720;

/** Extra hold after GO! before overlay hides (ms). */
export const COUNTDOWN_GO_HOLD_MS = 680;

export function isGoLabel(label: CountdownLabel): boolean {
  return label === 'GO!';
}
