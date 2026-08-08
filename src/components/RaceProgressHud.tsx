import { Cpu, User } from 'lucide-react';
import { GameState, PALETTE, RIVAL_PALETTE } from '../game/constants';
import { courseProgressAt } from '../game/courseProgress';
import { isGoalCell } from '../game/levelgen';

interface RacerMarker {
  id: string;
  progress: number;
  score: number;
  isPlayer: boolean;
  color: string;
  rivalIndex?: number;
}

function buildMarkers(game: GameState): RacerMarker[] {
  const goalCount = game.pickCount;
  const playerAtGoal =
    game.currentTarget >= goalCount &&
    isGoalCell(game.grid, game.player.x, game.player.y);

  const markers: RacerMarker[] = [
    {
      id: 'player',
      progress: courseProgressAt(game.grid, game.player.x, game.player.y, playerAtGoal),
      score: game.currentTarget,
      isPlayer: true,
      color: PALETTE.uiBlue,
    },
    ...game.rivals.map((rival) => {
      const atGoal =
        rival.reachedGoal ||
        (rival.currentTarget >= goalCount &&
          isGoalCell(game.grid, rival.x, rival.y));
      const palette = RIVAL_PALETTE[rival.id % RIVAL_PALETTE.length];
      return {
        id: `cpu-${rival.id}`,
        progress: courseProgressAt(game.grid, rival.x, rival.y, atGoal),
        score: rival.currentTarget,
        isPlayer: false,
        color: palette.body,
        rivalIndex: rival.id,
      };
    }),
  ];

  return markers.sort((a, b) => {
    if (Math.abs(a.progress - b.progress) > 0.001) return a.progress - b.progress;
    return a.isPlayer ? 1 : -1;
  });
}

function progressLeft(progress: number): { left: string } {
  return { left: `${progress * 100}%` };
}

/** Back layer — trapezoid tab only (follows player X). */
function PlayerProgressTab({ progress }: { progress: number }) {
  return (
    <div className="race-marker-anchor race-player-tab-anchor" style={progressLeft(progress)}>
      <div className="race-marker-player-tab">
        <svg
          className="race-marker-player-tab-svg"
          viewBox="0 0 100 44"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <polygon points="0,0 100,0 76,44 24,44" fill="#000000" />
        </svg>
      </div>
    </div>
  );
}

/** Front layer — player score (follows player X). */
function PlayerProgressScore({
  progress,
  score,
  goalCount,
}: {
  progress: number;
  score: number;
  goalCount: number;
}) {
  return (
    <div className="race-marker-anchor race-player-score-anchor" style={progressLeft(progress)}>
      <span className="race-marker-score--player">
        {score}/{goalCount}
      </span>
    </div>
  );
}

/** Frontmost layer — player icon center on bar axis. */
function PlayerProgressIcon({ progress }: { progress: number }) {
  return (
    <div className="race-marker-anchor race-player-icon-anchor" style={progressLeft(progress)}>
      <div className="race-marker-icon-wrap race-marker-icon-wrap--player">
        <User className="race-marker-icon race-marker-icon--player" />
      </div>
    </div>
  );
}

/** Rival icon center on bar axis; score hangs below. */
function RivalProgressMarker({ marker, stackOrder }: { marker: RacerMarker; stackOrder: number }) {
  return (
    <div
      className="race-marker-anchor race-marker-group--rival"
      style={{ ...progressLeft(marker.progress), zIndex: stackOrder }}
    >
      <div className="race-marker-icon-wrap" style={{ borderColor: marker.color }}>
        <Cpu className="race-marker-icon" style={{ color: marker.color }} />
      </div>
      <span className="race-marker-score">{marker.score}</span>
    </div>
  );
}

interface Props {
  game: GameState;
}

export function RaceProgressHud({ game }: Props) {
  const markers = buildMarkers(game);
  const goalCount = game.pickCount;
  const rivals = markers.filter((m) => !m.isPlayer);
  const player = markers.find((m) => m.isPlayer);

  return (
    <div className="game-race-hud" aria-label="コース進行状況">
      <div className="game-race-hud-track">
        <div className="game-race-hud-endcap game-race-hud-endcap--start" aria-hidden="true">
          S
        </div>
        <div className="game-race-hud-bar-wrap">
          <div className="game-race-hud-layer game-race-hud-layer--back">
            <div className="game-race-hud-bar" />
            {player && <PlayerProgressTab progress={player.progress} />}
          </div>
          <div className="game-race-hud-layer game-race-hud-layer--front">
            <div className="game-race-hud-marker-layer game-race-hud-marker-layer--rivals">
              {rivals.map((m, i) => (
                <RivalProgressMarker key={m.id} marker={m} stackOrder={i + 1} />
              ))}
            </div>
            {player && (
              <>
                <div className="game-race-hud-marker-layer game-race-hud-marker-layer--player-score">
                  <PlayerProgressScore
                    progress={player.progress}
                    score={player.score}
                    goalCount={goalCount}
                  />
                </div>
                <div className="game-race-hud-marker-layer game-race-hud-marker-layer--player-icon">
                  <PlayerProgressIcon progress={player.progress} />
                </div>
              </>
            )}
          </div>
        </div>
        <div className="game-race-hud-endcap game-race-hud-endcap--goal" aria-hidden="true">
          G
        </div>
      </div>
    </div>
  );
}
