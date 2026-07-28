import { CheckCircle2, LogOut, Sparkles } from 'lucide-react';
import type { TutorialSnapshot } from '../game/tutorial/types';

interface Props {
  snapshot: TutorialSnapshot;
  onQuit: () => void;
}

export function TutorialScene({ snapshot, onQuit }: Props) {
  const {
    currentStep,
    totalSteps,
    steps,
    phase,
    transitionProgress,
    instructionText,
    isComplete,
    stepProgress,
    currentSubStep,
    clearedSubStep,
    completionMessage,
  } = snapshot;
  const clearedStep = phase === 'transitioning' && !clearedSubStep ? currentStep : null;
  const showStep5Clear = phase === 'transitioning' && clearedSubStep !== null;
  const stepLabel =
    currentStep === 5 && currentSubStep
      ? `チュートリアル ${currentStep}/${totalSteps} — 課題 ${currentSubStep}/3`
      : `チュートリアル ${currentStep}/${totalSteps}`;

  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex flex-col">
      {/* Top instruction bar */}
      <div className="pointer-events-auto mx-2 mt-2 rounded-xl border border-[#ffe46b]/40 bg-[#121a33]/95 px-3 py-2.5 shadow-[0_0_20px_rgba(255,228,107,0.15)] sm:mx-3 sm:px-4 sm:py-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span
            className="text-[10px] font-black text-[#ffe46b] sm:text-xs"
            style={{ fontFamily: '"Press Start 2P", monospace' }}
          >
            {stepLabel}
          </span>
          <button
            type="button"
            onClick={onQuit}
            className="flex items-center gap-1 rounded-md border border-[#2a3a5d] bg-[#0c1530] px-2 py-1 text-[10px] font-bold text-[#9fb0d8] transition hover:bg-[#1a2a4d] hover:text-[#e8ecff] sm:text-xs"
          >
            <LogOut className="h-3 w-3 shrink-0" />
            Quit
          </button>
        </div>

        <div className="mb-2 flex items-center justify-center gap-1.5 sm:gap-2">
          {steps.map((s) => (
            <span
              key={s.step}
              className={`h-2 w-8 rounded-full transition sm:w-10 ${
                s.cleared
                  ? 'bg-[#3bd4ff]'
                  : s.step === currentStep
                    ? 'bg-[#ffe46b] animate-pulse'
                    : 'bg-[#1a2a4d]'
              }`}
            />
          ))}
        </div>

        {currentStep === 5 && currentSubStep && phase === 'active' && (
          <div className="mb-2 flex justify-center gap-1.5">
            {[1, 2, 3].map((n) => (
              <span
                key={n}
                className={`h-1.5 w-6 rounded-full sm:w-8 ${
                  n < currentSubStep
                    ? 'bg-[#3bd4ff]'
                    : n === currentSubStep
                      ? 'bg-[#ffe46b] animate-pulse'
                      : 'bg-[#1a2a4d]'
                }`}
              />
            ))}
          </div>
        )}

        <p className="text-center text-xs font-bold leading-relaxed text-[#e8ecff] sm:text-sm">
          {instructionText}
        </p>

        {stepProgress && (phase === 'active' || phase === 'clearPending') && (
          <p className="mt-2 text-center text-[11px] font-black text-[#3bd4ff] sm:text-xs">
            {stepProgress.label}：あと {stepProgress.remaining} 回！（{stepProgress.done}/
            {stepProgress.total}）
          </p>
        )}

        {phase === 'clearPending' && currentStep !== 5 && (
          <p className="mt-1 text-center text-[11px] font-bold text-[#9fb0d8] sm:text-xs">
            ノックバック演出を待っています…
          </p>
        )}
      </div>

      {/* Step clear transition (steps 1–4) */}
      {showStep5Clear === false && phase === 'transitioning' && clearedStep !== null && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0c1020]/60 backdrop-blur-[2px]">
          <div className="mx-4 w-full max-w-sm rounded-2xl border-2 border-[#3bd4ff]/50 bg-[#121a33] p-5 text-center shadow-[0_0_30px_rgba(59,212,255,0.3)]">
            <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-[#3bd4ff]" />
            <p
              className="mb-3 text-sm font-black text-[#3bd4ff] sm:text-base"
              style={{ fontFamily: '"Press Start 2P", monospace' }}
            >
              STEP {clearedStep} CLEAR!
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-[#1a2a4d]">
              <div
                className="h-full rounded-full bg-[#3bd4ff] transition-[width] duration-75"
                style={{ width: `${transitionProgress * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Step 5 sub-step clear */}
      {showStep5Clear && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0c1020]/60 backdrop-blur-[2px]">
          <div className="mx-4 w-full max-w-sm rounded-2xl border-2 border-[#3bd4ff]/50 bg-[#121a33] p-5 text-center shadow-[0_0_30px_rgba(59,212,255,0.3)]">
            <CheckCircle2 className="mx-auto mb-2 h-10 w-10 text-[#3bd4ff]" />
            <p
              className="mb-3 text-sm font-black text-[#3bd4ff] sm:text-base"
              style={{ fontFamily: '"Press Start 2P", monospace' }}
            >
              課題{clearedSubStep} Clear!
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-[#1a2a4d]">
              <div
                className="h-full rounded-full bg-[#3bd4ff] transition-[width] duration-75"
                style={{ width: `${transitionProgress * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Tutorial complete */}
      {isComplete && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0c1020]/75 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-2xl border-2 border-[#ffe46b]/60 bg-[#121a33] p-6 text-center shadow-[0_0_40px_rgba(255,228,107,0.35)]">
            <Sparkles className="mx-auto mb-3 h-12 w-12 text-[#ffe46b]" />
            <p
              className="text-base font-black leading-relaxed text-[#ffe46b] sm:text-lg"
              style={{ fontFamily: '"Press Start 2P", monospace' }}
            >
              チュートリアル完了！
            </p>
            <p className="mt-3 text-xs leading-relaxed text-[#9fb0d8] sm:text-sm">
              {completionMessage ?? 'スタート画面に戻ります…'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
