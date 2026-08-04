import { type CountdownLabel, isGoLabel } from '../game/countdown';

interface Props {
  label: CountdownLabel | null;
  /** Bumps when the displayed step changes — retriggers pop animation. */
  animKey: number;
}

const SPARK_COUNT = 18;

export function CountdownOverlay({ label, animKey }: Props) {
  if (!label) return null;

  const go = isGoLabel(label);

  return (
    <div className="countdown-overlay" aria-live="assertive" aria-atomic="true">
      {go && (
        <div className="countdown-sparks" aria-hidden>
          {Array.from({ length: SPARK_COUNT }, (_, i) => (
            <span
              key={`${animKey}-spark-${i}`}
              className="countdown-spark"
              style={{ ['--spark-i' as string]: i }}
            />
          ))}
        </div>
      )}
      <p
        key={animKey}
        className={`countdown-digit${go ? ' countdown-digit--go' : ''}`}
      >
        {label}
      </p>
    </div>
  );
}
