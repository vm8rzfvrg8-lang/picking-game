import { Cpu, User } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { GameState, RIVAL_PALETTE } from '../game/constants';
import { getDifficultyConfig } from '../game/difficulty';
import { isGoalCell } from '../game/levelgen';

type GoalStatus = 'playing' | 'to-goal' | 'at-goal';

interface LeaderboardEntry {
  id: string;
  name: string;
  isPlayer: boolean;
  picked: number;
  total: number;
  accent: string;
  accentMuted: string;
  Icon: LucideIcon;
  badge?: string;
  goalStatus: GoalStatus;
}

function getGoalStatus(
  picked: number,
  total: number,
  atGoal: boolean,
  headingToGoal: boolean,
): GoalStatus {
  if (atGoal) return 'at-goal';
  if (picked >= total && headingToGoal) return 'to-goal';
  return 'playing';
}

function buildEntries(game: GameState): LeaderboardEntry[] {
  const playerTotal = game.targets.length;
  const playerPicked = game.currentTarget;
  const playerAllPicked = playerPicked >= playerTotal;
  const playerAtGoal =
    playerAllPicked && isGoalCell(game.grid, game.player.x, game.player.y);

  const cpuLabel = getDifficultyConfig(game.difficulty).shortLabel;

  const entries: LeaderboardEntry[] = [
    {
      id: 'player',
      name: 'あなた',
      isPlayer: true,
      picked: playerPicked,
      total: playerTotal,
      accent: '#3bd4ff',
      accentMuted: 'rgba(59,212,255,0.2)',
      Icon: User,
      goalStatus: getGoalStatus(
        playerPicked,
        playerTotal,
        playerAtGoal,
        playerAllPicked,
      ),
    },
    ...game.rivals.map((rival) => {
      const rivalTotal = rival.targets.length;
      const rivalPicked = rival.currentTarget;
      const rivalAllPicked = rivalPicked >= rivalTotal;
      const rivalAtGoal =
        rivalAllPicked && isGoalCell(game.grid, rival.x, rival.y);
      const palette = RIVAL_PALETTE[rival.id % RIVAL_PALETTE.length];
      return {
        id: `rival-${rival.id}`,
        name: game.rivals.length > 1 ? `CPU${rival.id + 1}` : 'CPU',
        isPlayer: false,
        picked: rivalPicked,
        total: rivalTotal,
        accent: palette.body,
        accentMuted: `${palette.body}33`,
        Icon: Cpu,
        badge: cpuLabel,
        goalStatus: getGoalStatus(
          rivalPicked,
          rivalTotal,
          rivalAtGoal,
          rivalAllPicked || rival.reachedGoal,
        ),
      };
    }),
  ];

  return entries;
}

function rankScore(entry: LeaderboardEntry): number {
  const goalBonus =
    entry.goalStatus === 'at-goal' ? 1000 : entry.goalStatus === 'to-goal' ? 500 : 0;
  return goalBonus + entry.picked * 10;
}

function sortEntries(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  return [...entries].sort((a, b) => {
    const diff = rankScore(b) - rankScore(a);
    if (diff !== 0) return diff;
    if (a.isPlayer !== b.isPlayer) return a.isPlayer ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}

interface Props {
  game: GameState;
}

export function LeaderboardSidebar({ game }: Props) {
  const ranked = sortEntries(buildEntries(game));

  return (
    <aside
      className="game-ranking-sidebar flex shrink-0 flex-col overflow-hidden rounded-md border border-[#2a3a5d]/80 bg-[#0c1530]/92 backdrop-blur-sm"
      aria-label="スコアボード"
    >
      <div className="shrink-0 border-b border-[#1a2a4d] px-1.5 py-0.5">
        <p className="text-[7px] font-bold tracking-wider text-[#9fb0d8]">RANKING</p>
      </div>
      <ol className="flex flex-col gap-px overflow-y-auto p-0.5">
        {ranked.map((entry, index) => (
          <LeaderboardRow key={entry.id} rank={index + 1} entry={entry} />
        ))}
      </ol>
    </aside>
  );
}

function LeaderboardRow({ rank, entry }: { rank: number; entry: LeaderboardEntry }) {
  const { picked, total, accent, Icon, name, badge, goalStatus, isPlayer } = entry;
  const statusLabel =
    goalStatus === 'at-goal' ? 'G' : goalStatus === 'to-goal' ? '→' : null;

  return (
    <li
      className={`leaderboard-row rounded border px-1 py-0.5 ${
        isPlayer ? 'border-[#3bd4ff]/35 bg-[#3bd4ff]/8' : 'border-[#2a3a5d]/50 bg-[#121a33]/80'
      }`}
    >
      <div className="flex items-center gap-0.5 leading-none">
        <span
          className="w-2.5 shrink-0 text-[7px] font-black tabular-nums text-[#5a6a8d]"
          style={{ fontFamily: '"Press Start 2P", monospace' }}
        >
          {rank}
        </span>
        <Icon className="h-2.5 w-2.5 shrink-0" style={{ color: accent }} />
        <span
          className="min-w-0 flex-1 truncate text-[8px] font-bold"
          style={{ color: accent }}
        >
          {name}
        </span>
        {badge && (
          <span
            className="shrink-0 rounded px-0.5 text-[6px] font-bold leading-none"
            style={{ color: accent, backgroundColor: entry.accentMuted }}
          >
            {badge}
          </span>
        )}
        {statusLabel && (
          <span
            className="shrink-0 text-[7px] font-black leading-none"
            style={{ color: goalStatus === 'at-goal' ? '#ffe46b' : accent }}
          >
            {statusLabel}
          </span>
        )}
        <span
          className="shrink-0 text-[7px] font-black tabular-nums leading-none"
          style={{ fontFamily: '"Press Start 2P", monospace', color: accent }}
        >
          {picked}/{total}
        </span>
      </div>
      <div className="mt-0.5 flex items-center gap-px pl-3">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={`leaderboard-block h-1 min-w-[0.2rem] flex-1 rounded-[1px] ${
              i < picked ? '' : i === picked ? 'animate-pulse' : 'bg-[#1a2a4d]'
            }`}
            style={
              i < picked
                ? { backgroundColor: accent }
                : i === picked
                  ? { backgroundColor: `${accent}99` }
                  : undefined
            }
          />
        ))}
      </div>
    </li>
  );
}
