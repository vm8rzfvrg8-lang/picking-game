import {
  comboTimeRemaining,
  COMBO_WINDOW_MS,
  getComboDisplayColor,
  isRainbowCombo,
} from '../game/combo';
import type { GameState } from '../game/constants';

interface Props {
  game: GameState;
}

export function ComboHud({ game }: Props) {
  if (game.pickCombo <= 0) return null;

  const remaining = comboTimeRemaining(game.lastPickSuccessElapsed, game.elapsed);
  const urgency = remaining / COMBO_WINDOW_MS;
  const combo = game.pickCombo;
  const rainbow = isRainbowCombo(combo);
  const color = getComboDisplayColor(combo);

  return (
    <div
      className={`combo-hud${rainbow ? ' combo-hud--rainbow' : ''}`}
      style={rainbow ? undefined : { borderColor: `${color}55` }}
      aria-live="polite"
    >
      <div className="combo-hud-main">
        <span
          className="combo-hud-count"
          style={rainbow ? undefined : { color, textShadow: `0 0 8px ${color}88` }}
        >
          {combo}
        </span>
        <span
          className="combo-hud-label"
          style={rainbow ? undefined : { color }}
        >
          COMBO!
        </span>
      </div>
      <div className={`combo-hud-sub${rainbow ? ' combo-hud-sub--rainbow' : ''}`}>
        {rainbow ? 'ZONE!' : 'SPEED UP!'}
      </div>
      <div className="combo-hud-timer">
        <div
          className={`combo-hud-timer-fill${rainbow ? ' combo-hud-timer-fill--rainbow' : ''}`}
          style={
            rainbow
              ? { width: `${urgency * 100}%` }
              : { width: `${urgency * 100}%`, background: color }
          }
        />
      </div>
    </div>
  );
}
