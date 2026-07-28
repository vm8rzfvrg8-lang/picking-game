import { Clock, RotateCcw, Volume2, VolumeX } from 'lucide-react';

interface Props {
  elapsedMs: number;
  muted: boolean;
  onToggleMute: () => void;
  onReset: () => void;
}

export function GameplayTopBar({ elapsedMs, muted, onToggleMute, onReset }: Props) {
  const seconds = (elapsedMs / 1000).toFixed(1);

  return (
    <div className="game-system-bar">
      <div className="flex items-center gap-1 rounded-md border border-[#2a3a5d]/60 bg-[#0c1530]/90 px-1.5 py-0.5 text-[10px] text-[#9fb0d8] backdrop-blur-sm">
        <Clock className="h-3 w-3 shrink-0" />
        <span className="font-mono font-bold tabular-nums">{seconds}s</span>
      </div>
      <button
        type="button"
        onClick={onToggleMute}
        className="rounded-md border border-[#2a3a5d]/80 bg-[#0c1530]/90 p-1 text-[#9fb0d8] backdrop-blur-sm transition hover:bg-[#1a2a4d]"
        aria-label="mute"
      >
        {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        onClick={onReset}
        className="rounded-md border border-[#2a3a5d]/80 bg-[#0c1530]/90 p-1 text-[#9fb0d8] backdrop-blur-sm transition hover:bg-[#1a2a4d]"
        aria-label="リセット"
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
