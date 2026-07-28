import { Trophy, Skull, RotateCcw } from 'lucide-react';
import { GameState } from '../game/constants';
import { getDifficultyConfig } from '../game/difficulty';

interface Props {
  game: GameState;
  onRestart: () => void;
}

export function ResultOverlay({ game, onRestart }: Props) {
  const won = game.phase === 'won';
  const color = won ? '#ffe46b' : '#ff5a5a';
  const seconds = (game.elapsed / 1000).toFixed(1);
  const cpuLabel = getDifficultyConfig(game.difficulty).shortLabel;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[#0c1020]/90 backdrop-blur-sm p-3 sm:p-4">
      <div
        className="my-auto w-[min(440px,96vw)] rounded-2xl border-2 p-6 text-center text-white sm:p-8"
        style={{ borderColor: color, background: '#121a33', boxShadow: `0 0 50px ${color}55` }}
      >
        {won ? (
          <Trophy className="mx-auto mb-3 h-14 w-14" style={{ color }} />
        ) : (
          <Skull className="mx-auto mb-3 h-14 w-14" style={{ color }} />
        )}
        <h2
          className="mb-2 text-2xl font-black"
          style={{ fontFamily: '"Press Start 2P", monospace', color }}
        >
          {won ? 'CLEAR!' : 'GAME OVER'}
        </h2>
        <p className="mb-1 text-sm text-[#9fb0d8]">
          {won
            ? 'ライバルに勝ち越した! 図書館を脱出!'
            : 'ライバルに先を越された…'}
        </p>
        <p className="mb-6 text-xs text-[#5a6a8d]">
          記録: {seconds}s / CPU: {cpuLabel}
        </p>
        <button
          onClick={onRestart}
          className="inline-flex items-center gap-2 rounded-lg px-6 py-3 font-black text-[#0c1020] transition hover:scale-[1.03]"
          style={{ background: color, fontFamily: '"Press Start 2P", monospace' }}
        >
          <RotateCcw className="h-4 w-4" />
          もう一回
        </button>
      </div>
    </div>
  );
}
