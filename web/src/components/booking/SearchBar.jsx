import { dateStrip, formatDateShort, shiftDate } from '../../lib/bookingFormat.js';

/**
 * Date, party size and time of day.
 *
 * The strip shows a week at a time and is clamped to the club's own booking
 * window, so the arrows stop rather than stepping into dates the engine will
 * refuse. `timeRanges` comes from the club config too — Cabot publishes one
 * all-day range, Dornoch splits morning from afternoon.
 */
export default function SearchBar({
  date, players, timeRange, config, window: bookingWindow, onChange,
}) {
  const days = dateStrip(date, 7, { earliest: bookingWindow.from, latest: bookingWindow.to });
  const ranges = Object.keys(config.timeRanges ?? {});

  const canGoBack = date > bookingWindow.from;
  const canGoForward = shiftDate(date, 7) <= bookingWindow.to;

  return (
    <div className="search-bar">
      <div className="search-row">
        <label className="field">
          <span>Date</span>
          <input
            type="date"
            value={date}
            min={bookingWindow.from}
            max={bookingWindow.to}
            onChange={(event) => event.target.value && onChange({ date: event.target.value })}
          />
        </label>

        <label className="field">
          <span>Players</span>
          <select
            value={players}
            onChange={(event) => onChange({ players: Number(event.target.value) })}
          >
            {Array.from({ length: config.maxPlayersPerBooking ?? 4 }, (_, i) => i + 1).map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </label>

        {ranges.length > 1 && (
          <label className="field">
            <span>Time</span>
            <select
              value={timeRange ?? ''}
              onChange={(event) => onChange({ timeRange: event.target.value || null })}
            >
              <option value="">Any time</option>
              {ranges.map((range) => (
                <option key={range} value={range}>{range}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="date-strip">
        <button
          type="button"
          className="btn-sm"
          disabled={!canGoBack}
          onClick={() => onChange({ date: maxDate(shiftDate(date, -7), bookingWindow.from) })}
          aria-label="Previous week"
        >
          ‹
        </button>

        {days.map((day) => (
          <button
            key={day}
            type="button"
            className={day === date ? 'date-chip is-active' : 'date-chip'}
            onClick={() => onChange({ date: day })}
            aria-pressed={day === date}
          >
            {formatDateShort(day)}
          </button>
        ))}

        <button
          type="button"
          className="btn-sm"
          disabled={!canGoForward}
          onClick={() => onChange({ date: shiftDate(date, 7) })}
          aria-label="Next week"
        >
          ›
        </button>
      </div>
    </div>
  );
}

const maxDate = (a, b) => (a > b ? a : b);
