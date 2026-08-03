import { MAIN_AISLE_Y_BOTTOM, MAIN_AISLE_Y_TOP, START_CORRIDOR_X } from '../levelgen';

/** Step 1: pick target placed below the main aisle so it clears the instruction UI. */
export const TUTORIAL_STEP1_SHELF = { x: 5, y: 8 } as const;

/** Player spawn: left start corridor (free movement, no flow arrows). */
export const TUTORIAL_PLAYER_SPAWN = { x: START_CORRIDOR_X, y: MAIN_AISLE_Y_TOP } as const;

/** CPU spawn: same start corridor, lower main aisle row. */
export const TUTORIAL_RIVAL_SPAWN = { x: START_CORRIDOR_X, y: MAIN_AISLE_Y_BOTTOM } as const;

/** Step 5 sub-step 1: far pick target shelf. */
export const TUTORIAL_STEP5_SHELF = { x: 16, y: 5 } as const;

/** Step 5 sub-step 2: stationary blocker on main aisle. */
export const TUTORIAL_STEP5_BLOCKER = { x: 11, y: MAIN_AISLE_Y_TOP } as const;

/** Step 5 sub-step 2: reach this cell after knocking CPU aside. */
export const TUTORIAL_STEP5_REACH = { x: 15, y: MAIN_AISLE_Y_TOP } as const;

/** Step 5 sub-step 3: rival picks at this shelf. */
export const TUTORIAL_STEP5_JAM_RIVAL_SHELF = { x: 10, y: 5 } as const;

/** Must complete pick within this window after 超早歩き activation. */
export const TUTORIAL_SUPER_SPEED_PICK_WINDOW_MS = 3000;
