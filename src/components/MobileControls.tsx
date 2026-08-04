import { useCallback, useRef, useState } from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Direction } from '../game/engine';

interface Props {
  onDir: (dir: Direction | null) => void;
  /** Canvas外・左下ドック配置 */
  docked?: boolean;
}

function dirFromPoint(
  padEl: HTMLDivElement,
  clientX: number,
  clientY: number,
): Direction | null {
  const r = padEl.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const dx = clientX - cx;
  const dy = clientY - cy;
  if (Math.abs(dx) < r.width * 0.18 && Math.abs(dy) < r.height * 0.18) {
    return null;
  }
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? 'right' : 'left';
  }
  return dy > 0 ? 'down' : 'up';
}

function dirBtnClass(active: Direction | null, dir: Direction): string {
  return `mobile-controls-pad__btn${active === dir ? ' mobile-controls-pad__btn--active' : ''}`;
}

// On-screen D-pad for touch devices. Supports multi-touch (move + skill simultaneously).
export function MobileControls({ onDir, docked = false }: Props) {
  const [active, setActive] = useState<Direction | null>(null);
  const padRef = useRef<HTMLDivElement>(null);
  /** Active touch/pointer ids on the D-pad — each tracked independently. */
  const activePointersRef = useRef(new Map<number, { x: number; y: number }>());

  const applyDir = useCallback(
    (d: Direction | null) => {
      setActive((prev) => {
        if (prev !== d) onDir(d);
        return d;
      });
    },
    [onDir],
  );

  const syncDirFromPointers = useCallback(() => {
    const pad = padRef.current;
    const pointers = activePointersRef.current;
    if (!pad || pointers.size === 0) {
      applyDir(null);
      return;
    }
    const latest = Array.from(pointers.values()).at(-1)!;
    applyDir(dirFromPoint(pad, latest.x, latest.y));
  }, [applyDir]);

  const onPadPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      syncDirFromPointers();
    },
    [syncDirFromPointers],
  );

  const onPadPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!activePointersRef.current.has(e.pointerId)) return;
      e.preventDefault();
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      syncDirFromPointers();
    },
    [syncDirFromPointers],
  );

  const releasePointer = useCallback(
    (pointerId: number) => {
      if (!activePointersRef.current.delete(pointerId)) return;
      syncDirFromPointers();
    },
    [syncDirFromPointers],
  );

  const onPadPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      releasePointer(e.pointerId);
    },
    [releasePointer],
  );

  const onPadPointerCancel = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      releasePointer(e.pointerId);
    },
    [releasePointer],
  );

  return (
    <div className={`mobile-controls no-select ${docked ? 'mobile-controls--docked' : ''}`}>
      <div
        ref={padRef}
        className={`mobile-controls-pad${docked ? ' mobile-controls-pad--docked' : ''}${active ? ' mobile-controls-pad--pressed' : ''}`}
        style={{ touchAction: 'none' }}
        onPointerDown={onPadPointerDown}
        onPointerMove={onPadPointerMove}
        onPointerUp={onPadPointerUp}
        onPointerCancel={onPadPointerCancel}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="mobile-controls-pad__grid">
          <div className="mobile-controls-pad__spacer" />
          <div className={dirBtnClass(active, 'up')}>
            <ChevronUp className="mobile-controls-pad__icon" aria-hidden />
          </div>
          <div className="mobile-controls-pad__spacer" />
          <div className={dirBtnClass(active, 'left')}>
            <ChevronLeft className="mobile-controls-pad__icon" aria-hidden />
          </div>
          <div className="mobile-controls-pad__hub" aria-hidden />
          <div className={dirBtnClass(active, 'right')}>
            <ChevronRight className="mobile-controls-pad__icon" aria-hidden />
          </div>
          <div className="mobile-controls-pad__spacer" />
          <div className={dirBtnClass(active, 'down')}>
            <ChevronDown className="mobile-controls-pad__icon" aria-hidden />
          </div>
          <div className="mobile-controls-pad__spacer" />
        </div>
      </div>
      {!docked && (
        <p className="mobile-controls-hint">光る棚の方向を長押しでピッキング</p>
      )}
    </div>
  );
}
