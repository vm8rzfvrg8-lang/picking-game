import { allSoundUrls, SOUND_MANIFEST } from './manifest';
import { bgmController } from './BgmController';
import {
  synthBlip,
  synthCombo,
  synthCrashImpact,
  synthFootstep,
  synthPaperPick,
  synthScreamBig,
  synthScreamSmall,
} from './procedural';

export type AudioCategory =
  | 'master'
  | 'voice'
  | 'footstep'
  | 'pick'
  | 'crash'
  | 'combo'
  | 'retro'
  | 'bgm';

export interface AudioVolumes {
  master: number;
  voice: number;
  footstep: number;
  pick: number;
  crash: number;
  combo: number;
  retro: number;
  bgm: number;
}

export const DEFAULT_AUDIO_VOLUMES: AudioVolumes = {
  master: 0.85,
  voice: 0.88,
  footstep: 0.52,
  pick: 0.72,
  crash: 0.68,
  combo: 0.95,
  retro: 0.48,
  bgm: 0.3,
};

/** Extra gain applied to combo SFX so it cuts through footsteps / knockback. */
export const COMBO_SFX_BOOST = 1.55;

const VOLUME_STORAGE_KEY = 'picking-game-audio-volumes';

/** Per-category cooldown (ms) to prevent audio spam. */
const SFX_COOLDOWN_MS = {
  footstep: 80,
  pick: 120,
  impact: 150,
  voiceSmall: 180,
  voiceBig: 280,
  combo: 100,
  retro: 60,
} as const;

type SfxCooldownKey = keyof typeof SFX_COOLDOWN_MS;

const MAX_VOICE_CONCURRENT = 2;
/** Max knockback voice plays within a short burst window (multi-CPU). */
const MAX_KNOCKBACK_VOICE_BURST = 3;
const KNOCKBACK_BURST_WINDOW_MS = 90;

/** Pitch spread for knockback variants (playbackRate). */
const KNOCKBACK_PITCH_SPREAD = 0.22;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function loadStoredVolumes(): AudioVolumes {
  if (typeof window === 'undefined') return { ...DEFAULT_AUDIO_VOLUMES };
  try {
    const raw = localStorage.getItem(VOLUME_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AUDIO_VOLUMES };
    const parsed = JSON.parse(raw) as Partial<AudioVolumes>;
    let comboVol = clamp01(parsed.combo ?? DEFAULT_AUDIO_VOLUMES.combo);
    if (comboVol > 0 && comboVol <= 0.72) {
      comboVol = DEFAULT_AUDIO_VOLUMES.combo;
    }
    return {
      master: clamp01(parsed.master ?? DEFAULT_AUDIO_VOLUMES.master),
      voice: clamp01(parsed.voice ?? DEFAULT_AUDIO_VOLUMES.voice),
      footstep: clamp01(parsed.footstep ?? DEFAULT_AUDIO_VOLUMES.footstep),
      pick: clamp01(parsed.pick ?? DEFAULT_AUDIO_VOLUMES.pick),
      crash: clamp01(parsed.crash ?? DEFAULT_AUDIO_VOLUMES.crash),
      combo: comboVol,
      retro: clamp01(parsed.retro ?? DEFAULT_AUDIO_VOLUMES.retro),
      bgm: clamp01(parsed.bgm ?? DEFAULT_AUDIO_VOLUMES.bgm),
    };
  } catch {
    return { ...DEFAULT_AUDIO_VOLUMES };
  }
}

function persistVolumes(volumes: AudioVolumes): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(VOLUME_STORAGE_KEY, JSON.stringify(volumes));
  } catch {
    /* ignore quota errors */
  }
}

class AudioManager {
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private failedUrls = new Set<string>();
  private preloadPromise: Promise<void> | null = null;
  private muted = false;
  private volumes: AudioVolumes = loadStoredVolumes();
  private footstepVariant = 0;
  private screamSmallVariant = 0;
  private screamBigVariant = 0;
  private knockbackVariant = 0;
  private knockbackBurstStart = 0;
  private knockbackBurstVoiceCount = 0;
  private cooldownAt: Partial<Record<SfxCooldownKey, number>> = {};
  private voiceConcurrent = 0;

  getVolumes(): AudioVolumes {
    return { ...this.volumes };
  }

  setVolume(category: AudioCategory, value: number): void {
    this.volumes = { ...this.volumes, [category]: clamp01(value) };
    persistVolumes(this.volumes);
    if (category === 'bgm' || category === 'master') {
      this.syncBgmVolume();
    }
  }

  setVolumes(next: AudioVolumes): void {
    this.volumes = {
      master: clamp01(next.master),
      voice: clamp01(next.voice),
      footstep: clamp01(next.footstep),
      pick: clamp01(next.pick),
      crash: clamp01(next.crash),
      combo: clamp01(next.combo),
      retro: clamp01(next.retro),
      bgm: clamp01(next.bgm),
    };
    persistVolumes(this.volumes);
    this.syncBgmVolume();
  }

  resetVolumes(): void {
    this.setVolumes({ ...DEFAULT_AUDIO_VOLUMES });
  }

  setMuted(m: boolean): void {
    this.muted = m;
    bgmController.setMuted(m);
  }

  isMuted(): boolean {
    return this.muted;
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    return this.ctx;
  }

  unlock(): void {
    const c = this.ensureContext();
    if (c && c.state === 'suspended') void c.resume();
    bgmController.prime();
    this.syncBgmVolume();
    if (!this.preloadPromise) {
      this.preloadPromise = this.preloadAll();
    }
  }

  private syncBgmVolume(): void {
    if (this.muted) {
      bgmController.setVolumeScale(0);
      return;
    }
    bgmController.setVolumeScale(this.volumes.master * this.volumes.bgm);
  }

  startBgm(): void {
    this.syncBgmVolume();
    bgmController.start();
  }

  fadeOutBgm(): void {
    bgmController.fadeOutAndStop();
  }

  stopBgm(): void {
    bgmController.stopImmediate();
  }

  private tryCooldown(key: SfxCooldownKey): boolean {
    const now = performance.now();
    const last = this.cooldownAt[key] ?? 0;
    if (now - last < SFX_COOLDOWN_MS[key]) return false;
    this.cooldownAt[key] = now;
    return true;
  }

  private effectiveVolume(
    category: Exclude<AudioCategory, 'master'>,
    scale = 1,
  ): number {
    if (this.muted) return 0;
    return this.volumes.master * this.volumes[category] * scale;
  }

  private async preloadAll(): Promise<void> {
    const c = this.ensureContext();
    if (!c) return;
    const urls = allSoundUrls();
    await Promise.all(
      urls.map(async (url) => {
        if (this.buffers.has(url) || this.failedUrls.has(url)) return;
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.arrayBuffer();
          const buffer = await c.decodeAudioData(data.slice(0));
          this.buffers.set(url, buffer);
        } catch {
          this.failedUrls.add(url);
        }
      }),
    );
  }

  private releaseVoiceSlot(): void {
    this.voiceConcurrent = Math.max(0, this.voiceConcurrent - 1);
  }

  private playBuffer(
    url: string,
    category: Exclude<AudioCategory, 'master' | 'retro'>,
    scale = 1,
    playbackRate = 1,
    trackVoice = false,
  ): boolean {
    if (this.muted) return false;
    if (trackVoice && this.voiceConcurrent >= MAX_VOICE_CONCURRENT) return false;

    const c = this.ensureContext();
    if (!c) return false;
    const buffer = this.buffers.get(url);
    if (!buffer) return false;

    const src = c.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = playbackRate;
    const gain = c.createGain();
    gain.gain.value = this.effectiveVolume(category, scale);
    src.connect(gain).connect(c.destination);
    if (trackVoice) {
      this.voiceConcurrent++;
      src.onended = () => this.releaseVoiceSlot();
    }
    src.start();
    return true;
  }

  private playRandomFromPool(
    urls: readonly string[],
    category: Exclude<AudioCategory, 'master' | 'retro'>,
    scale = 1,
    playbackRate = 1,
    trackVoice = false,
  ): boolean {
    const ready = urls.filter((u) => this.buffers.has(u));
    if (ready.length === 0) return false;
    const pick = ready[Math.floor(Math.random() * ready.length)];
    return this.playBuffer(pick, category, scale, playbackRate, trackVoice);
  }

  playFootstep(): void {
    if (!this.tryCooldown('footstep')) return;
    const v = this.footstepVariant++;
    const rate = 0.94 + (v % 4) * 0.04;
    if (!this.playRandomFromPool(SOUND_MANIFEST.footstep.step, 'footstep', 1, rate)) {
      synthFootstep(this.ctx, this.effectiveVolume('footstep'), v);
    }
  }

  playPaperPick(): void {
    if (!this.tryCooldown('pick')) return;
    const v = Math.floor(Math.random() * 3);
    if (!this.playRandomFromPool(SOUND_MANIFEST.pick.paper, 'pick', 1, 0.96 + v * 0.02)) {
      synthPaperPick(this.ctx, this.effectiveVolume('pick'), v);
    }
  }

  playCrashImpact(intensity: 'light' | 'heavy' = 'heavy'): void {
    if (!this.tryCooldown('impact')) return;
    const v = Math.floor(Math.random() * 2);
    const scale = intensity === 'heavy' ? 1 : 0.55;
    if (!this.playRandomFromPool(SOUND_MANIFEST.crash.impact, 'crash', scale)) {
      synthCrashImpact(this.ctx, this.effectiveVolume('crash', scale), v);
    }
  }

  private knockbackPitch(entitySeed: number): number {
    const slot = this.knockbackVariant++;
    const spread = ((entitySeed * 0.31 + slot * 0.19) % 1) * KNOCKBACK_PITCH_SPREAD;
    return 0.9 + spread + Math.random() * 0.06;
  }

  /**
   * Unified knockback SE — player & CPU share pools; pitch/asset vary per entity.
   */
  playKnockback(severity: 'light' | 'heavy', entitySeed = 0): void {
    if (!this.beginKnockbackBurst(severity)) return;

    const pitch = this.knockbackPitch(entitySeed);
    const volScale = severity === 'heavy' ? 1 : 0.72;
    const kbPool =
      severity === 'heavy'
        ? SOUND_MANIFEST.knockback.heavy
        : SOUND_MANIFEST.knockback.light;
    const voicePool =
      severity === 'heavy'
        ? SOUND_MANIFEST.voice.screamBig
        : SOUND_MANIFEST.voice.screamSmall;

    if (this.playRandomFromPool(kbPool, 'voice', volScale, pitch, true)) {
      return;
    }

    this.playRandomFromPool(
      SOUND_MANIFEST.crash.impact,
      'crash',
      volScale * (severity === 'heavy' ? 0.9 : 0.5),
      pitch,
    );
    if (this.playRandomFromPool(
      voicePool,
      'voice',
      volScale * (severity === 'heavy' ? 1 : 0.85),
      pitch,
      true,
    )) {
      return;
    }

    this.voiceConcurrent++;
    const v = entitySeed + this.knockbackVariant;
    if (severity === 'heavy') {
      synthScreamBig(this.ctx, this.effectiveVolume('voice', volScale), v);
      synthCrashImpact(this.ctx, this.effectiveVolume('crash', volScale * 0.85), v % 2);
      window.setTimeout(() => this.releaseVoiceSlot(), 420);
    } else {
      synthScreamSmall(this.ctx, this.effectiveVolume('voice', volScale), v);
      window.setTimeout(() => this.releaseVoiceSlot(), 220);
    }
  }

  private beginKnockbackBurst(severity: 'light' | 'heavy'): boolean {
    if (this.voiceConcurrent >= MAX_VOICE_CONCURRENT) return false;

    const now = performance.now();
    if (now - this.knockbackBurstStart > KNOCKBACK_BURST_WINDOW_MS) {
      this.knockbackBurstStart = now;
      this.knockbackBurstVoiceCount = 0;
    }
    if (this.knockbackBurstVoiceCount >= MAX_KNOCKBACK_VOICE_BURST) return false;

    if (this.knockbackBurstVoiceCount === 0) {
      const cdKey = severity === 'heavy' ? 'voiceBig' : 'voiceSmall';
      if (!this.tryCooldown(cdKey)) return false;
    }

    this.knockbackBurstVoiceCount++;
    return true;
  }

  playScreamSmall(): void {
    this.playKnockback('light', this.screamSmallVariant++);
  }

  playScreamBig(): void {
    this.playKnockback('heavy', this.screamBigVariant++);
  }

  playCombo(combo: number, tier: number): void {
    if (combo < 2) return;
    if (!this.tryCooldown('combo')) return;

    const comboVol = this.effectiveVolume('combo', COMBO_SFX_BOOST);
    const chimes = SOUND_MANIFEST.combo.chime;
    const playbackRate = 1 + (combo - 2) * 0.07 + tier * 0.03;
    if (chimes.length > 0 && this.playRandomFromPool(chimes, 'combo', COMBO_SFX_BOOST, playbackRate)) {
      return;
    }
    synthCombo(this.ctx, comboVol, combo, tier);
  }

  playCollision(opts?: {
    playerKnocked?: boolean;
    rivalKnocked?: boolean;
    playerPushed?: boolean;
    rivalPushed?: boolean;
    /** Entity id seeds for pitch variation (player=0, CPU=rival id). */
    playerSeed?: number;
    rivalSeed?: number;
  }): void {
    type Victim = { severity: 'light' | 'heavy'; seed: number };
    const victims: Victim[] = [];

    if (opts?.playerKnocked) {
      victims.push({ severity: 'heavy', seed: opts.playerSeed ?? 0 });
    } else if (opts?.playerPushed) {
      victims.push({ severity: 'light', seed: opts.playerSeed ?? 0 });
    }

    if (opts?.rivalKnocked) {
      victims.push({ severity: 'heavy', seed: opts.rivalSeed ?? 1 });
    } else if (opts?.rivalPushed) {
      victims.push({ severity: 'light', seed: opts.rivalSeed ?? 1 });
    }

    if (victims.length === 0) {
      if (this.tryCooldown('impact')) {
        this.playRandomFromPool(SOUND_MANIFEST.crash.impact, 'crash', 0.45);
      }
      if (this.tryCooldown('retro')) {
        this.playRetroBlip(110, 0.06, 'square', 0.12, 70);
      }
      return;
    }

    victims.forEach((v, i) => {
      window.setTimeout(() => this.playKnockback(v.severity, v.seed + i * 5), i * 32);
    });
  }

  playRetroBlip(
    freq: number,
    dur: number,
    type: OscillatorType = 'square',
    vol = 0.18,
    slideTo?: number,
  ): void {
    if (this.muted) return;
    synthBlip(this.ctx, freq, dur, type, this.effectiveVolume('retro', vol / 0.18), slideTo);
  }
}

export const audioManager = new AudioManager();

export function getAudioVolumes(): AudioVolumes {
  return audioManager.getVolumes();
}

export function setAudioVolume(category: AudioCategory, value: number): void {
  audioManager.setVolume(category, value);
}

export function setAudioVolumes(volumes: AudioVolumes): void {
  audioManager.setVolumes(volumes);
}

export function resetAudioVolumes(): void {
  audioManager.resetVolumes();
}

export function setMuted(m: boolean): void {
  audioManager.setMuted(m);
}

export function isMuted(): boolean {
  return audioManager.isMuted();
}

export function unlockAudio(): void {
  audioManager.unlock();
}

export function startBgm(): void {
  audioManager.startBgm();
}

export function fadeOutBgm(): void {
  audioManager.fadeOutBgm();
}

export function stopBgm(): void {
  audioManager.stopBgm();
}
