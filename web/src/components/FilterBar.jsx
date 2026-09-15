import { ALL_STATUSES, statusColor } from '../lib/status.js';
import { DATE_PRESETS } from '../lib/dateRanges.js';

/** Filters live in one row above the data, per the interaction spec. */
export default function FilterBar({
  search,
  onSearch,
  preset,
  onPreset,
  custom,
  onCustom,
  statuses,
  onStatuses,
  onReset,
}) {
  function toggleStatus(status) {
    onStatuses(
      statuses.includes(status)
        ? statuses.filter((entry) => entry !== status)
        : [...statuses, status],
    );
  }

  return (
    <div className="stack" style={{ gap: '0.7rem' }}>
      <div className="toolbar">
        <div className="grow">
          <label className="sr-only" htmlFor="booking-search">
            Search bookings
          </label>
          <input
            id="booking-search"
            type="search"
            placeholder="Search by booking ID, email, course…"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
          />
        </div>

        <select
          value={preset}
          onChange={(event) => onPreset(event.target.value)}
          aria-label="Date range"
          style={{ width: 'auto' }}
        >
          {DATE_PRESETS.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>

        {preset === 'custom' && (
          <>
            <input
              type="date"
              value={custom.from ?? ''}
              onChange={(event) => onCustom({ ...custom, from: event.target.value })}
              aria-label="From date"
              style={{ width: 'auto' }}
            />
            <input
              type="date"
              value={custom.to ?? ''}
              onChange={(event) => onCustom({ ...custom, to: event.target.value })}
              aria-label="To date"
              style={{ width: 'auto' }}
            />
          </>
        )}

        <button type="button" onClick={onReset}>
          Reset
        </button>
      </div>

      <div className="toolbar" role="group" aria-label="Filter by status">
        {ALL_STATUSES.map((status) => {
          const active = statuses.includes(status);
          return (
            <button
              key={status}
              type="button"
              className="btn-sm"
              aria-pressed={active}
              onClick={() => toggleStatus(status)}
              style={{
                borderColor: active ? statusColor(status) : 'var(--border)',
                background: active ? 'var(--surface-2)' : 'transparent',
                color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <span
                className="legend-swatch"
                style={{ background: statusColor(status), borderRadius: '50%' }}
              />
              {status}
            </button>
          );
        })}
      </div>
    </div>
  );
}
