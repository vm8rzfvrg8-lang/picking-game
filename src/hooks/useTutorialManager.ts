import { useCallback, useRef, useState } from 'react';
import { TutorialManager } from '../game/tutorial/TutorialManager';
import type { TutorialCallback, TutorialCheckContext, TutorialSnapshot } from '../game/tutorial/types';

export function useTutorialManager(onReturnToStart: () => void) {
  const managerRef = useRef<TutorialManager | null>(null);
  if (!managerRef.current) {
    managerRef.current = new TutorialManager();
  }

  const [snapshot, setSnapshot] = useState<TutorialSnapshot>(() =>
    managerRef.current!.getSnapshot(),
  );

  const reset = useCallback(() => {
    managerRef.current!.reset();
    setSnapshot(managerRef.current!.getSnapshot());
  }, []);

  const start = useCallback((): TutorialCallback[] => {
    const callbacks = managerRef.current!.start();
    setSnapshot(managerRef.current!.getSnapshot());
    return callbacks;
  }, []);

  const tick = useCallback(
    (dtMs: number, ctx: TutorialCheckContext): TutorialCallback[] => {
      const result = managerRef.current!.update(dtMs, ctx);
      setSnapshot(result.snapshot);
      for (const cb of result.callbacks) {
        if (cb.type === 'returnToStart') {
          managerRef.current!.reset();
          onReturnToStart();
        }
      }
      return result.callbacks;
    },
    [onReturnToStart],
  );

  return { snapshot, reset, start, tick };
}
