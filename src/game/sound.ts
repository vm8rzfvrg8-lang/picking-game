// Lightweight WebAudio synth for retro blips. No external assets.
let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

function blip(
  freq: number,
  dur: number,
  type: OscillatorType = 'square',
  vol = 0.18,
  slideTo?: number,
) {
  const c = ac();
  if (!c) return;
  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (slideTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), now + dur);
  }
  gain.gain.setValueAtTime(vol, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(now);
  osc.stop(now + dur + 0.02);
}

import { SkillType } from './skills';

let muted = false;
export function setMuted(m: boolean) {
  muted = m;
}
export function isMuted() {
  return muted;
}

export const sfx = {
  move() {
    if (muted) return;
    blip(220, 0.05, 'square', 0.05);
  },
  bump() {
    if (muted) return;
    blip(90, 0.12, 'square', 0.16, 60);
  },
  collision() {
    if (muted) return;
    blip(110, 0.06, 'square', 0.12, 70);
    setTimeout(() => blip(70, 0.14, 'square', 0.14, 45), 40);
  },
  pickup() {
    if (muted) return;
    blip(660, 0.08, 'square', 0.16);
    setTimeout(() => blip(990, 0.1, 'square', 0.16), 70);
  },
  win() {
    if (muted) return;
    const notes = [523, 659, 784, 1047];
    notes.forEach((n, i) => setTimeout(() => blip(n, 0.18, 'square', 0.18), i * 130));
  },
  start() {
    if (muted) return;
    blip(440, 0.1, 'square', 0.14);
    setTimeout(() => blip(880, 0.14, 'square', 0.14), 110);
  },
  countdownTick() {
    if (muted) return;
    blip(320, 0.07, 'square', 0.12, 240);
  },
  raceGo() {
    if (muted) return;
    blip(520, 0.08, 'square', 0.16, 880);
    setTimeout(() => blip(880, 0.16, 'square', 0.18, 1320), 60);
    setTimeout(() => blip(660, 0.12, 'triangle', 0.12, 440), 140);
  },
  skillSuperSpeed() {
    if (muted) return;
    blip(160, 0.06, 'triangle', 0.1, 520);
    setTimeout(() => blip(320, 0.12, 'sawtooth', 0.09, 980), 25);
    setTimeout(() => blip(520, 0.18, 'triangle', 0.07, 1400), 60);
  },
  skillPushThrough() {
    if (muted) return;
    blip(62, 0.22, 'square', 0.24, 32);
    setTimeout(() => blip(48, 0.18, 'square', 0.2, 24), 55);
    setTimeout(() => blip(36, 0.28, 'sawtooth', 0.14, 18), 110);
  },
  skillJamSignal() {
    if (muted) return;
    for (let i = 0; i < 7; i++) {
      setTimeout(
        () => blip(720 + (i % 3) * 180, 0.035, 'square', 0.11, 280 + i * 40),
        i * 32,
      );
    }
    setTimeout(() => blip(1100, 0.08, 'sawtooth', 0.1, 350), 180);
    setTimeout(() => blip(880, 0.06, 'square', 0.08, 200), 240);
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

// Call once on first user gesture to unlock audio on browsers that require it
export function unlockAudio() {
  const c = ac();
  if (c && c.state === 'suspended') c.resume();
}
