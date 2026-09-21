import { formatMoney, formatTime, formatDateShort } from '../../lib/bookingFormat.js';

/**
 * The basket.
 *
 * Every line is re-checked against the live tee sheet each time this is
 * fetched, so a time that has gone or a price that has moved is shown as such
 * rather than silently corrected. Checkout is blocked until those are dealt
 * with, because the guest agreed to the old figure and has to see the new one.
 */
export default function Basket({ summary, config, onRemove, onCheckout, busy }) {
  const items = summary?.items ?? [];
  const totals = summary?.totals ?? {};

  if (!items.length) {
    return (
      <aside className="basket">
        <h2>Your basket</h2>
        <p className="muted">No tee times yet. Pick one from the sheet.</p>
      </aside>
    );
  }

  const deposit = Number(totals.depositAmount) || 0;
  const balance = Number(totals.balanceDue) || 0;

  return (
    <aside className="basket">
      <h2>Your basket</h2>

      <ul className="basket-items">
        {items.map((item) => (
          <li key={item.id} className={item.soldOut ? 'basket-item is-gone' : 'basket-item'}>
            <div className="basket-item-main">
              <strong>{item.courseName}</strong>
              <span className="muted">
                {formatDateShort(item.date)} · {formatTime(item.scheduledDateTime)} ·{' '}
                {item.players} {item.players === 1 ? 'player' : 'players'}
              </span>
              <span className="muted">{item.rateName}</span>

              {item.soldOut && (
                <span className="basket-flag is-error" role="alert">
                  No longer available — remove to continue
                </span>
              )}
              {item.priceChanged && !item.soldOut && (
                <span className="basket-flag" role="alert">
                  Price is now {formatMoney(item.currentQuote.grandTotal, config)}
                </span>
              )}
            </div>

            <div className="basket-item-side">
              <strong>{formatMoney(item.quote?.grandTotal, config)}</strong>
              <button
                type="button"
                className="btn-sm btn-danger"
                onClick={() => onRemove(item.id)}
                disabled={busy}
                aria-label={`Remove ${item.courseName} at ${formatTime(item.scheduledDateTime)}`}
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>

      <dl className="basket-totals">
        <div>
          <dt>Total</dt>
          <dd>{formatMoney(totals.grandTotal, config)}</dd>
        </div>
        {/* Only worth splitting out when they actually differ. */}
        {balance > 0 && (
          <>
            <div className="is-due">
              <dt>Pay now</dt>
              <dd>{formatMoney(deposit, config)}</dd>
            </div>
            <div>
              <dt>Due at the club</dt>
              <dd>{formatMoney(balance, config)}</dd>
            </div>
          </>
        )}
      </dl>

      <button
        type="button"
        className="btn-primary basket-checkout"
        onClick={onCheckout}
        disabled={busy || summary.hasProblems}
      >
        {summary.hasProblems ? 'Review your basket' : 'Continue to details'}
      </button>
    </aside>
  );
}
