import type { Direction } from './constants';
import type { SkillType } from './skills';

export type GameEvent =
  | { type: 'move'; who: 'player' | 'rival'; fromX: number; fromY: number; dir: Direction }
  | { type: 'bump'; who: 'player' | 'rival' }
  | { type: 'pickStart'; who: 'player' | 'rival' }
  | { type: 'pickProgress'; who: 'player' | 'rival'; progress: number }
  | { type: 'pickDone'; who: 'player' | 'rival'; index: number; entityId?: number }
  | { type: 'pickCombo'; combo: number; tier: number }
  | { type: 'pickCancel'; who: 'player' | 'rival' }
  | {
      type: 'collision';
      involvesPlayer: boolean;
      playerKnockedBack: boolean;
      rivalKnockedBack: boolean;
      playerWrongWay: boolean;
      rivalWrongWay: boolean;
      playerPushed: boolean;
      rivalPushed: boolean;
      knockbackSeedA: number;
      knockbackSeedB: number;
    }
  | { type: 'skillUsed'; skill: SkillType }
  | { type: 'yield'; who: 'player' | 'rival' }
  | { type: 'win' }
  | { type: 'lose' }
  | {
      type: 'knockback';
      who: 'player' | 'rival';
      rivalId?: number;
      x: number;
      y: number;
      dirX: number;
      dirY: number;
      force: number;
      durationMs: number;
      seed: number;
      isAirborne: boolean;
      /** Random outer-ring launch (大悲鳴 SE). */
      randomLaunch?: boolean;
    }
  | {
      type: 'knockbackWallHit';
      who: 'player' | 'rival';
      rivalId?: number;
      x: number;
      y: number;
    }
  | {
      type: 'trapTriggered';
      kind: 'bananaPeel';
      x: number;
      y: number;
      who: 'player' | 'rival';
      rivalId?: number;
      seed: number;
    }
  | { type: 'musouStep'; x: number; y: number }
  | { type: 'musouComplete'; x: number; y: number }
  | { type: 'jamSignal'; x: number; y: number; radius: number };

export interface StepResult {
  state: import('./constants').GameState;
  events: GameEvent[];
}
