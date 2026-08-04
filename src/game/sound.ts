/**
 * Game SFX facade — retro synth + realistic sample pools via AudioManager.
 * Replace files under public/sounds/ (see manifest.ts) to swap voices / footsteps / paper.
 */
import { SkillType } from './skills';
import { audioManager, unlockAudio, setMuted, isMuted, getAudioVolumes, setAudioVolume, setAudioVolumes, resetAudioVolumes, startBgm, fadeOutBgm, stopBgm } from './audio/AudioManager';

export type { AudioCategory, AudioVolumes } from './audio/AudioManager';
export { DEFAULT_AUDIO_VOLUMES } from './audio/AudioManager';
export { unlockAudio, setMuted, isMuted, getAudioVolumes, setAudioVolume, setAudioVolumes, resetAudioVolumes, startBgm, fadeOutBgm, stopBgm };

export interface CollisionSfxOptions {
  playerKnocked?: boolean;
  rivalKnocked?: boolean;
  playerPushed?: boolean;
  rivalPushed?: boolean;
  playerSeed?: number;
  rivalSeed?: number;
}

export const sfx = {
  /** Warehouse rubber-sole footstep (realistic pool). */
  move() {
    audioManager.playFootstep();
  },
  bump() {
    audioManager.playRetroBlip(90, 0.12, 'square', 0.16, 60);
  },
  collision(opts?: CollisionSfxOptions) {
    audioManager.playCollision(opts);
  },
  /** Paper rustle on pick complete. */
  pickup() {
    audioManager.playPaperPick();
  },
  /** Pick combo chain — rising pitch by combo tier. */
  combo(combo: number, tier: number) {
    audioManager.playCombo(combo, tier);
  },
  /** @deprecated Use collision() which picks Scream_Small / Scream_Big. */
  crashVoice() {
    audioManager.playScreamBig();
  },
  win() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((n, i) =>
      window.setTimeout(() => audioManager.playRetroBlip(n, 0.18, 'square', 0.18), i * 130),
    );
  },
  start() {
    audioManager.playRetroBlip(440, 0.1, 'square', 0.14);
    window.setTimeout(() => audioManager.playRetroBlip(880, 0.14, 'square', 0.14), 110);
  },
  countdownTick() {
    audioManager.playRetroBlip(320, 0.07, 'square', 0.12, 240);
  },
  raceGo() {
    audioManager.playRetroBlip(520, 0.08, 'square', 0.16, 880);
    window.setTimeout(() => audioManager.playRetroBlip(880, 0.16, 'square', 0.18), 60);
    window.setTimeout(() => audioManager.playRetroBlip(660, 0.12, 'triangle', 0.12, 440), 140);
  },
  skillSuperSpeed() {
    audioManager.playRetroBlip(160, 0.06, 'triangle', 0.1, 520);
    window.setTimeout(() => audioManager.playRetroBlip(320, 0.12, 'sawtooth', 0.09, 980), 25);
    window.setTimeout(() => audioManager.playRetroBlip(520, 0.18, 'triangle', 0.07, 1400), 60);
  },
  skillPushThrough() {
    audioManager.playRetroBlip(62, 0.22, 'square', 0.24, 32);
    window.setTimeout(() => audioManager.playRetroBlip(48, 0.18, 'square', 0.2, 24), 55);
    window.setTimeout(() => audioManager.playRetroBlip(36, 0.28, 'sawtooth', 0.14, 18), 110);
  },
  skillJamSignal() {
    for (let i = 0; i < 7; i++) {
      window.setTimeout(
        () => audioManager.playRetroBlip(720 + (i % 3) * 180, 0.035, 'square', 0.11, 280 + i * 40),
        i * 32,
      );
    }
    window.setTimeout(() => audioManager.playRetroBlip(1100, 0.08, 'sawtooth', 0.1, 350), 180);
    window.setTimeout(() => audioManager.playRetroBlip(880, 0.06, 'square', 0.08, 200), 240);
  },
};

export function playSkillSfx(skill: SkillType) {
  switch (skill) {
    case SkillType.SuperSpeed:
      sfx.skillSuperSpeed();
      break;
    case SkillType.PushThrough:
      sfx.skillPushThrough();
      break;
    case SkillType.JamSignal:
      sfx.skillJamSignal();
      break;
  }
}
