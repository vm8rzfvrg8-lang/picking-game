import { Shield, WifiOff, Zap } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { GameState } from '../game/constants';
import {
  getActiveSkillDuration,
  getSkillDefinition,
  getSkillGaugeRatio,
  isSkillEffectActive,
  isSkillReady,
  SKILL_GAUGE_FILL_MS,
  SkillType,
  type SkillState,
} from '../game/skills';

interface Props {
  selectedSkill: SkillType;
  skills: SkillState;
  game?: GameState;
  onUse: () => void;
  /** Canvas外・右下ドック配置（コンパクト） */
  docked?: boolean;
}

const SKILL_ICONS: Record<SkillType, LucideIcon> = {
  [SkillType.SuperSpeed]: Zap,
  [SkillType.PushThrough]: Shield,
  [SkillType.JamSignal]: WifiOff,
};

const SKILL_THEME: Record<SkillType, { ready: string; fill: string; glow: string }> = {
  [SkillType.SuperSpeed]: {
    ready: 'border-[#3bd4ff] text-[#3bd4ff] shadow-[0_0_20px_rgba(59,212,255,0.45)]',
    fill: 'bg-[#3bd4ff]',
    glow: 'bg-[#3bd4ff]/25',
  },
  [SkillType.PushThrough]: {
    ready: 'border-[#ff5a5a] text-[#ff8a80] shadow-[0_0_20px_rgba(255,90,90,0.45)]',
    fill: 'bg-[#ff5a5a]',
    glow: 'bg-[#ff5a5a]/25',
  },
  [SkillType.JamSignal]: {
    ready: 'border-[#a06aff] text-[#c89bff] shadow-[0_0_20px_rgba(160,106,255,0.45)]',
    fill: 'bg-[#a06aff]',
    glow: 'bg-[#a06aff]/25',
  },
};

export function SkillButton({ selectedSkill, skills, game, onUse, docked = false }: Props) {
  const def = getSkillDefinition(selectedSkill);
  const theme = SKILL_THEME[selectedSkill];
  const Icon = SKILL_ICONS[selectedSkill];
  const active = isSkillEffectActive(skills, game);
  const ready = isSkillReady(skills, game);
  const gaugeRatio = getSkillGaugeRatio(skills);
  const gaugePercent = Math.round(gaugeRatio * 100);
  const disabled = !ready;
  const activeDuration = getActiveSkillDuration(skills);
  const activeProgress =
    active && activeDuration > 0 ? 1 - skills.activeRemainingMs / activeDuration : 0;

  const statusText = active
    ? selectedSkill === SkillType.SuperSpeed
      ? '疾走中!'
      : selectedSkill === SkillType.PushThrough
        ? '威圧中!'
        : '発動!'
    : ready
      ? 'READY!'
      : `${gaugePercent}% (${Math.ceil((SKILL_GAUGE_FILL_MS - skills.gaugeMs) / 1000)}s)`;

  const btnSize = docked ? 'h-14 w-14 sm:h-16 sm:w-16' : 'h-[4.5rem] w-[4.5rem] sm:h-20 sm:w-20';
  const iconSize = docked ? 'h-5 w-5 sm:h-5 sm:w-5' : 'h-7 w-7 sm:h-8 sm:w-8';
  const labelSize = docked ? 'text-[6px] sm:text-[7px]' : 'text-[8px] sm:text-[9px]';

  return (
    <div className={`skill-button flex flex-col items-center ${docked ? 'skill-button--docked gap-0.5' : 'gap-1.5'}`}>
      <button
        type="button"
        onPointerDown={(e) => {
          e.preventDefault();
          if (disabled) return;
          onUse();
        }}
        disabled={disabled}
        aria-label={`スキル：${def.label}（ゲージ ${gaugePercent}%）`}
        className={`relative flex ${btnSize} flex-col items-center justify-center overflow-hidden rounded-full border-2 select-none transition ${
          ready
            ? `${theme.ready} bg-black/30 active:scale-95`
            : 'cursor-not-allowed border-white/15 bg-black/20 text-white/45'
        } ${active ? 'animate-pulse' : ''}`}
        style={{ touchAction: 'manipulation' }}
        onClick={(e) => {
          e.preventDefault();
          if (disabled) return;
          onUse();
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {!active && (
          <div
            className={`pointer-events-none absolute inset-x-0 bottom-0 transition-[height] duration-100 ${theme.glow}`}
            style={{ height: `${gaugeRatio * 100}%` }}
          />
        )}

        {!active && (
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full -rotate-90"
            viewBox="0 0 80 80"
            aria-hidden
          >
            <circle
              cx="40"
              cy="40"
              r="36"
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="3"
            />
            <circle
              cx="40"
              cy="40"
              r="36"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 36}`}
              strokeDashoffset={`${2 * Math.PI * 36 * (1 - gaugeRatio)}`}
              opacity={ready ? 1 : 0.7}
            />
          </svg>
        )}

        {active && activeDuration > 0 && (
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full -rotate-90"
            viewBox="0 0 80 80"
            aria-hidden
          >
            <circle
              cx="40"
              cy="40"
              r="36"
              fill="none"
              stroke="rgba(255,228,107,0.2)"
              strokeWidth="3"
            />
            <circle
              cx="40"
              cy="40"
              r="36"
              fill="none"
              stroke="#ffe46b"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 36}`}
              strokeDashoffset={`${2 * Math.PI * 36 * (1 - activeProgress)}`}
            />
          </svg>
        )}

        <Icon className={`relative z-10 ${iconSize} ${ready ? '' : 'opacity-60'}`} />
        <span
          className={`relative z-10 mt-0.5 max-w-[3.5rem] truncate font-black ${labelSize}`}
          style={{ fontFamily: '"Press Start 2P", monospace' }}
        >
          {def.label}
        </span>
      </button>

      {!docked && (
        <div className="w-[4.5rem] sm:w-20">
          <div className="h-1.5 overflow-hidden rounded-full bg-[#1a2a4d]">
            <div
              className={`h-full rounded-full transition-[width] duration-100 ${
                ready ? theme.fill : active ? 'bg-[#ffe46b]' : theme.fill
              }`}
              style={{ width: `${active && activeDuration > 0 ? activeProgress * 100 : gaugeRatio * 100}%` }}
            />
          </div>
          <p className="mt-1 text-center text-[10px] font-bold text-[#9fb0d8]">{statusText}</p>
        </div>
      )}
      {docked && (
        <p className="max-w-[3.5rem] truncate text-center text-[7px] font-bold text-[#9fb0d8]">
          {ready ? 'READY' : active ? 'ON' : `${gaugePercent}%`}
        </p>
      )}
    </div>
  );
}
