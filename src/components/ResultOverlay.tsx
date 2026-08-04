import { RotateCcw } from 'lucide-react';
import type { GameState } from '../game/constants';
import {
  computePlayerRank,
  computeTotalCoins,
  formatRankLabel,
} from '../game/result';
import { useCountUp } from '../hooks/useCountUp';

interface Props {
  game: GameState;
  onRestart: () => void;
}

const CELEBRATION_SPARKS = 24;

export function ResultOverlay({ game, onRestart }: Props) {
  const won = game.phase === 'won';
  const rank = computePlayerRank(game);
  const isFirst = rank === 1;
  const maxCombo = game.maxPickCombo;
  const totalCoins = computeTotalCoins(rank, maxCombo);

  const active = game.phase === 'won' || game.phase === 'lost';

  const comboDisplay = useCountUp(maxCombo, active, 680, 320);
  const coinsDisplay = useCountUp(totalCoins, active, 900, 820);

  const rankColor = isFirst
    ? 'var(--color-caution-yellow)'
    : won
      ? 'var(--color-ui-blue)'
      : 'var(--color-glow-red)';

  return (
    <div className="result-overlay" role="dialog" aria-modal="true" aria-labelledby="result-title">
      {isFirst && won && (
        <div className="result-celebration" aria-hidden>
          {Array.from({ length: CELEBRATION_SPARKS }, (_, i) => (
            <span key={i} className="result-celebration-particle" style={{ ['--p-i' as string]: i }} />
          ))}
        </div>
      )}

      <div className="result-dialog">
        <header className="result-header">
          <p id="result-title" className="result-title" style={{ color: rankColor }}>
            {won ? 'GOAL!' : 'RACE OVER'}
          </p>
        </header>

        <dl className="result-stats">
          <div className="result-stat">
            <dt>Rank</dt>
            <dd>
              <span className="result-stat-value result-stat-value--rank" style={{ color: rankColor }}>
                {formatRankLabel(rank)}
              </span>
            </dd>
          </div>
          <div className="result-stat">
            <dt>Max Combo</dt>
            <dd>
              <span className="result-stat-value result-stat-value--combo">{comboDisplay}</span>
              <span className="result-stat-unit">COMBO</span>
            </dd>
          </div>
          <div className="result-stat result-stat--coins">
            <dt>Coins</dt>
            <dd>
              <span className="result-coin-icon" aria-hidden>
                ◎
              </span>
              <span className="result-stat-value result-stat-value--coins">{coinsDisplay}</span>
            </dd>
          </div>
        </dl>

        <button type="button" className="result-replay-btn" onClick={onRestart}>
          <RotateCcw className="result-replay-icon" aria-hidden />
          もう一度遊ぶ
        </button>
      </div>
    </div>
  );
}
