import { TUTORIAL_STEP_CONFIGS, TUTORIAL_KNOCKBACK_SETTLE_MS } from './steps';
import { TUTORIAL_STEP5_SUBSTEPS } from './step5';
import { buildStepProgress } from './types';
import type {
  TutorialCallback,
  TutorialCheckContext,
  TutorialPhase,
  TutorialSnapshot,
  TutorialStepConfig,
  TutorialStepNumber,
  TutorialStepState,
  TutorialUpdateResult,
} from './types';
import type { TutorialSubStep } from './step5';

export class TutorialManager {
  static readonly STEP_COUNT = TUTORIAL_STEP_CONFIGS.length;
  static readonly TRANSITION_MS = 1000;
  static readonly COMPLETE_DISPLAY_MS = 3200;
  static readonly CLEAR_COOLDOWN_MS = 500;

  private currentStep: TutorialStepNumber = 1;
  private currentSubStep: TutorialSubStep = 1;
  private steps: TutorialStepState[];
  private phase: TutorialPhase = 'active';
  private transitionTimer = 0;
  private completeTimer = 0;
  private clearCooldownTimer = 0;
  private clearPendingTimer = 0;
  private clearedSubStep: TutorialSubStep | null = null;
  private lastStats: TutorialCheckContext['stats'] | null = null;

  constructor(stepConfigs: TutorialStepConfig[] = TUTORIAL_STEP_CONFIGS) {
    this.steps = stepConfigs.map((cfg) => ({
      step: cfg.step,
      instructionText: cfg.instructionText,
      cleared: false,
      checkClear: cfg.checkClear,
      postClearDelayMs: cfg.postClearDelayMs ?? 0,
    }));
  }

  reset(): void {
    this.currentStep = 1;
    this.currentSubStep = 1;
    this.phase = 'active';
    this.transitionTimer = 0;
    this.completeTimer = 0;
    this.clearCooldownTimer = 0;
    this.clearPendingTimer = 0;
    this.clearedSubStep = null;
    this.lastStats = null;
    for (const step of this.steps) {
      step.cleared = false;
    }
  }

  private beginStepCooldown(): void {
    this.clearCooldownTimer = TutorialManager.CLEAR_COOLDOWN_MS;
  }

  start(): TutorialCallback[] {
    this.reset();
    this.beginStepCooldown();
    return [{ type: 'stepStarted', step: 1 }];
  }

  getCurrentStep(): TutorialStepNumber {
    return this.currentStep;
  }

  getInstructionText(): string {
    if (this.currentStep === 5) {
      return TUTORIAL_STEP5_SUBSTEPS[this.currentSubStep - 1]?.instructionText ?? '';
    }
    return this.steps[this.currentStep - 1]?.instructionText ?? '';
  }

  getSnapshot(): TutorialSnapshot {
    const transitionProgress =
      this.phase === 'transitioning'
        ? Math.min(1, this.transitionTimer / TutorialManager.TRANSITION_MS)
        : 0;

    const stats = this.lastStats;
    const stepProgress =
      stats && (this.currentStep === 3 || this.currentStep === 4 || this.currentStep === 5)
        ? buildStepProgress(
            this.currentStep,
            stats,
            this.currentStep === 5 ? this.currentSubStep : null,
          )
        : null;

    const completionMessage =
      this.phase === 'complete'
        ? 'これで全ての修行は完了だ！好きなスキルを選んで試合に出発しよう！'
        : null;

    return {
      currentStep: this.currentStep,
      totalSteps: TutorialManager.STEP_COUNT,
      steps: this.steps.map(({ step, instructionText, cleared }) => ({
        step,
        instructionText,
        cleared,
      })),
      phase: this.phase,
      transitionProgress,
      instructionText: this.getInstructionText(),
      isComplete: this.phase === 'complete',
      stepProgress,
      currentSubStep: this.currentStep === 5 ? this.currentSubStep : null,
      clearedSubStep: this.clearedSubStep,
      completionMessage,
    };
  }

  private checkStep5Clear(ctx: TutorialCheckContext): boolean {
    const sub = TUTORIAL_STEP5_SUBSTEPS[this.currentSubStep - 1];
    return sub ? sub.checkClear(ctx) : false;
  }

  update(dtMs: number, ctx: TutorialCheckContext): TutorialUpdateResult {
    const callbacks: TutorialCallback[] = [];
    this.lastStats = ctx.stats;

    if (this.phase === 'complete') {
      this.completeTimer += dtMs;
      if (this.completeTimer >= TutorialManager.COMPLETE_DISPLAY_MS) {
        callbacks.push({ type: 'returnToStart' });
      }
      return { snapshot: this.getSnapshot(), callbacks };
    }

    if (this.phase === 'clearPending') {
      this.clearPendingTimer -= dtMs;
      if (this.clearPendingTimer <= 0) {
        this.phase = 'transitioning';
        this.transitionTimer = 0;
        if (this.currentStep === 5) {
          this.clearedSubStep = this.currentSubStep;
          callbacks.push({ type: 'subStepCleared', step: 5, subStep: this.currentSubStep });
        } else {
          callbacks.push({ type: 'stepCleared', step: this.currentStep });
        }
      }
      return { snapshot: this.getSnapshot(), callbacks };
    }

    if (this.phase === 'transitioning') {
      this.transitionTimer += dtMs;
      if (this.transitionTimer >= TutorialManager.TRANSITION_MS) {
        this.clearedSubStep = null;
        if (this.currentStep === 5 && this.currentSubStep < 3) {
          this.currentSubStep = (this.currentSubStep + 1) as TutorialSubStep;
          this.phase = 'active';
          this.transitionTimer = 0;
          this.beginStepCooldown();
          callbacks.push({ type: 'subStepStarted', step: 5, subStep: this.currentSubStep });
        } else if (this.currentStep >= TutorialManager.STEP_COUNT) {
          this.steps[this.currentStep - 1].cleared = true;
          this.phase = 'complete';
          this.completeTimer = 0;
          callbacks.push({ type: 'tutorialComplete' });
        } else {
          this.currentStep = (this.currentStep + 1) as TutorialStepNumber;
          this.phase = 'active';
          this.transitionTimer = 0;
          this.beginStepCooldown();
          if (this.currentStep === 5) {
            this.currentSubStep = 1;
            callbacks.push({ type: 'stepStarted', step: 5 });
            callbacks.push({ type: 'subStepStarted', step: 5, subStep: 1 });
          } else {
            callbacks.push({ type: 'stepStarted', step: this.currentStep });
          }
        }
      }
      return { snapshot: this.getSnapshot(), callbacks };
    }

    const active = this.steps[this.currentStep - 1];
    if (this.clearCooldownTimer > 0) {
      this.clearCooldownTimer = Math.max(0, this.clearCooldownTimer - dtMs);
      return { snapshot: this.getSnapshot(), callbacks };
    }

    const cleared =
      this.currentStep === 5 ? this.checkStep5Clear(ctx) : active && active.checkClear(ctx);

    if (active && !active.cleared && cleared) {
      if (this.currentStep === 5) {
        if (this.currentSubStep === 1) {
          console.log('Step 5-1 clear detected by TutorialManager — starting transition to Step 5-2');
        }
        if (this.currentSubStep >= 3) {
          active.cleared = true;
        }
        this.phase = 'clearPending';
        this.clearPendingTimer = TUTORIAL_KNOCKBACK_SETTLE_MS;
      } else {
        active.cleared = true;
        if (active.postClearDelayMs > 0) {
          this.phase = 'clearPending';
          this.clearPendingTimer = active.postClearDelayMs;
        } else {
          this.phase = 'transitioning';
          this.transitionTimer = 0;
          callbacks.push({ type: 'stepCleared', step: this.currentStep });
        }
      }
    }

    return { snapshot: this.getSnapshot(), callbacks };
  }
}
