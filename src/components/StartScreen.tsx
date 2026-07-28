import { useCallback, useEffect, useState } from 'react';
import {
  Book,
  Target,
  DoorOpen,
  Cpu,
  Hand,
  Swords,
  ArrowRight,
  Zap,
  Shield,
  WifiOff,
  X,
} from 'lucide-react';
import { Difficulty, DIFFICULTY_PRESETS } from '../game/difficulty';
import {
  SKILL_DEFINITIONS,
  SKILL_TYPES,
  SkillType,
} from '../game/skills';

interface Props {
  difficulty: Difficulty;
  selectedSkill: SkillType;
  onDifficultyChange: (d: Difficulty) => void;
  onSkillChange: (skill: SkillType) => void;
  onStart: () => void;
  onTutorial: () => void;
}

const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];

const SKILL_ICONS = {
  [SkillType.SuperSpeed]: Zap,
  [SkillType.PushThrough]: Shield,
  [SkillType.JamSignal]: WifiOff,
} as const;

function RulesModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="start-rules-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-[#0c1020]/85 p-3 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="start-rules-dialog max-h-[min(85vh,520px)] w-[min(520px,96vw)] overflow-y-auto rounded-xl border-2 border-[#3bd4ff]/40 bg-[#121a33] p-4 text-xs text-[#cfe0ff] shadow-[0_0_40px_rgba(59,212,255,0.25)] sm:p-5 sm:text-sm"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rules-title"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <p id="rules-title" className="font-bold text-[#ffe46b]">
            ルール
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[#2a3a5d] bg-[#0c1530] p-1.5 text-[#9fb0d8] transition hover:bg-[#1a2a4d]"
            aria-label="閉じる"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2.5">
          <div className="flex items-start gap-2">
            <Target className="mt-0.5 h-4 w-4 shrink-0 text-[#ffe46b]" />
            <p>
              光る<span className="font-bold text-[#ffe46b]">5か所の本棚</span>を順番にピック。
              全部取ったら右端のシャッターへ向かえ。
            </p>
          </div>
          <div className="flex items-start gap-2">
            <Hand className="mt-0.5 h-4 w-4 shrink-0 text-[#3bd4ff]" />
            <p>
              本棚の<strong className="text-[#3bd4ff]">隣</strong>で、
              <span className="font-bold text-[#3bd4ff]">その棚の方向キーを長押し</span>。
              ゲージが満タン（約2.5秒）で1冊ゲット。離すとキャンセル。
            </p>
          </div>
          <div className="flex items-start gap-2">
            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-[#9fb0d8]" />
            <p>
              床の矢印が<span className="font-bold">順路</span>。
              メイン通路は上段→右、下段→左。サブ通路は交互に↑↓。
            </p>
          </div>
          <div className="flex items-start gap-2">
            <Swords className="mt-0.5 h-4 w-4 shrink-0 text-[#ff5a5a]" />
            <p>
              ぶつかると<span className="font-bold text-[#ff5a5a]">逆走側はバック</span>、
              順方向からは<span className="font-bold">押された側が1マス押し出される</span>。
            </p>
          </div>
          <div className="flex items-start gap-2">
            <Cpu className="mt-0.5 h-4 w-4 shrink-0 text-[#ff8c42]" />
            <p>
              CPUも同じルールで競争。CPUの次の本は<span className="font-bold">表示されない</span>
              （進捗バーだけ見える）。
            </p>
          </div>
          <div className="flex items-start gap-2">
            <DoorOpen className="mt-0.5 h-4 w-4 shrink-0 text-[#ffe46b]" />
            <p>
              CPUより先にゴールすれば<span className="font-bold text-[#ffe46b]">クリア</span>。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function StartScreen({
  difficulty,
  selectedSkill,
  onDifficultyChange,
  onSkillChange,
  onStart,
  onTutorial,
}: Props) {
  const [rulesOpen, setRulesOpen] = useState(false);
  const closeRules = useCallback(() => setRulesOpen(false), []);
  const preset = DIFFICULTY_PRESETS[difficulty];

  return (
    <>
      <div className="start-screen fixed inset-0 z-50 flex h-[100vh] max-h-[100vh] flex-col overflow-hidden bg-[#0c1020]/92 backdrop-blur-sm">
        <div className="start-screen-inner mx-auto flex h-full w-full max-w-[720px] flex-col justify-between gap-2 px-3 py-2 sm:gap-3 sm:px-4 sm:py-3">
          {/* Header */}
          <div className="start-screen-header flex shrink-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Book className="h-10 w-10 shrink-0 text-[#3bd4ff] sm:h-12 sm:w-12" />
                <h1
                  className="text-[1.75rem] font-black leading-tight tracking-tight sm:text-[2.25rem]"
                  style={{ fontFamily: '"Press Start 2P", monospace' }}
                >
                  <span className="text-[#ffe46b]">LIBRARY</span>{' '}
                  <span className="text-[#e8ecff]">PICKER</span>
                </h1>
              </div>
              <p className="mt-0.5 text-[10px] text-[#9fb0d8] sm:text-xs">
                図書館倉庫ピッキング・レース / 1人 vs CPU
              </p>
            </div>
            <button
              type="button"
              onClick={() => setRulesOpen(true)}
              className="shrink-0 rounded-lg border border-[#2a3a5d] bg-[#0c1530] px-2.5 py-1.5 text-[10px] font-bold text-[#9fb0d8] transition hover:border-[#3bd4ff]/50 hover:text-[#e8ecff] sm:px-3 sm:text-xs"
            >
              ❓ ルール
            </button>
          </div>

          {/* Options: 2 columns */}
          <div className="start-screen-options grid min-h-0 shrink grid-cols-2 gap-2 sm:gap-3">
            {/* Difficulty */}
            <div className="start-panel flex min-h-0 flex-col rounded-xl border border-[#2a3a5d] bg-[#0c1530] p-2 sm:p-3">
              <p className="mb-1.5 shrink-0 text-[10px] font-bold text-[#cfe0ff] sm:text-xs">
                CPU難易度
              </p>
              <div className="grid min-h-0 flex-1 grid-cols-3 gap-1 sm:gap-1.5">
                {DIFFICULTIES.map((d) => {
                  const p = DIFFICULTY_PRESETS[d];
                  const active = d === difficulty;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => onDifficultyChange(d)}
                      className={`rounded-md border px-1 py-1.5 text-center transition sm:py-2 ${
                        active
                          ? 'border-[#3bd4ff] bg-[#3bd4ff]/15 text-[#3bd4ff]'
                          : 'border-[#2a3a5d] bg-[#121a33] text-[#9fb0d8] hover:border-[#3a4a6d]'
                      }`}
                    >
                      <span
                        className="block text-[8px] font-black leading-tight sm:text-[10px]"
                        style={{ fontFamily: '"Press Start 2P", monospace' }}
                      >
                        {p.label}
                      </span>
                      <span className="mt-0.5 block text-[9px] font-bold sm:text-[10px]">
                        {p.shortLabel}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 line-clamp-2 shrink-0 text-[9px] leading-snug text-[#9fb0d8] sm:text-[10px]">
                {preset.description}
              </p>
            </div>

            {/* Skills */}
            <div className="start-panel flex min-h-0 flex-col rounded-xl border border-[#2a3a5d] bg-[#0c1530] p-2 sm:p-3">
              <p className="mb-1.5 shrink-0 text-[10px] font-bold text-[#cfe0ff] sm:text-xs">
                スキル選択
              </p>
              <div className="flex min-h-0 flex-1 flex-col gap-1 sm:gap-1.5">
                {SKILL_TYPES.map((skill) => {
                  const def = SKILL_DEFINITIONS[skill];
                  const Icon = SKILL_ICONS[skill];
                  const active = skill === selectedSkill;
                  return (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => onSkillChange(skill)}
                      className={`flex min-h-0 flex-1 items-center gap-1.5 rounded-md border px-2 py-1 text-left transition sm:gap-2 sm:px-2.5 sm:py-1.5 ${
                        active
                          ? 'border-[#ffe46b] bg-[#ffe46b]/10 text-[#ffe46b]'
                          : 'border-[#2a3a5d] bg-[#121a33] text-[#9fb0d8] hover:border-[#3a4a6d]'
                      }`}
                    >
                      <Icon
                        className={`h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4 ${active ? 'text-[#ffe46b]' : 'text-[#9fb0d8]'}`}
                      />
                      <span className="min-w-0">
                        <span className="block text-[10px] font-black leading-tight sm:text-xs">
                          {def.label}
                        </span>
                        <span className="hidden text-[9px] leading-snug opacity-90 sm:block sm:text-[10px]">
                          {def.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Footer: controls + actions */}
          <div className="start-screen-footer flex shrink-0 flex-col items-center gap-2">
            <p className="start-screen-controls max-w-[640px] text-center text-[9px] leading-snug text-[#5a6a8d] sm:text-[10px]">
              PC: 矢印/WASD 移動 · Shift=スキル / スマホ: Dパッド+スキルボタン
              <br />
              ピック: 光る本棚の方向キーを長押し（約2.5秒）
            </p>
            <div className="flex w-full max-w-[420px] items-center justify-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={onTutorial}
                className="flex-1 rounded-lg border border-[#ffe46b]/50 bg-[#ffe46b]/10 px-3 py-2 text-[10px] font-black text-[#ffe46b] transition hover:bg-[#ffe46b]/20 sm:px-5 sm:py-2.5 sm:text-xs"
                style={{ fontFamily: '"Press Start 2P", monospace' }}
              >
                チュートリアル
              </button>
              <button
                type="button"
                onClick={onStart}
                className="flex-1 rounded-lg bg-[#3bd4ff] px-3 py-2 text-[10px] font-black text-[#0c1020] shadow-[0_0_20px_rgba(59,212,255,0.5)] transition hover:bg-[#5fdfff] sm:px-5 sm:py-2.5 sm:text-xs"
                style={{ fontFamily: '"Press Start 2P", monospace' }}
              >
                スタート
              </button>
            </div>
          </div>
        </div>
      </div>

      {rulesOpen && <RulesModal onClose={closeRules} />}
    </>
  );
}
