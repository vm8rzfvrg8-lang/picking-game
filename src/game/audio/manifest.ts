/**
 * Sound asset registry — drop .wav / .mp3 files at these paths to replace placeholders.
 * Paths are served from /public (Vite root).
 */
export const SOUND_MANIFEST = {
  voice: {
    /** Light bump / yield — Scream_Small (random). */
    screamSmall: [
      '/sounds/voice/scream_s1.wav',
      '/sounds/voice/scream_s2.wav',
      '/sounds/voice/scream_s3.wav',
    ],
    /** Hard knockback / big launch — Scream_Big (random). */
    screamBig: [
      '/sounds/voice/scream_b1.wav',
      '/sounds/voice/scream_b2.wav',
      '/sounds/voice/scream_b3.wav',
    ],
  },
  pick: {
    paper: [
      '/sounds/pick/paper-01.wav',
      '/sounds/pick/paper-02.wav',
      '/sounds/pick/paper-03.wav',
    ],
  },
  footstep: {
    step: [
      '/sounds/footstep/step-01.wav',
      '/sounds/footstep/step-02.wav',
      '/sounds/footstep/step-03.wav',
    ],
  },
  crash: {
    impact: [
      '/sounds/crash/impact-01.wav',
      '/sounds/crash/impact-02.wav',
    ],
  },
  /** Unified knockback SFX — player & CPU share these pools (pitch varied at runtime). */
  knockback: {
    heavy: [
      '/sounds/knockback/kb_heavy_1.wav',
      '/sounds/knockback/kb_heavy_2.wav',
      '/sounds/knockback/kb_heavy_3.wav',
    ],
    light: [
      '/sounds/knockback/kb_light_1.wav',
      '/sounds/knockback/kb_light_2.wav',
    ],
  },
  combo: {
    /** Optional combo chime samples (playbackRate scales with combo if provided). */
    chime: [] as readonly string[],
  },
} as const;

export type SoundGroup = keyof typeof SOUND_MANIFEST;
export type SoundPool<G extends SoundGroup> = keyof (typeof SOUND_MANIFEST)[G];

export function allSoundUrls(): string[] {
  const urls: string[] = [];
  for (const group of Object.values(SOUND_MANIFEST)) {
    for (const pool of Object.values(group)) {
      urls.push(...pool);
    }
  }
  return urls;
}
