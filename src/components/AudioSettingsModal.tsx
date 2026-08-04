import { useCallback, useEffect, useState } from 'react';
import { RotateCcw, Volume2, X } from 'lucide-react';
import {
  DEFAULT_AUDIO_VOLUMES,
  getAudioVolumes,
  resetAudioVolumes,
  setAudioVolumes,
  type AudioCategory,
  type AudioVolumes,
} from '../game/sound';

interface Props {
  open: boolean;
  onClose: () => void;
}

const SLIDERS: { key: Exclude<AudioCategory, 'master'>; label: string; hint: string }[] = [
  { key: 'bgm', label: 'BGM', hint: 'レース中の背景音楽（控えめ推奨）' },
  { key: 'voice', label: '悲鳴・ボイス', hint: '小悲鳴 / 大悲鳴（衝突時）' },
  { key: 'combo', label: 'コンボ', hint: '連続ピック時（他SEより強めに鳴ります）' },
  { key: 'footstep', label: '足音', hint: '走行時のキュッキュッ / ドタドタ' },
  { key: 'pick', label: 'ピッキング', hint: '紙をめくる音' },
  { key: 'crash', label: '衝突', hint: '体当たりインパクト' },
  { key: 'retro', label: 'レトロSE', hint: 'カウントダウン・スキル等' },
];

export function AudioSettingsModal({ open, onClose }: Props) {
  const [volumes, setVolumes] = useState<AudioVolumes>(() => getAudioVolumes());

  useEffect(() => {
    if (open) setVolumes(getAudioVolumes());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const apply = useCallback((next: AudioVolumes) => {
    setVolumes(next);
    setAudioVolumes(next);
  }, []);

  const setOne = (key: AudioCategory, value: number) => {
    apply({ ...volumes, [key]: value });
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[#0c1020]/80 p-3 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-[min(420px,96vw)] rounded-xl border-2 border-[#3bd4ff]/35 bg-[#121a33] p-4 shadow-[0_0_32px_rgba(59,212,255,0.2)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="audio-settings-title"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[#ffe46b]">
            <Volume2 className="h-4 w-4" />
            <p id="audio-settings-title" className="text-sm font-bold">
              サウンド設定
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-[#9fb0d8] hover:bg-[#1a2a4d]"
            aria-label="閉じる"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-4 text-[10px] leading-relaxed text-[#8a9bc0]">
          リアルSE（足音・紙・悲鳴）とレトロ電子音を個別に調整できます。設定は自動保存されます。
        </p>

        <label className="mb-3 block">
          <div className="mb-1 flex justify-between text-[11px] text-[#cfe0ff]">
            <span>マスター音量</span>
            <span className="font-mono tabular-nums">{Math.round(volumes.master * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(volumes.master * 100)}
            onChange={(e) => setOne('master', Number(e.target.value) / 100)}
            className="audio-volume-slider w-full"
          />
        </label>

        <div className="space-y-3 border-t border-[#2a3a5d]/60 pt-3">
          {SLIDERS.map(({ key, label, hint }) => (
            <label key={key} className="block">
              <div className="mb-0.5 flex justify-between text-[11px] text-[#cfe0ff]">
                <span>{label}</span>
                <span className="font-mono tabular-nums text-[#9fb0d8]">
                  {Math.round(volumes[key] * 100)}%
                </span>
              </div>
              <p className="mb-1 text-[9px] text-[#6a7a9a]">{hint}</p>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(volumes[key] * 100)}
                onChange={(e) => setOne(key, Number(e.target.value) / 100)}
                className="audio-volume-slider w-full"
              />
            </label>
          ))}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => apply({ ...DEFAULT_AUDIO_VOLUMES })}
            className="flex items-center gap-1 rounded-md border border-[#2a3a5d] px-2 py-1 text-[10px] text-[#9fb0d8] hover:bg-[#1a2a4d]"
          >
            <RotateCcw className="h-3 w-3" />
            初期値
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[#3bd4ff]/50 bg-[#1a3055] px-3 py-1 text-[11px] font-bold text-[#3bd4ff]"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
