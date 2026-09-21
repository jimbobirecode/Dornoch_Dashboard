import { formatMoney, formatTime } from '../../lib/bookingFormat.js';

/**
 * The tee sheet: every course for the chosen day, side by side.
 *
 * One call fills all of this, as the engine's availability endpoint answers
 * every course at once — so switching day is a single request, not one per
 * course, and the columns never disagree about what is left.
 */
export default function TeeSheet({ courses, players, config, onSelect, busySlot }) {
  if (!courses.length) {
    return (
      <div className="empty">
        Nothing available for {players} {players === 1 ? 'player' : 'players'} on this date.
      </div>
    );
  }

  return (
    <div className="tee-sheet">
      {courses.map((course) => (
        <section key={course.courseRef} className="tee-sheet-course">
          <header className="tee-sheet-head">
            <h3>{course.name}</h3>
            <span className="muted">
              {course.slots.length} {course.slots.length === 1 ? 'time' : 'times'}
            </span>
          </header>

          {course.soldOut ? (
            <p className="muted tee-sheet-none">
              No times left for a {players === 1 ? 'single' : `group of ${players}`}.
            </p>
          ) : (
            <ul className="slot-grid">
              {course.slots.map((slot) => (
                <li key={slot.scheduledDateTime}>
                  <SlotButton
                    slot={slot}
                    course={course}
                    config={config}
                    busy={busySlot === slot.scheduledDateTime + course.courseRef}
                    onSelect={onSelect}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

function SlotButton({ slot, course, config, busy, onSelect }) {
  // "2 left" is only worth saying when it is nearly gone; on a fresh sheet it
  // is noise on every tile.
  const scarce = slot.availableCount <= 2;

  return (
    <button
      type="button"
      className="slot"
      disabled={busy}
      onClick={() => onSelect(course, slot)}
      aria-label={
        `${formatTime(slot.scheduledDateTime)} on ${course.name}, from ` +
        `${formatMoney(slot.basePrice, config)} per player, ${slot.availableCount} places left`
      }
    >
      <span className="slot-time">{formatTime(slot.scheduledDateTime)}</span>
      <span className="slot-price">
        {slot.basePrice === null ? '—' : `from ${formatMoney(slot.basePrice, config)}`}
      </span>
      {scarce && <span className="slot-scarce">{slot.availableCount} left</span>}
    </button>
  );
}
