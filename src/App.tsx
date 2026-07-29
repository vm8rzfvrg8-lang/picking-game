import { useCallback, useEffect, useRef, useState } from 'react';
import { GameState, GRID_H, GRID_W, TILE, DEFAULT_CPU_COUNT } from './game/constants';
import { Difficulty } from './game/difficulty';
import { Direction, Input, isPickInput, newGame, startPlaying, enterTutorial, returnToStart, step } from './game/engine';
import {
  render,
  drawCharacterAt,
  drawPickGaugeAt,
  drawCollisionFxAt,
  eraseFloorCell,
} from './game/renderer';
import { sfx, setMuted, unlockAudio, playSkillSfx } from './game/sound';
import { useKeyboardInput } from './hooks/useKeyboardInput';
import { useAnimationFrame } from './hooks/useAnimationFrame';
import { StartScreen } from './components/StartScreen';
import { TutorialScene } from './components/TutorialScene';
import { GameplayTopBar } from './components/GameplayTopBar';
import { LeaderboardSidebar } from './components/LeaderboardSidebar';
import { SkillButton } from './components/SkillButton';
import { MobileControls } from './components/MobileControls';
import { ResultOverlay } from './components/ResultOverlay';
import { PortraitOrientationLock } from './components/PortraitOrientationLock';
import { useTutorialManager } from './hooks/useTutorialManager';
import { applyTutorialEvents, createTutorialStats, resetStep5Stats } from './game/tutorial/types';
import { applyTutorialStepLayout } from './game/tutorial/layout';
import {
  getSuperSpeedMoveCooldown,
  isSkillReady,
  isSuperSpeedActive,
  isPushThroughActive,
  SkillType,
} from './game/skills';
import type { TutorialCallback, TutorialPhase } from './game/tutorial/types';
import { lerp } from './game/anim';
import {
  createVfx,
  drawVfx,
  drawTrailMarks,
  drawSkillBurst,
  getShakeOffset,
  resetVfx,
  triggerCollisionShake,
  triggerGoalUnlock,
  triggerPickComplete,
  triggerSkillActivate,
  triggerTrailMark,
  triggerWinBurst,
  updateVfx,
  type VfxState,
} from './game/vfx';

const PLAYER_COOLDOWN_MS = 130;

function syncRivalVisuals(
  refs: React.MutableRefObject<Record<number, { x: number; y: number }>>,
  game: GameState,
) {
  for (const rival of game.rivals) {
    if (!refs.current[rival.id]) {
      refs.current[rival.id] = { x: rival.x, y: rival.y };
    }
  }
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const kbRef = useKeyboardInput();

  const [game, setGame] = useState<GameState>(() =>
    newGame(undefined, 'normal', SkillType.SuperSpeed, DEFAULT_CPU_COUNT),
  );
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [cpuCount, setCpuCount] = useState(DEFAULT_CPU_COUNT);
  const [selectedSkill, setSelectedSkill] = useState<SkillType>(SkillType.SuperSpeed);
  const gameRef = useRef(game);
  gameRef.current = game;

  const [muted, setMutedState] = useState(false);
  const mutedRef = useRef(false);
  mutedRef.current = muted;

  // Visual interpolated positions (grid units)
  const playerVisualRef = useRef({ x: game.player.x, y: game.player.y });
  const rivalVisualRefs = useRef<Record<number, { x: number; y: number }>>({});

  // Player move cooldown accumulator
  const moveCdRef = useRef(0);
  const blinkRef = useRef(0);
  const vfxRef = useRef<VfxState>(createVfx());
  const goalFxDoneRef = useRef(false);
  const skillUseRef = useRef(false);

  // Current effective input (keyboard OR touch)
  const touchDirRef = useRef<Direction | null>(null);
  const tutorialStatsRef = useRef(createTutorialStats());
  const tutorialPhaseRef = useRef<TutorialPhase>('active');

  const quitTutorial = useCallback(() => {
    const g = returnToStart(gameRef.current);
    gameRef.current = g;
    playerVisualRef.current = { x: g.player.x, y: g.player.y };
    rivalVisualRefs.current = {};
    syncRivalVisuals(rivalVisualRefs, g);
    moveCdRef.current = 0;
    touchDirRef.current = null;
    tutorialStatsRef.current = createTutorialStats();
    resetVfx(vfxRef.current);
    goalFxDoneRef.current = false;
    setGame(g);
  }, []);

  const { snapshot: tutorialSnapshot, reset: resetTutorialManager, start: startTutorial, tick: tickTutorial } =
    useTutorialManager(quitTutorial);
  tutorialPhaseRef.current = tutorialSnapshot.phase;

  const applyTutorialLayout = useCallback((callbacks: TutorialCallback[]) => {
    for (const cb of callbacks) {
      if (cb.type === 'subStepStarted') {
        tutorialStatsRef.current = resetStep5Stats(tutorialStatsRef.current, cb.subStep);
        touchDirRef.current = null;
        moveCdRef.current = 0;
        kbRef.current.dir = null;
        const g = applyTutorialStepLayout(gameRef.current, cb.step, cb.subStep);
        gameRef.current = g;
        playerVisualRef.current = { x: g.player.x, y: g.player.y };
        rivalVisualRefs.current = {};
        syncRivalVisuals(rivalVisualRefs, g);
        setGame(g);
        continue;
      }
      if (cb.type !== 'stepStarted') continue;
      if (cb.step === 5) continue;
      tutorialStatsRef.current = createTutorialStats();
      touchDirRef.current = null;
      moveCdRef.current = 0;
      kbRef.current.dir = null;
      const g = applyTutorialStepLayout(gameRef.current, cb.step);
      gameRef.current = g;
      playerVisualRef.current = { x: g.player.x, y: g.player.y };
      rivalVisualRefs.current = {};
      syncRivalVisuals(rivalVisualRefs, g);
      setGame(g);
    }
  }, []);

  const resetGame = useCallback(() => {
    const g = newGame(undefined, difficulty, selectedSkill, cpuCount);
    setGame(g);
    gameRef.current = g;
    playerVisualRef.current = { x: g.player.x, y: g.player.y };
    rivalVisualRefs.current = {};
    syncRivalVisuals(rivalVisualRefs, g);
    moveCdRef.current = 0;
    touchDirRef.current = null;
    resetVfx(vfxRef.current);
    goalFxDoneRef.current = false;
  }, [difficulty, selectedSkill, cpuCount]);

  const beginTutorial = useCallback(() => {
    unlockAudio();
    tutorialStatsRef.current = createTutorialStats();
    const startCallbacks = startTutorial();
    const g = enterTutorial(newGame(undefined, difficulty, selectedSkill, 1));
    gameRef.current = g;
    moveCdRef.current = 0;
    resetVfx(vfxRef.current);
    goalFxDoneRef.current = false;
    applyTutorialLayout(startCallbacks);
  }, [difficulty, selectedSkill, startTutorial, applyTutorialLayout]);

  const handleQuitTutorial = useCallback(() => {
    resetTutorialManager();
    tutorialStatsRef.current = createTutorialStats();
    quitTutorial();
  }, [quitTutorial, resetTutorialManager]);

  const beginGame = useCallback(() => {
    unlockAudio();
    sfx.start();
    const g = startPlaying(newGame(undefined, difficulty, selectedSkill, cpuCount));
    gameRef.current = g;
    playerVisualRef.current = { x: g.player.x, y: g.player.y };
    rivalVisualRefs.current = {};
    syncRivalVisuals(rivalVisualRefs, g);
    moveCdRef.current = 0;
    resetVfx(vfxRef.current);
    goalFxDoneRef.current = false;
    setGame(g);
  }, [difficulty, selectedSkill, cpuCount]);

  const toggleMute = useCallback(() => {
    setMutedState((m) => {
      const nm = !m;
      setMuted(nm);
      return nm;
    });
  }, []);

  // --- Main loop ---
  useAnimationFrame(game.phase === 'playing' || game.phase === 'tutorial', (dt) => {
    const dtMs = dt * 1000;
    blinkRef.current += dt;
    const g = gameRef.current;
    const vfx = vfxRef.current;
    const isTutorial = g.phase === 'tutorial';
    const tutorialPhase = tutorialPhaseRef.current;
    const tutorialInputActive = !isTutorial || tutorialPhase === 'active';
    const tutorialSimActive =
      !isTutorial || tutorialPhase === 'active' || tutorialPhase === 'clearPending';
    updateVfx(
      vfx,
      dtMs,
      g.phase === 'playing' || (isTutorial && (tutorialInputActive || tutorialPhase === 'clearPending')),
    );

    // Smooth visual lerp toward logical positions
    const pv = playerVisualRef.current;
    const playerLerp = isSuperSpeedActive(g.skills) ? 24 : 16;
    pv.x = lerp(pv.x, g.player.x, Math.min(1, playerLerp * dt));
    pv.y = lerp(pv.y, g.player.y, Math.min(1, playerLerp * dt));
    for (const rival of g.rivals) {
      const rv = rivalVisualRefs.current[rival.id] ?? { x: rival.x, y: rival.y };
      rv.x = lerp(rv.x, rival.x, Math.min(1, 12 * dt));
      rv.y = lerp(rv.y, rival.y, Math.min(1, 12 * dt));
      rivalVisualRefs.current[rival.id] = rv;
    }

    if (g.phase === 'playing' || (isTutorial && tutorialSimActive)) {
      if (tutorialInputActive) {
        moveCdRef.current += dtMs;
      }

      const kb = kbRef.current;
      const dir = tutorialInputActive ? touchDirRef.current ?? kb.dir : null;
      const pick = tutorialInputActive ? isPickInput(g, dir) : false;
      const moveCooldown = getSuperSpeedMoveCooldown(PLAYER_COOLDOWN_MS, g.skills);

      const input: Input = { dir: null, pick, useSkill: skillUseRef.current };
      skillUseRef.current = false;
      if (
        tutorialInputActive &&
        !pick &&
        moveCdRef.current >= moveCooldown &&
        dir &&
        !g.isPicking &&
        g.player.stun === 0
      ) {
        input.dir = dir;
        moveCdRef.current = 0;
      }

      const res = step(g, input, dtMs);
      for (const ev of res.events) {
        if (ev.type === 'move') {
          triggerTrailMark(vfx, ev.fromX, ev.fromY, ev.dir);
          if (ev.who === 'player') sfx.move();
        } else if (ev.type === 'pickStart' && ev.who === 'player') sfx.start();
        else if (ev.type === 'pickDone' && ev.who === 'player') {
          sfx.pickup();
          const t = res.state.targets[ev.index];
          if (t) triggerPickComplete(vfx, t.x, t.y, 'player', ev.index);
        } else if (ev.type === 'pickDone' && ev.who === 'rival') {
          sfx.pickup();
          const rival =
            res.state.rivals.find((r) => r.id === ev.entityId) ?? res.state.rivals[0];
          const t = rival?.targets[ev.index];
          if (t) triggerPickComplete(vfx, t.x, t.y, 'rival', ev.index);
        } else if (ev.type === 'collision') {
          sfx.collision();
          triggerCollisionShake(vfx);
        } else if (ev.type === 'skillUsed') {
          playSkillSfx(ev.skill);
          triggerSkillActivate(
            vfxRef.current,
            ev.skill,
            res.state.player.x,
            res.state.player.y,
          );
        } else if (ev.type === 'win') {
          sfx.win();
          triggerWinBurst(vfx, res.state.player.x, res.state.player.y);
        } else if (ev.type === 'lose') sfx.bump();
      }
      if (
        res.state.currentTarget >= res.state.targets.length &&
        !goalFxDoneRef.current &&
        res.state.phase === 'playing'
      ) {
        triggerGoalUnlock(vfx, res.state.goals);
        goalFxDoneRef.current = true;
      }
      if (res.state !== g) {
        gameRef.current = res.state;
        setGame(res.state);
        if (res.events.some((e) => e.type === 'collision' || e.type === 'yield')) {
          playerVisualRef.current = {
            x: res.state.player.x,
            y: res.state.player.y,
          };
          for (const rival of res.state.rivals) {
            rivalVisualRefs.current[rival.id] = { x: rival.x, y: rival.y };
          }
        }
      }

      if (isTutorial) {
        tutorialStatsRef.current = applyTutorialEvents(
          tutorialStatsRef.current,
          gameRef.current,
          res.events,
        );
        const callbacks = tickTutorial(dtMs, {
          game: gameRef.current,
          recentEvents: res.events,
          stats: tutorialStatsRef.current,
        });
        applyTutorialLayout(callbacks);
        for (const cb of callbacks) {
          if (cb.type === 'stepCleared' || cb.type === 'subStepCleared') sfx.pickup();
          if (cb.type === 'tutorialComplete') sfx.win();
        }
      }
    } else if (isTutorial) {
      const callbacks = tickTutorial(dtMs, {
        game: gameRef.current,
        recentEvents: [],
        stats: tutorialStatsRef.current,
      });
      applyTutorialLayout(callbacks);
      for (const cb of callbacks) {
        if (cb.type === 'tutorialComplete') sfx.win();
      }
    }

    // Render
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const shake = getShakeOffset(vfxRef.current);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.translate(shake.x, shake.y);
        render(ctx, gameRef.current, { blink: blinkRef.current });
        drawVfx(ctx, vfxRef.current);
        if (gameRef.current.phase !== 'start') {
          drawSmoothEntities(
            ctx,
            gameRef.current,
            playerVisualRef.current,
            rivalVisualRefs.current,
            blinkRef.current,
          );
          drawTrailMarks(ctx, vfxRef.current);
          drawSkillBurst(
            ctx,
            vfxRef.current,
            playerVisualRef.current.x,
            playerVisualRef.current.y,
            blinkRef.current,
          );
        }
        ctx.restore();
      }
    }
  });

  // Static render on start screen
  useAnimationFrame(game.phase === 'start', () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        blinkRef.current += 0.016;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        render(ctx, gameRef.current, { blink: blinkRef.current });
      }
    }
  });

  const handleUseSkill = useCallback(() => {
    const g = gameRef.current;
    if (g.phase !== 'playing' && g.phase !== 'tutorial') return;
    if (g.phase === 'tutorial' && g.tutorialSubStep === 0) return;
    if (!isSkillReady(g.skills)) return;
    unlockAudio();
    skillUseRef.current = true;
  }, []);

  // Keyboard: Enter/Space starts; R restarts on result; Shift uses skill
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat) {
        e.preventDefault();
        handleUseSkill();
        return;
      }
      if (e.code === 'Enter' || e.code === 'Space') {
        const ph = gameRef.current.phase;
        if (ph === 'start') {
          e.preventDefault();
          beginGame();
        } else if (ph === 'won' || ph === 'lost') {
          e.preventDefault();
          resetGame();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [beginGame, resetGame, handleUseSkill]);

  const handleTouchDir = useCallback((d: Direction | null) => {
    touchDirRef.current = d;
  }, []);

  const isGameplay = game.phase === 'playing' || game.phase === 'tutorial';
  const showSkillControls =
    game.phase === 'playing' || (game.phase === 'tutorial' && game.tutorialSubStep > 0);
  const showDpad = isGameplay;

  return (
    <div className="game-app text-white">
      <PortraitOrientationLock />

      <div className="pointer-events-none absolute inset-0 z-0 opacity-40">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-[#3bd4ff]/10 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-[#ff8c42]/10 blur-3xl" />
      </div>

      <div className="game-shell">
        {isGameplay && (
          <GameplayTopBar
            elapsedMs={game.elapsed}
            muted={muted}
            onToggleMute={toggleMute}
            onReset={resetGame}
          />
        )}

        <div className="game-canvas-wrap">
          <canvas
            ref={canvasRef}
            width={GRID_W * TILE}
            height={GRID_H * TILE}
            className="game-canvas"
            style={{ imageRendering: 'pixelated' }}
          />
          {game.phase === 'tutorial' && (
            <TutorialScene snapshot={tutorialSnapshot} onQuit={handleQuitTutorial} />
          )}
          {(game.phase === 'won' || game.phase === 'lost') && (
            <ResultOverlay game={game} onRestart={resetGame} />
          )}
        </div>

        {game.phase === 'playing' && <LeaderboardSidebar game={game} />}

        {showDpad && (
          <div className="game-controls-dpad lg:hidden">
            <MobileControls onDir={handleTouchDir} docked />
          </div>
        )}

        {showSkillControls && (
          <div className="game-controls-skill">
            <SkillButton
              selectedSkill={game.selectedSkill}
              skills={game.skills}
              onUse={handleUseSkill}
              docked
            />
          </div>
        )}

        {game.phase === 'start' && (
          <StartScreen
            difficulty={difficulty}
            cpuCount={cpuCount}
            selectedSkill={selectedSkill}
            onDifficultyChange={setDifficulty}
            onCpuCountChange={setCpuCount}
            onSkillChange={setSelectedSkill}
            onStart={beginGame}
            onTutorial={beginTutorial}
          />
        )}
      </div>
    </div>
  );
}

// Erase grid-rendered entities and redraw at lerped visual positions.
function drawSmoothEntities(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  playerVisual: { x: number; y: number },
  rivalVisuals: Record<number, { x: number; y: number }>,
  blink: number,
) {
  eraseFloorCell(ctx, state, state.player.x, state.player.y);
  eraseFloorCell(ctx, state, Math.round(playerVisual.x), Math.round(playerVisual.y));

  for (const rival of state.rivals) {
    const rivalVisual = rivalVisuals[rival.id] ?? { x: rival.x, y: rival.y };
    eraseFloorCell(ctx, state, rival.x, rival.y);
    eraseFloorCell(ctx, state, Math.round(rivalVisual.x), Math.round(rivalVisual.y));

    const rMoving =
      Math.abs(rivalVisual.x - rival.x) > 0.04 || Math.abs(rivalVisual.y - rival.y) > 0.04;

    drawCharacterAt(
      ctx,
      rivalVisual.x,
      rivalVisual.y,
      rival.facing,
      blink,
      rival.stun > 0,
      'rival',
      {
        moving: rMoving,
        squash: rMoving ? 0.92 : 1,
        jamStun: rival.jamStun && rival.stun > 0,
        rivalIndex: rival.id,
      },
    );
    if (rival.isPicking) {
      drawPickGaugeAt(ctx, rivalVisual.x, rivalVisual.y, rival.pickProgress, 'rival');
    }
  }

  const pMoving =
    Math.abs(playerVisual.x - state.player.x) > 0.04 || Math.abs(playerVisual.y - state.player.y) > 0.04;

  drawCharacterAt(ctx, playerVisual.x, playerVisual.y, state.player.facing, blink, state.player.stun > 0, 'player', {
    moving: pMoving,
    squash: pMoving ? 0.9 : 1,
    speedBoost: isSuperSpeedActive(state.skills),
    pushThrough: isPushThroughActive(state.skills),
  });
  if (state.isPicking) {
    drawPickGaugeAt(ctx, playerVisual.x, playerVisual.y, state.pickProgress, 'player');
  }

  if (state.collisionFx > 0 && state.collisionPos) {
    drawCollisionFxAt(ctx, state.collisionPos.x, state.collisionPos.y, state.collisionFx);
  }
}
