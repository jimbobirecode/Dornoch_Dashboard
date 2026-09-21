import { useState } from 'react';
import { formatMoney, formatTime, formatDate } from '../../lib/bookingFormat.js';

/**
 * Choosing the rate and the party size for a slot.
 *
 * The rates offered are the ones the engine returned for this slot, already
 * filtered to those the party qualifies for — a society rate with a minimum of
 * eight never reaches a fourball. The price shown is the engine's per-player
 * figure multiplied out here for display only; the amount charged is re-quoted
 * server-side when the time is added.
 */
export default function RatePicker({ course, slot, players, config, onConfirm, onCancel, error }) {
  const [rateRef, setRateRef] = useState(slot.rateTypes[0]?.rateRef ?? '');
  const [party, setParty] = useState(Math.min(players, slot.availableCount));
  const [saving, setSaving] = useState(false);

  const rate = slot.rateTypes.find((candidate) => candidate.rateRef === rateRef);
  const perPlayer = rate
    ? rate.rates.greenFee + rate.rates.cartFee + rate.rates.otherFee
    : 0;

  const partySizes = Array.from(
    { length: Math.min(slot.availableCount, config.maxPlayersPerBooking ?? 4) },
    (_, index) => index + 1,
  ).filter((size) => !rate || (rate.minimumPlayers || 0) <= size);

  async function confirm() {
    setSaving(true);
    try {
      await onConfirm({ rateRef, players: party, rateName: rate?.name });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rate-picker" role="dialog" aria-label="Choose a rate">
      <header>
        <h3>{course.name}</h3>
        <p className="muted">
          {formatDate(slot.scheduledDateTime)} at {formatTime(slot.scheduledDateTime)}
        </p>
      </header>

      <fieldset className="rate-options">
        <legend>Rate</legend>
        {slot.rateTypes.map((option) => {
          const total = option.rates.greenFee + option.rates.cartFee + option.rates.otherFee;
          return (
            <label key={option.rateRef} className="rate-option">
              <input
                type="radio"
                name="rate"
                value={option.rateRef}
                checked={rateRef === option.rateRef}
                onChange={(event) => setRateRef(event.target.value)}
              />
              <span className="rate-name">{option.name}</span>
              <span className="rate-price">{formatMoney(total, config)} <span className="muted">pp</span></span>
            </label>
          );
        })}
      </fieldset>

      <label className="field">
        <span>Players</span>
        <select value={party} onChange={(event) => setParty(Number(event.target.value))}>
          {partySizes.map((size) => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>
      </label>

      <div className="rate-total">
        <span>Total</span>
        <strong>{formatMoney(perPlayer * party, config)}</strong>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="row" style={{ gap: '0.5rem' }}>
        <button type="button" className="btn-primary" onClick={confirm} disabled={saving || !rate}>
          {saving ? 'Adding…' : 'Add to basket'}
        </button>
        <button type="button" onClick={onCancel} disabled={saving}>Back</button>
      </div>
    </div>
  );
}
