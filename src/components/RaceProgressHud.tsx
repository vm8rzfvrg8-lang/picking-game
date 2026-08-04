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

interface Props {
  game: GameState;
}

export function RaceProgressHud({ game }: Props) {
  const markers = buildMarkers(game);
  const goalCount = game.pickCount;

  return (
    <div className="game-race-hud" aria-label="コース進行状況">
      <div className="game-race-hud-track">
        <div className="game-race-hud-endcap game-race-hud-endcap--start" aria-hidden="true">
          S
        </div>
        <div className="game-race-hud-bar-wrap">
          <div className="game-race-hud-bar" />
          <div className="game-race-hud-markers">
            {markers.map((m) => (
              <div
                key={m.id}
                className={m.isPlayer ? 'race-marker race-marker--player' : 'race-marker'}
                style={{ left: `${m.progress * 100}%` }}
              >
                <span className="race-marker-score">
                  {m.isPlayer ? `${m.score}/${goalCount}` : m.score}
                </span>
                <div
                  className="race-marker-icon-wrap"
                  style={m.isPlayer ? undefined : { borderColor: m.color }}
                >
                  {m.isPlayer ? (
                    <User className="race-marker-icon race-marker-icon--player" />
                  ) : (
                    <Cpu className="race-marker-icon" style={{ color: m.color }} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="game-race-hud-endcap game-race-hud-endcap--goal" aria-hidden="true">
          G
        </div>
      </div>
    </div>
  );
}
