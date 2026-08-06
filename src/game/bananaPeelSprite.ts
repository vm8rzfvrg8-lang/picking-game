/** Transparent banana peel trap sprite (public/images/banana_peel.png). */
export const BANANA_PEEL_IMAGE_URL = '/images/banana_peel.png';

let peelImage: HTMLImageElement | null = null;
let loadStarted = false;

export function loadBananaPeelImage(): void {
  if (loadStarted || typeof Image === 'undefined') return;
  loadStarted = true;
  const img = new Image();
  img.decoding = 'async';
  img.src = BANANA_PEEL_IMAGE_URL;
  img.onload = () => {
    peelImage = img;
  };
}

export function isBananaPeelImageReady(): boolean {
  return peelImage != null && peelImage.complete && peelImage.naturalWidth > 0;
}

export function getBananaPeelImage(): HTMLImageElement | null {
  return isBananaPeelImageReady() ? peelImage : null;
}
