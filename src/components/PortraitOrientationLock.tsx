import { RotateCw, Smartphone } from 'lucide-react';

/** Full-screen overlay shown on portrait mobile/tablet — hidden in landscape via CSS. */
export function PortraitOrientationLock() {
  return (
    <div
      className="portrait-lock-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="端末を横向きにしてください"
    >
      <div className="portrait-lock-content">
        <div className="portrait-lock-icon-wrap" aria-hidden="true">
          <Smartphone className="portrait-lock-phone" strokeWidth={1.75} />
          <RotateCw className="portrait-lock-rotate" strokeWidth={2} />
        </div>
        <p className="portrait-lock-message">
          📱 スマホを横向きにしてプレイしてください
        </p>
        <p className="portrait-lock-hint">Landscape mode recommended</p>
      </div>
    </div>
  );
}
