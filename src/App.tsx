import { useCallback, useEffect, useRef, useState } from 'react';
import { GameState, DEFAULT_CPU_COUNT, DEFAULT_PICK_COUNT, PLAYER_COOLDOWN_MS, TILE } from './game/constants';
import { getComboCanvasColor, getComboMoveCooldown } from './game/combo';
import { computeCameraTransform, cullBoundsFromCamera, gridDecorOffset, type CameraState } from './game/camera';
import { Difficulty } from './game/difficulty';
import { Direction, Input, isPickInput, newGame, startPlaying, enterTutorial, returnToStart, step, getKnockbackVisualOffset, isKnockbackMoving, getKnockbackDrawFx } from './game/engine';
import {
  render,
  drawCharacterAt,
  drawPickGaugeAt,
  drawCollisionFxAt,
  drawPlayerMarkerAt,
  eraseFloorCell,
  applyRetroColorFilter,
} from './game/renderer';
import { sfx, setMuted, unlockAudio, playSkillSfx, startBgm, fadeOutBgm, stopBgm } from './game/sound';
import { AudioSettingsModal } from './components/AudioSettingsModal';
import { useKeyboardInput } from './hooks/useKeyboardInput';
import { useAnimationFrame } from './hooks/useAnimationFrame';
import { useCanvasResize } from './hooks/useCanvasResize';
import { StartScreen } from './components/StartScreen';
import { TutorialScene } from './components/TutorialScene';
import { GameplayTopBar } from './components/GameplayTopBar';
import { RaceProgressHud } from './components/RaceProgressHud';
import { ComboHud } from './components/ComboHud';
import { CountdownOverlay } from './components/CountdownOverlay';
import {
  COUNTDOWN_GO_HOLD_MS,
  COUNTDOWN_STEP_MS,
  COUNTDOWN_STEPS,
  type CountdownLabel,
  isGoLabel,
} from './game/countdown';
import { loadBreakRoomBackground } from './game/breakRoomBackground';
import { loadBananaPeelImage } from './game/bananaPeelSprite';
import { loadTopHeaderBackground } from './game/topHeaderBackground';
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
  drawPickAbsorbVfx,
  drawTrailMarks,
  drawSkillBurst,
  getHarvestCharacterFx,
  getShakeOffset,
  resetVfx,
  triggerCollisionShake,
  triggerKnockbackFx,
  triggerKnockbackWallFx,
  triggerComboPop,
  triggerGoalUnlock,
  triggerPickComplete,
  triggerSkillActivate,
  triggerTrailMark,
  triggerWinBurst,
  triggerCountdownPulse,
  triggerRaceGoBurst,
  countdownBurstOrigin,
  updateVfx,
  type VfxState,
} from './game/vfx';

function snapCameraTo(
  cameraRef: React.MutableRefObject<CameraState>,
  viewportRef: React.MutableRefObject<{ width: number; height: number }>,
  gridX: number,
  gridY: number,
) {
  const { width, height } = viewportRef.current;
  cameraRef.current = computeCameraTransform(gridX, width, height);
}

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
  const viewportRef = useCanvasResize(canvasRef);
  const kbRef = useKeyboardInput();

  const [game, setGame] = useState<GameState>(() => {
    const g = newGame(undefined, 'normal', SkillType.SuperSpeed, DEFAULT_CPU_COUNT, DEFAULT_PICK_COUNT);
    return g;
  });
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [cpuCount, setCpuCount] = useState(DEFAULT_CPU_COUNT);
  const [pickCount, setPickCount] = useState(DEFAULT_PICK_COUNT);
  const [selectedSkill, setSelectedSkill] = useState<SkillType>(SkillType.SuperSpeed);
  const gameRef = useRef(game);
  gameRef.current = game;

  const [muted, setMutedState] = useState(false);
  const mutedRef = useRef(false);
  mutedRef.current = muted;
  const [audioSettingsOpen, setAudioSettingsOpen] = useState(false);

  // Visual interpolated positions (grid units)
  const playerVisualRef = useRef({ x: game.player.x, y: game.player.y });
  const rivalVisualRefs = useRef<Record<number, { x: number; y: number }>>({});

  // Player move cooldown accumulator
  const moveCdRef = useRef(0);
  const blinkRef = useRef(0);
  const cameraRef = useRef<CameraState>({
    cameraX: 0,
    cameraY: 0,
    scale: 1,
    viewWorldW: 648,
    viewWorldH: 504,
  });
  const vfxRef = useRef<VfxState>(createVfx());
  const goalFxDoneRef = useRef(false);
  const skillUseRef = useRef(false);

  const [countdownLabel, setCountdownLabel] = useState<CountdownLabel | null>(null);
  const [countdownAnimKey, setCountdownAnimKey] = useState(0);
  const countdownActiveRef = useRef(false);
  const countdownTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearCountdownTimers = useCallback(() => {
    for (const t of countdownTimersRef.current) clearTimeout(t);
    countdownTimersRef.current = [];
  }, []);

  const startRaceCountdown = useCallback(() => {
    clearCountdownTimers();
    countdownActiveRef.current = true;
    setCountdownLabel(null);

    COUNTDOWN_STEPS.forEach((step, i) => {
      const timer = setTimeout(() => {
        setCountdownLabel(step);
        setCountdownAnimKey((k) => k + 1);
        const vfx = vfxRef.current;
        if (isGoLabel(step)) {
          countdownActiveRef.current = false;
          triggerCountdownPulse(vfx, true);
          const cam = cameraRef.current;
          const { width: viewW, height: viewH } = viewportRef.current;
          const origin = countdownBurstOrigin(
            cam.cameraX,
            cam.cameraY,
            cam.scale,
            viewW,
            viewH,
          );
          triggerRaceGoBurst(vfx, origin.x, origin.y);
          sfx.raceGo();
          startBgm();
        } else {
          triggerCountdownPulse(vfx, false);
          sfx.countdownTick();
        }
      }, i * COUNTDOWN_STEP_MS);
      countdownTimersRef.current.push(timer);
    });

    const hideDelay = (COUNTDOWN_STEPS.length - 1) * COUNTDOWN_STEP_MS + COUNTDOWN_GO_HOLD_MS;
    const hideTimer = setTimeout(() => {
      setCountdownLabel(null);
      countdownActiveRef.current = false;
    }, hideDelay);
    countdownTimersRef.current.push(hideTimer);
  }, [clearCountdownTimers]);

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
    snapCameraTo(cameraRef, viewportRef, g.player.x, g.player.y);
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

  useEffect(() => {
    snapCameraTo(cameraRef, viewportRef, gameRef.current.player.x, gameRef.current.player.y);
  }, []);

  useEffect(() => {
    if (game.phase === 'won' || game.phase === 'lost') {
      fadeOutBgm();
    }
  }, [game.phase]);

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
        snapCameraTo(cameraRef, viewportRef, g.player.x, g.player.y);
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
      snapCameraTo(cameraRef, viewportRef, g.player.x, g.player.y);
      setGame(g);
    }
  }, []);

  const resetGame = useCallback(() => {
    clearCountdownTimers();
    countdownActiveRef.current = false;
    setCountdownLabel(null);
    stopBgm();
    const g = newGame(undefined, difficulty, selectedSkill, cpuCount, pickCount);
    setGame(g);
    gameRef.current = g;
    playerVisualRef.current = { x: g.player.x, y: g.player.y };
    rivalVisualRefs.current = {};
    syncRivalVisuals(rivalVisualRefs, g);
    snapCameraTo(cameraRef, viewportRef, g.player.x, g.player.y);
    moveCdRef.current = 0;
    touchDirRef.current = null;
    resetVfx(vfxRef.current);
    goalFxDoneRef.current = false;
  }, [difficulty, selectedSkill, cpuCount, pickCount, clearCountdownTimers]);

  const beginTutorial = useCallback(() => {
    unlockAudio();
    tutorialStatsRef.current = createTutorialStats();
    const startCallbacks = startTutorial();
    const g = enterTutorial(newGame(undefined, difficulty, selectedSkill, 1, pickCount));
    gameRef.current = g;
    moveCdRef.current = 0;
    resetVfx(vfxRef.current);
    goalFxDoneRef.current = false;
    applyTutorialLayout(startCallbacks);
  }, [difficulty, selectedSkill, startTutorial, applyTutorialLayout, pickCount]);

  const handleQuitTutorial = useCallback(() => {
    resetTutorialManager();
    tutorialStatsRef.current = createTutorialStats();
    quitTutorial();
  }, [quitTutorial, resetTutorialManager]);

  const beginGame = useCallback(() => {
    unlockAudio();
    const g = startPlaying(newGame(undefined, difficulty, selectedSkill, cpuCount, pickCount));
    gameRef.current = g;
    playerVisualRef.current = { x: g.player.x, y: g.player.y };
    rivalVisualRefs.current = {};
    syncRivalVisuals(rivalVisualRefs, g);
    snapCameraTo(cameraRef, viewportRef, g.player.x, g.player.y);
    moveCdRef.current = 0;
    resetVfx(vfxRef.current);
    goalFxDoneRef.current = false;
    setGame(g);
    startRaceCountdown();
  }, [difficulty, selectedSkill, cpuCount, pickCount, startRaceCountdown]);

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

    // Smooth visual lerp toward logical positions
    const pv = playerVisualRef.current;
    const playerTarget = getKnockbackVisualOffset(g.player);
    const playerLerp = isKnockbackMoving(g.player.knockback)
      ? 28
      : isSuperSpeedActive(g.skills)
        ? 24
        : 16;
    pv.x = lerp(pv.x, playerTarget.x, Math.min(1, playerLerp * dt));
    pv.y = lerp(pv.y, playerTarget.y, Math.min(1, playerLerp * dt));
    const { width: viewW, height: viewH } = viewportRef.current;
    const targetCam = computeCameraTransform(pv.x, viewW, viewH);
    const cam = cameraRef.current;
    cam.cameraX = lerp(cam.cameraX, targetCam.cameraX, Math.min(1, 14 * dt));
    cam.cameraY = 0;
    cam.scale = targetCam.scale;
    cam.viewWorldW = targetCam.viewWorldW;
    cam.viewWorldH = targetCam.viewWorldH;
    for (const rival of g.rivals) {
      const rivalTarget = getKnockbackVisualOffset(rival);
      const rv = rivalVisualRefs.current[rival.id] ?? { x: rival.x, y: rival.y };
      const rivalLerp = isKnockbackMoving(rival.knockback) ? 26 : 12;
      rv.x = lerp(rv.x, rivalTarget.x, Math.min(1, rivalLerp * dt));
      rv.y = lerp(rv.y, rivalTarget.y, Math.min(1, rivalLerp * dt));
      rivalVisualRefs.current[rival.id] = rv;
    }

    if (g.phase === 'playing' || (isTutorial && tutorialSimActive)) {
      const countdownFrozen = countdownActiveRef.current;

      if (tutorialInputActive && !countdownFrozen) {
        moveCdRef.current += dtMs;
      }

      const kb = kbRef.current;
      const dir =
        tutorialInputActive && !countdownFrozen ? touchDirRef.current ?? kb.dir : null;
      const pick = tutorialInputActive && !countdownFrozen ? isPickInput(g, dir) : false;
      const moveCooldown = getComboMoveCooldown(
        getSuperSpeedMoveCooldown(PLAYER_COOLDOWN_MS, g.skills),
        g.pickCombo,
      );

      const input: Input = { dir: null, pick, useSkill: skillUseRef.current };
      skillUseRef.current = false;
      if (
        tutorialInputActive &&
        !countdownFrozen &&
        !pick &&
        moveCdRef.current >= moveCooldown &&
        dir &&
        !g.isPicking &&
        g.player.stun === 0 &&
        !isKnockbackMoving(g.player.knockback)
      ) {
        input.dir = dir;
        moveCdRef.current = 0;
      }

      const res = countdownFrozen
        ? { state: g, events: [] as const }
        : step(g, input, dtMs);
      for (const ev of res.events) {
        if (ev.type === 'move') {
          triggerTrailMark(vfx, ev.fromX, ev.fromY, ev.dir);
          if (ev.who === 'player') sfx.move();
        } else if (ev.type === 'pickStart' && ev.who === 'player') sfx.start();
        else if (ev.type === 'pickDone' && ev.who === 'player') {
          sfx.pickup();
          const t = res.state.targets[ev.index];
          if (t) triggerPickComplete(vfx, t.x, t.y, 'player');
        } else if (ev.type === 'pickCombo') {
          triggerComboPop(vfx, res.state.player.x, res.state.player.y, ev.combo);
          sfx.combo(ev.combo, ev.tier);
        } else if (ev.type === 'pickDone' && ev.who === 'rival') {
          sfx.pickup();
          const rival =
            res.state.rivals.find((r) => r.id === ev.entityId) ?? res.state.rivals[0];
          const t = rival?.targets[ev.index];
          if (t) triggerPickComplete(vfx, t.x, t.y, 'rival', rival?.id);
        } else if (ev.type === 'collision') {
          sfx.collision({
            playerKnocked: ev.playerKnockedBack,
            rivalKnocked: ev.rivalKnockedBack,
            playerPushed: ev.playerPushed,
            rivalPushed: ev.rivalPushed,
            playerSeed: ev.knockbackSeedA,
            rivalSeed: ev.knockbackSeedB,
          });
          if (ev.involvesPlayer) {
            triggerCollisionShake(vfx, ev.playerWrongWay || ev.rivalWrongWay);
          }
        } else if (ev.type === 'knockback') {
          if (ev.isAirborne) {
            sfx.knockbackLaunch(ev.seed);
            triggerKnockbackFx(vfx, ev.x, ev.y, ev.dirX, ev.dirY, ev.seed);
          } else {
            sfx.knockbackLight(ev.seed);
          }
        } else if (ev.type === 'trapTriggered' && ev.kind === 'bananaPeel') {
          sfx.bananaPeel(ev.seed);
        } else if (ev.type === 'knockbackWallHit') {
          triggerKnockbackWallFx(vfx, ev.x, ev.y);
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
        res.state.currentTarget >= res.state.pickCount &&
        !goalFxDoneRef.current &&
        res.state.phase === 'playing'
      ) {
        triggerGoalUnlock(vfx, res.state.goals);
        goalFxDoneRef.current = true;
      }
      if (res.state !== g) {
        gameRef.current = res.state;
        setGame(res.state);
        if (res.events.some((e) => e.type === 'collision' || e.type === 'yield' || e.type === 'knockback' || e.type === 'trapTriggered')) {
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

    updateVfx(
      vfx,
      dtMs,
      g.phase === 'playing' || (isTutorial && (tutorialInputActive || tutorialPhase === 'clearPending')),
      {
        player: playerVisualRef.current,
        rivals: rivalVisualRefs.current,
      },
    );

    // Render
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const { width: viewW, height: viewH, dpr } = viewportRef.current;
        const shake = getShakeOffset(vfxRef.current);
        const cam = cameraRef.current;
        const cull = cullBoundsFromCamera(cam);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, viewW, viewH);
        ctx.save();
        ctx.translate(shake.x, shake.y);
        ctx.scale(cam.scale, cam.scale);
        ctx.translate(-cam.cameraX, -cam.cameraY);
        render(ctx, gameRef.current, { blink: blinkRef.current, cull });
        ctx.save();
        const decor = gridDecorOffset();
        ctx.translate(decor.x, decor.y);
        drawVfx(ctx, vfxRef.current, cull);
        if (gameRef.current.phase !== 'start') {
          drawSmoothEntities(
            ctx,
            gameRef.current,
            playerVisualRef.current,
            rivalVisualRefs.current,
            blinkRef.current,
            vfxRef.current,
          );
          drawPickAbsorbVfx(
            ctx,
            vfxRef.current,
            playerVisualRef.current,
            rivalVisualRefs.current,
            cull,
          );
          drawTrailMarks(ctx, vfxRef.current, cull);
          drawSkillBurst(
            ctx,
            vfxRef.current,
            playerVisualRef.current.x,
            playerVisualRef.current.y,
            blinkRef.current,
          );
        }
        ctx.restore();
        ctx.restore();
        applyRetroColorFilter(ctx, viewW, viewH);
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
        const { width: viewW, height: viewH, dpr } = viewportRef.current;
        const cam = computeCameraTransform(
          gameRef.current.player.x,
          viewW,
          viewH,
        );
        const cull = cullBoundsFromCamera(cam);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, viewW, viewH);
        ctx.save();
        ctx.scale(cam.scale, cam.scale);
        ctx.translate(-cam.cameraX, -cam.cameraY);
        render(ctx, gameRef.current, { blink: blinkRef.current, cull });
        ctx.restore();
        applyRetroColorFilter(ctx, viewW, viewH);
      }
    }
  });

  const handleUseSkill = useCallback(() => {
    const g = gameRef.current;
    if (countdownActiveRef.current) return;
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

  useEffect(() => {
    loadBreakRoomBackground();
    loadBananaPeelImage();
    loadTopHeaderBackground();
    return () => clearCountdownTimers();
  }, [clearCountdownTimers]);

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
            onOpenAudioSettings={() => setAudioSettingsOpen(true)}
            onReset={resetGame}
          />
        )}

        <div className="game-canvas-wrap">
          <canvas
            ref={canvasRef}
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

        {game.phase === 'playing' && <RaceProgressHud game={game} />}
        {game.phase === 'playing' && (
          <CountdownOverlay label={countdownLabel} animKey={countdownAnimKey} />
        )}
        {(game.phase === 'playing' || game.phase === 'tutorial') && (
          <ComboHud game={game} />
        )}

        {showDpad && (
          <div className="game-controls-dpad game-controls-overlay">
            <MobileControls onDir={handleTouchDir} docked />
          </div>
        )}

        {showSkillControls && (
          <div className="game-controls-skill game-controls-overlay">
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
            pickCount={pickCount}
            onPickCountChange={setPickCount}
            selectedSkill={selectedSkill}
            onDifficultyChange={setDifficulty}
            onCpuCountChange={setCpuCount}
            onSkillChange={setSelectedSkill}
            onStart={beginGame}
            onTutorial={beginTutorial}
            onOpenAudioSettings={() => setAudioSettingsOpen(true)}
          />
        )}

        <AudioSettingsModal
          open={audioSettingsOpen}
          onClose={() => setAudioSettingsOpen(false)}
        />
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
  vfx: VfxState,
) {
  eraseFloorCell(ctx, state, state.player.x, state.player.y, blink);
  eraseFloorCell(ctx, state, Math.round(playerVisual.x), Math.round(playerVisual.y), blink);

  for (const rival of state.rivals) {
    const rivalVisual = rivalVisuals[rival.id] ?? { x: rival.x, y: rival.y };
    eraseFloorCell(ctx, state, rival.x, rival.y, blink);
    eraseFloorCell(ctx, state, Math.round(rivalVisual.x), Math.round(rivalVisual.y), blink);

    const rMoving =
      Math.abs(rivalVisual.x - rival.x) > 0.04 || Math.abs(rivalVisual.y - rival.y) > 0.04;

    const rHarvest = getHarvestCharacterFx(vfx, 'rival', rival.id);
    const ry = rivalVisual.y + rHarvest.yOffsetPx / TILE;

    drawCharacterAt(
      ctx,
      rivalVisual.x,
      ry,
      rival.facing,
      blink,
      rival.stun > 0,
      'rival',
      {
        moving: rMoving,
        squash: rMoving ? 0.92 : 1,
        jamStun: rival.jamStun && rival.stun > 0,
        rivalIndex: rival.id,
        knockbackFx: getKnockbackDrawFx(rival.knockback),
      },
    );
    if (rival.isPicking) {
      drawPickGaugeAt(ctx, rivalVisual.x, ry, rival.pickProgress, 'rival');
    }
  }

  const pHarvest = getHarvestCharacterFx(vfx, 'player');
  const py = playerVisual.y + pHarvest.yOffsetPx / TILE;

  const pMoving =
    Math.abs(playerVisual.x - state.player.x) > 0.04 || Math.abs(playerVisual.y - state.player.y) > 0.04;

  drawCharacterAt(ctx, playerVisual.x, py, state.player.facing, blink, state.player.stun > 0, 'player', {
    moving: pMoving,
    squash: pMoving ? 0.9 : 1,
    speedBoost: isSuperSpeedActive(state.skills) || state.pickCombo > 0,
    pushThrough: isPushThroughActive(state.skills),
    knockbackFx: getKnockbackDrawFx(state.player.knockback),
  });
  if (state.isPicking) {
    drawPickGaugeAt(ctx, playerVisual.x, py, state.pickProgress, 'player');
  }

  if (state.pickCombo > 0) {
    drawComboFloater(ctx, playerVisual.x, py, state.pickCombo, blink);
  }

  drawPlayerMarkerAt(ctx, playerVisual.x, py, blink);

  if (state.collisionFx > 0 && state.collisionPos) {
    drawCollisionFxAt(ctx, state.collisionPos.x, state.collisionPos.y, state.collisionFx);
  }
}

function drawComboFloater(
  ctx: CanvasRenderingContext2D,
  fx: number,
  fy: number,
  combo: number,
  blink: number,
) {
  const pulse = 0.82 + 0.18 * Math.sin(blink * Math.PI * 4);
  const cx = fx * TILE + TILE / 2;
  const cy = fy * TILE - 24;
  const color = getComboCanvasColor(combo, performance.now() / 1000);
  ctx.save();
  ctx.globalAlpha = 0.82 * pulse;
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillText(`${combo} COMBO!`, cx + 1, cy + 1);
  ctx.fillStyle = color;
  ctx.fillText(`${combo} COMBO!`, cx, cy);
  ctx.restore();
}
