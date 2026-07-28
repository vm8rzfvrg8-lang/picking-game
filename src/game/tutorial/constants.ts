import { GRID_W } from '../constants';
import { MAIN_AISLE_Y_TOP } from '../levelgen';

/** Step 1: pick target placed below the main aisle so it clears the instruction UI. */
export const TUTORIAL_STEP1_SHELF = { x: 3, y: 8 } as const;

/** Player spawn: 2 tiles right of the left map edge (x=0). */
export const TUTORIAL_PLAYER_SPAWN = { x: 2, y: MAIN_AISLE_Y_TOP } as const;

/** CPU spawn: 2 tiles left of the right map edge (x=GRID_W-1). */
export const TUTORIAL_RIVAL_SPAWN = { x: GRID_W - 3, y: MAIN_AISLE_Y_TOP } as const;

/** Step 5 sub-step 1: far pick target shelf. */
export const TUTORIAL_STEP5_SHELF = { x: 14, y: 5 } as const;

/** Step 5 sub-step 2: stationary blocker on main aisle. */
export const TUTORIAL_STEP5_BLOCKER = { x: 9, y: MAIN_AISLE_Y_TOP } as const;

/** Step 5 sub-step 2: reach this cell after knocking CPU aside. */
export const TUTORIAL_STEP5_REACH = { x: 13, y: MAIN_AISLE_Y_TOP } as const;

/** Step 5 sub-step 3: rival picks at this shelf. */
export const TUTORIAL_STEP5_JAM_RIVAL_SHELF = { x: 8, y: 5 } as const;

/** Must complete pick within this window after 超早歩き activation. */
export const TUTORIAL_SUPER_SPEED_PICK_WINDOW_MS = 3000;
