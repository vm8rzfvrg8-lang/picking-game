export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export function easeOutQuad(t: number) {
  return 1 - (1 - t) * (1 - t);
}
