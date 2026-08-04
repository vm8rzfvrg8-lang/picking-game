/** Shared warehouse game palette — keep in sync with :root vars in index.css */
export const PALETTE = {
  bgDark: '#1a1a24',
  floorGrey: '#8a929a',
  shelfWood: '#6e472d',
  safetyOrange: '#ff8c00',
  cautionYellow: '#f5c518',
  glowGreen: '#00ff66',
  glowRed: '#ff2a55',
  uiBlue: '#00a2ff',
  pixelBlack: '#101015',
  pixelWhite: '#f0f4f8',
} as const;

export type PaletteColor = (typeof PALETTE)[keyof typeof PALETTE];

/** Hex → rgba() for canvas fills. */
export function paletteAlpha(hex: PaletteColor | string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
