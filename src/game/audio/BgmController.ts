/** Main gameplay loop track (served from /public). */
export const BGM_MAIN_PATH = '/sounds/bgm/main_bgm.mp3';

export const BGM_FADE_OUT_MS = 900;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

class BgmController {
  private audio: HTMLAudioElement | null = null;
  private fadeRaf: number | null = null;
  private volumeScale = 0.3;
  private masterMuted = false;
  private primed = false;

  setVolumeScale(v: number): void {
    this.volumeScale = clamp01(v);
    if (this.audio && this.fadeRaf === null && !this.masterMuted) {
      this.audio.volume = this.volumeScale;
    }
  }

  setMuted(m: boolean): void {
    this.masterMuted = m;
    if (!this.audio) return;
    if (m) {
      this.audio.volume = 0;
    } else if (this.fadeRaf === null) {
      this.audio.volume = this.volumeScale;
    }
  }

  private ensureAudio(): HTMLAudioElement | null {
    if (typeof window === 'undefined') return null;
    if (!this.audio) {
      this.audio = new Audio(BGM_MAIN_PATH);
      this.audio.loop = true;
      this.audio.preload = 'auto';
    }
    return this.audio;
  }

  /** Prime playback on user gesture (autoplay policy). */
  prime(): void {
    const el = this.ensureAudio();
    if (!el || this.primed) return;
    el.volume = 0;
    const attempt = el.play();
    if (!attempt) return;
    attempt
      .then(() => {
        el.pause();
        el.currentTime = 0;
        this.primed = true;
      })
      .catch(() => {
        /* blocked until a later gesture — start() will retry */
      });
  }

  /** Loop main BGM (call after race GO!). */
  start(): void {
    const el = this.ensureAudio();
    if (!el || this.masterMuted) return;
    this.cancelFade();
    el.volume = this.volumeScale;
    if (el.currentTime > 0.05) {
      el.currentTime = 0;
    }
    void el.play().catch(() => {
      /* may fail if not primed yet */
    });
  }

  fadeOutAndStop(durationMs = BGM_FADE_OUT_MS): void {
    const el = this.audio;
    if (!el || el.paused) return;
    this.cancelFade();
    const startVol = el.volume;
    if (startVol <= 0.001) {
      el.pause();
      el.currentTime = 0;
      return;
    }
    const start = performance.now();
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / durationMs);
      el.volume = startVol * (1 - t);
      if (t >= 1) {
        el.pause();
        el.currentTime = 0;
        this.fadeRaf = null;
        return;
      }
      this.fadeRaf = requestAnimationFrame(tick);
    };
    this.fadeRaf = requestAnimationFrame(tick);
  }

  stopImmediate(): void {
    this.cancelFade();
    if (!this.audio) return;
    this.audio.pause();
    this.audio.currentTime = 0;
  }

  private cancelFade(): void {
    if (this.fadeRaf !== null) {
      cancelAnimationFrame(this.fadeRaf);
      this.fadeRaf = null;
    }
  }
}

export const bgmController = new BgmController();
