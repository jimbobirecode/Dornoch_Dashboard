import { SERIES } from '../../lib/palette.js';

/**
 * A single ratio against its whole — Tremor's category bar.
 *
 * A meter, not a chart: one number against a limit. Both segments are labelled
 * in text, so the split never rests on the two fills being told apart.
 */
export function CategoryBar({ value, total, label, remainderLabel, color = SERIES }) {
  const share = total ? Math.min(Math.max((value / total) * 100, 0), 100) : 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-3 w-full overflow-hidden rounded-sm bg-surface-sunk">
        <div style={{ width: `${share}%`, background: color }} />
        {/* A 2px surface gap keeps the two fills from reading as one bar. */}
        <div className="w-0.5 shrink-0 bg-surface" />
      </div>
      <div className="flex items-baseline justify-between text-[0.8125rem]">
        <span className="text-ink-secondary">
          {label} <span className="font-semibold text-ink tabular-nums">{value}</span>
        </span>
        <span className="text-ink-muted">
          {remainderLabel} <span className="tabular-nums">{Math.max(total - value, 0)}</span>
        </span>
      </div>
    </div>
  );
}
