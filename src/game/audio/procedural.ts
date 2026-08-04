/** Web Audio procedural fallbacks when asset files are missing or still loading. */

function ac(ctx: AudioContext | null): AudioContext | null {
  return ctx;
}

function connectGain(
  c: AudioContext,
  vol: number,
  dur: number,
): GainNode {
  const gain = c.createGain();
  const now = c.currentTime;
  gain.gain.setValueAtTime(Math.max(0.0001, vol), now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  gain.connect(c.destination);
  return gain;
}

/** Retro square blip (UI / countdown / skills). */
export function synthBlip(
  ctx: AudioContext | null,
  freq: number,
  dur: number,
  type: OscillatorType = 'square',
  vol = 0.18,
  slideTo?: number,
) {
  const c = ac(ctx);
  if (!c) return;
  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = connectGain(c, vol, dur);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (slideTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), now + dur);
  }
  osc.connect(gain);
  osc.start(now);
  osc.stop(now + dur + 0.02);
}

/** Rubber-sole warehouse footstep: thump + squeak. */
export function synthFootstep(ctx: AudioContext | null, vol: number, variant: number) {
  const c = ac(ctx);
  if (!c) return;
  const now = c.currentTime;
  const pitch = 0.88 + (variant % 3) * 0.07;

  const thump = c.createOscillator();
  const thumpGain = c.createGain();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(95 * pitch, now);
  thump.frequency.exponentialRampToValueAtTime(42, now + 0.07);
  thumpGain.gain.setValueAtTime(vol * 0.55, now);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
  thump.connect(thumpGain).connect(c.destination);
  thump.start(now);
  thump.stop(now + 0.1);

  const bufLen = Math.floor(c.sampleRate * 0.04);
  const noiseBuf = c.createBuffer(1, bufLen, c.sampleRate);
  const ch = noiseBuf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) {
    ch[i] = (Math.random() * 2 - 1) * (1 - i / bufLen);
  }
  const noise = c.createBufferSource();
  noise.buffer = noiseBuf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 680 * pitch;
  bp.Q.value = 1.2;
  const nGain = c.createGain();
  nGain.gain.setValueAtTime(vol * 0.35, now + 0.012);
  nGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);
  noise.connect(bp).connect(nGain).connect(c.destination);
  noise.start(now + 0.012);
}

/** Paper rustle / page flip. */
export function synthPaperPick(ctx: AudioContext | null, vol: number, variant: number) {
  const c = ac(ctx);
  if (!c) return;
  const now = c.currentTime;
  const dur = 0.14 + (variant % 2) * 0.04;

  const bufLen = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, bufLen, c.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) {
    const t = i / bufLen;
    const env = Math.sin(Math.PI * t) * (1 - t * 0.35);
    ch[i] = (Math.random() * 2 - 1) * env;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 900 + variant * 120;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2400 + variant * 200;
  bp.Q.value = 0.7;
  const gain = connectGain(c, vol, dur);
  src.connect(hp).connect(bp).connect(gain);
  src.start(now);
}

/** Vocal-ish crash reaction — big knockback (placeholder until real voice files). */
export function synthScream(ctx: AudioContext | null, vol: number, variant: number) {
  const c = ac(ctx);
  if (!c) return;
  const now = c.currentTime;
  const dur = 0.38 + (variant % 3) * 0.06;
  const f0Start = 280 + variant * 40;
  const f0End = 520 + variant * 30;

  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(f0Start, now);
  osc.frequency.exponentialRampToValueAtTime(f0End, now + dur * 0.25);
  osc.frequency.exponentialRampToValueAtTime(f0Start * 0.7, now + dur);

  const osc2 = c.createOscillator();
  osc2.type = 'triangle';
  osc2.frequency.setValueAtTime(f0Start * 1.8, now);
  osc2.frequency.exponentialRampToValueAtTime(f0End * 1.5, now + dur * 0.2);

  const bufLen = Math.floor(c.sampleRate * dur);
  const nBuf = c.createBuffer(1, bufLen, c.sampleRate);
  const nCh = nBuf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) {
    const t = i / bufLen;
    nCh[i] = (Math.random() * 2 - 1) * Math.exp(-t * 4) * 0.4;
  }
  const noise = c.createBufferSource();
  noise.buffer = nBuf;

  const mixGain = c.createGain();
  mixGain.gain.setValueAtTime(0.0001, now);
  mixGain.gain.linearRampToValueAtTime(vol * 0.45, now + 0.015);
  mixGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  mixGain.connect(c.destination);

  const g1 = c.createGain();
  g1.gain.value = 0.55;
  const g2 = c.createGain();
  g2.gain.value = 0.35;
  osc.connect(g1).connect(mixGain);
  osc2.connect(g2).connect(mixGain);
  noise.connect(mixGain);

  osc.start(now);
  osc2.start(now);
  noise.start(now);
  osc.stop(now + dur);
  osc2.stop(now + dur);
}

/** Heavy body impact thud. */
export function synthCrashImpact(ctx: AudioContext | null, vol: number, variant: number) {
  const c = ac(ctx);
  if (!c) return;
  const now = c.currentTime;

  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(110 + variant * 15, now);
  osc.frequency.exponentialRampToValueAtTime(35, now + 0.12);
  const gain = connectGain(c, vol * 0.7, 0.14);
  osc.connect(gain);
  osc.start(now);
  osc.stop(now + 0.15);

  const bufLen = Math.floor(c.sampleRate * 0.08);
  const buf = c.createBuffer(1, bufLen, c.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < bufLen; i++) {
    ch[i] = (Math.random() * 2 - 1) * (1 - i / bufLen);
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 320;
  const nGain = connectGain(c, vol * 0.45, 0.1);
  src.connect(lp).connect(nGain);
  src.start(now);
}

/** Short yelp for light contact — Scream_Small fallback. */
export function synthScreamSmall(ctx: AudioContext | null, vol: number, variant: number) {
  const c = ac(ctx);
  if (!c) return;
  const now = c.currentTime;
  const dur = 0.18 + (variant % 3) * 0.03;
  const f0 = 320 + variant * 45;

  const osc = c.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(f0, now);
  osc.frequency.exponentialRampToValueAtTime(f0 * 0.75, now + dur);
  const gain = connectGain(c, vol * 0.55, dur);
  osc.connect(gain);
  osc.start(now);
  osc.stop(now + dur);
}

/** Big knockback scream — boosted full vocal synth. */
export function synthScreamBig(ctx: AudioContext | null, vol: number, variant: number) {
  synthScream(ctx, vol * 1.15, variant);
}

/** Rising combo chime — pitch & layers scale with combo tier. */
export function synthCombo(ctx: AudioContext | null, vol: number, combo: number, tier: number) {
  const c = ac(ctx);
  if (!c) return;
  const now = c.currentTime;
  const semitones = Math.min(combo - 1, 10);
  const base = 392 * Math.pow(2, semitones / 12);
  const layerCount = Math.min(1 + tier, 4);
  const types: OscillatorType[] = ['triangle', 'square', 'sine', 'triangle'];
  /** Root loudest; upper partials kept audible but lower to avoid clipping. */
  const layerPeaks = [0.44, 0.3, 0.24, 0.19];

  const mix = c.createGain();
  mix.gain.value = 1;
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 160;
  hp.Q.value = 0.65;
  const presence = c.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value = 3200;
  presence.Q.value = 1;
  presence.gain.value = 5;
  const air = c.createBiquadFilter();
  air.type = 'highshelf';
  air.frequency.value = 5200;
  air.gain.value = 4;
  mix.connect(hp).connect(presence).connect(air).connect(c.destination);

  for (let i = 0; i < layerCount; i++) {
    const ratio = i === 0 ? 1 : i === 1 ? 1.25 : i === 2 ? 1.5 : 2;
    const freq = base * ratio;
    const start = now + i * 0.04;
    const dur = 0.11 + i * 0.018;
    const osc = c.createOscillator();
    osc.type = types[i] ?? 'triangle';
    osc.frequency.setValueAtTime(freq, start);
    if (i === 0) {
      osc.frequency.exponentialRampToValueAtTime(freq * 1.1, start + dur * 0.32);
    }
    const gain = c.createGain();
    const peak = vol * (layerPeaks[i] ?? 0.16);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(Math.max(0.0001, peak), start + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain).connect(mix);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  const spark = c.createOscillator();
  spark.type = 'square';
  spark.frequency.setValueAtTime(base * 3.5, now);
  spark.frequency.exponentialRampToValueAtTime(base * 4.2, now + 0.05);
  const sparkGain = c.createGain();
  sparkGain.gain.setValueAtTime(0.0001, now);
  sparkGain.gain.linearRampToValueAtTime(vol * 0.14, now + 0.003);
  sparkGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
  spark.connect(sparkGain).connect(mix);
  spark.start(now);
  spark.stop(now + 0.07);

  if (combo >= 5) {
    const shimmer = c.createOscillator();
    shimmer.type = 'sine';
    shimmer.frequency.setValueAtTime(base * 2.5, now + 0.05);
    shimmer.frequency.exponentialRampToValueAtTime(base * 3.4, now + 0.22);
    const sGain = c.createGain();
    sGain.gain.setValueAtTime(0.0001, now + 0.05);
    sGain.gain.linearRampToValueAtTime(vol * 0.28, now + 0.058);
    sGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    shimmer.connect(sGain).connect(mix);
    shimmer.start(now + 0.05);
    shimmer.stop(now + 0.24);
  }
}
