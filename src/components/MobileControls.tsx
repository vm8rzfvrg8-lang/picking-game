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

  const btnClass =
    'pointer-events-none flex items-center justify-center rounded-md border border-[#2a3a5d] bg-[#0c1530] text-[#9fb0d8] select-none';

  const padSize = docked ? 'h-[6.75rem] w-[6.75rem] sm:h-[7.25rem] sm:w-[7.25rem]' : 'h-40 w-40';
  const iconSize = docked ? 'h-5 w-5' : 'h-6 w-6';

  return (
    <div className={`mobile-controls no-select ${docked ? 'mobile-controls--docked' : ''}`}>
      <div
        ref={padRef}
        className={`relative grid ${padSize} grid-cols-3 grid-rows-3 gap-0.5`}
        style={{ touchAction: 'none' }}
        onPointerDown={onPadPointerDown}
        onPointerMove={onPadPointerMove}
        onPointerUp={onPadPointerUp}
        onPointerCancel={onPadPointerCancel}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div />
        <div className={btnClass}>
          <ChevronUp className={iconSize} />
        </div>
        <div />
        <div className={btnClass}>
          <ChevronLeft className={iconSize} />
        </div>
        <div className="flex items-center justify-center">
          <span className={`rounded-full ${active ? 'h-2 w-2 bg-[#3bd4ff]' : 'h-1.5 w-1.5 bg-[#2a3a5d]'}`} />
        </div>
        <div className={btnClass}>
          <ChevronRight className={iconSize} />
        </div>
        <div />
        <div className={btnClass}>
          <ChevronDown className={iconSize} />
        </div>
        <div />
      </div>
      {!docked && (
        <p className="text-center text-[10px] text-[#5a6a8d]">光る棚の方向を長押しでピッキング</p>
      )}
    </div>
  );
}
