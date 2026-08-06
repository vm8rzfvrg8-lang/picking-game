/**
 * Generates placeholder .wav files under public/sounds/.
 * Replace with real recordings — same filenames, or edit src/game/audio/manifest.ts.
 *
 * Run: node scripts/generate-sounds.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', 'public', 'sounds');
const SAMPLE_RATE = 44100;

function writeWav(filePath, samples) {
  const numSamples = samples.length;
  const buffer = Buffer.alloc(44 + numSamples * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples * 2, 40);
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);
}

/** Scream_Small — short yelp */
function synthScreamSmall(variant) {
  const dur = 0.16 + variant * 0.04;
  const n = Math.floor(dur * SAMPLE_RATE);
  const out = new Float32Array(n);
  const f0 = 300 + variant * 50;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = (1 - Math.exp(-t * 120)) * Math.exp(-t * (8 + variant));
    const f = f0 * (1 - t * 0.35);
    out[i] =
      (Math.sin(2 * Math.PI * f * t) * 0.6 + (Math.random() * 2 - 1) * 0.15) * env * 0.75;
  }
  return out;
}

/** Scream_Big — longer vocal burst */
function synthScreamBig(variant) {
  const dur = 0.42 + variant * 0.05;
  const n = Math.floor(dur * SAMPLE_RATE);
  const out = new Float32Array(n);
  const f0a = 220 + variant * 50;
  const f0b = 400 + variant * 35;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const attack = 1 - Math.exp(-t * 90);
    const decay = Math.exp(-t * (2 + variant * 0.25));
    const envVal = attack * decay;
    const f0 = f0a + (f0b - f0a) * Math.sin(t * (12 + variant * 2)) * Math.exp(-t * 2.5);
    const voice =
      Math.sin(2 * Math.PI * f0 * t) * 0.55 +
      Math.sin(2 * Math.PI * f0 * 1.85 * t) * 0.28;
    out[i] = (voice + (Math.random() * 2 - 1) * envVal * 0.38) * envVal * 0.9;
  }
  return out;
}

function synthFootstep(variant) {
  const dur = 0.11;
  const n = Math.floor(dur * SAMPLE_RATE);
  const out = new Float32Array(n);
  const pitch = 0.9 + variant * 0.08;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const thumpEnv = Math.exp(-t * 38);
    const thump = Math.sin(2 * Math.PI * (88 * pitch) * t * Math.exp(-t * 18)) * thumpEnv * 0.65;
    const squeakEnv = Math.exp(-(t - 0.012) * 55) * (t > 0.012 ? 1 : 0);
    out[i] = thump + (Math.random() * 2 - 1) * squeakEnv * 0.35;
  }
  return out;
}

function synthPaper(variant) {
  const dur = 0.16 + variant * 0.03;
  const n = Math.floor(dur * SAMPLE_RATE);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const envVal = Math.sin(Math.PI * t) * (1 - t * 0.25);
    out[i] = (Math.random() * 2 - 1) * envVal * 0.7;
  }
  return out;
}

function synthImpact(variant) {
  const dur = 0.14;
  const n = Math.floor(dur * SAMPLE_RATE);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const envVal = Math.exp(-t * (18 + variant * 4));
    const thump = Math.sin(2 * Math.PI * (105 + variant * 12) * t * Math.exp(-t * 22)) * envVal;
    out[i] = thump * 0.75 + (Math.random() * 2 - 1) * 0.35 * envVal;
  }
  return out;
}

/** Unified heavy knockback — thud + vocal burst (player & CPU). */
function synthKnockbackHeavy(variant) {
  const impact = synthImpact(variant % 2);
  const scream = synthScreamBig(variant);
  const n = Math.max(impact.length, scream.length);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = (impact[i] ?? 0) * 0.85 + (scream[i] ?? 0) * 0.75;
  }
  return out;
}

/** Unified light knockback — short bump + yelp. */
function synthKnockbackLight(variant) {
  const impact = synthImpact(0);
  const yelp = synthScreamSmall(variant);
  const n = Math.max(impact.length, yelp.length);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = (impact[i] ?? 0) * 0.45 + (yelp[i] ?? 0) * 0.9;
  }
  return out;
}

/** Comical banana slip — loud "tsuru!" squeak + "hyun!" swoosh (normalized to peak). */
function synthBananaSlip() {
  const dur = 0.38;
  const n = Math.floor(dur * SAMPLE_RATE);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const env = Math.sin(Math.PI * Math.min(1, t / 0.32)) * Math.exp(-t * 3.2);
    const squeak = Math.sin(2 * Math.PI * (1100 - t * 620) * t) * env * 0.72;
    const swoosh = Math.sin(2 * Math.PI * (420 - t * 280) * t) * env * 0.58;
    const noise = (Math.random() * 2 - 1) * env * 0.22;
    out[i] = squeak + swoosh + noise;
  }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) {
    const gain = 0.98 / peak;
    for (let i = 0; i < n; i++) out[i] *= gain;
  }
  return out;
}

const jobs = [
  ['voice/scream_s1.wav', () => synthScreamSmall(0)],
  ['voice/scream_s2.wav', () => synthScreamSmall(1)],
  ['voice/scream_s3.wav', () => synthScreamSmall(2)],
  ['voice/scream_b1.wav', () => synthScreamBig(0)],
  ['voice/scream_b2.wav', () => synthScreamBig(1)],
  ['voice/scream_b3.wav', () => synthScreamBig(2)],
  ['footstep/step-01.wav', () => synthFootstep(0)],
  ['footstep/step-02.wav', () => synthFootstep(1)],
  ['footstep/step-03.wav', () => synthFootstep(2)],
  ['pick/paper-01.wav', () => synthPaper(0)],
  ['pick/paper-02.wav', () => synthPaper(1)],
  ['pick/paper-03.wav', () => synthPaper(2)],
  ['crash/impact-01.wav', () => synthImpact(0)],
  ['crash/impact-02.wav', () => synthImpact(1)],
  ['knockback/kb_heavy_1.wav', () => synthKnockbackHeavy(0)],
  ['knockback/kb_heavy_2.wav', () => synthKnockbackHeavy(1)],
  ['knockback/kb_heavy_3.wav', () => synthKnockbackHeavy(2)],
  ['knockback/kb_light_1.wav', () => synthKnockbackLight(0)],
  ['knockback/kb_light_2.wav', () => synthKnockbackLight(1)],
  ['gimmicks/banana_slip.wav', () => synthBananaSlip()],
];

for (const [rel, fn] of jobs) {
  writeWav(path.join(ROOT, rel), fn());
  console.log('wrote', rel);
}

console.log('Done.');
