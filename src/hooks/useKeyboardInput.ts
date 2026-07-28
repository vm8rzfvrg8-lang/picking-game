import { useEffect, useRef } from 'react';
import { Direction } from '../game/engine';

const KEY_MAP: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
};

export interface KeyboardState {
  dir: Direction | null;
}

// Tracks held movement keys (pick = hold direction toward active shelf).
export function useKeyboardInput() {
  const ref = useRef<KeyboardState>({ dir: null });

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (KEY_MAP[e.code]) {
        e.preventDefault();
        ref.current.dir = KEY_MAP[e.code];
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (KEY_MAP[e.code] && ref.current.dir === KEY_MAP[e.code]) {
        ref.current.dir = null;
      }
    };
    const onBlur = () => {
      ref.current = { dir: null };
    };
    window.addEventListener('keydown', onDown, { passive: false });
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  return ref;
}
