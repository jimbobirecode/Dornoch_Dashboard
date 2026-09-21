import { formatMoney, formatTime, formatDate } from '../../lib/bookingFormat.js';

/** What was booked, and the reference to quote. */
export default function Confirmation({ confirmation, config, onBookAnother }) {
  const { totals } = confirmation;
  const balance = Number(totals.balanceDue) || 0;

  return (
    <div className="confirmation">
      <p className="confirmation-eyebrow">Booking confirmed</p>
      <h2>{confirmation.confirmationCode}</h2>
      <p className="muted">
        A confirmation has been sent to {confirmation.guest.email}. Quote this reference
        when you arrive.
      </p>

      <ul className="confirmation-items">
        {confirmation.items.map((item) => (
          <li key={item.id}>
            <strong>{item.courseName}</strong>
            <span className="muted">
              {formatDate(item.date)} at {formatTime(item.scheduledDateTime)} ·{' '}
              {item.players} {item.players === 1 ? 'player' : 'players'}
            </span>
            <span>{formatMoney(item.quote?.grandTotal, config)}</span>
          </li>
        ))}
      </ul>

      <dl className="basket-totals">
        <div><dt>Total</dt><dd>{formatMoney(totals.grandTotal, config)}</dd></div>
        <div className="is-due"><dt>Paid today</dt><dd>{formatMoney(totals.depositAmount, config)}</dd></div>
        {balance > 0 && (
          <div><dt>Due at the club</dt><dd>{formatMoney(balance, config)}</dd></div>
        )}
      </dl>

      <section className="policy">
        <h3>Cancellation</h3>
        <p className="muted">{confirmation.cancellationPolicy}</p>
      </section>

      <button type="button" onClick={onBookAnother}>Book another tee time</button>
    </div>
  );
}
