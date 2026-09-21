import { useState } from 'react';
import { formatMoney } from '../../lib/bookingFormat.js';

/**
 * Guest details and payment.
 *
 * Which fields appear, and which are mandatory, come from the club's config
 * rather than being hard-coded — Cabot asks for a postcode and not a country,
 * Dornoch the reverse, and neither form is written twice. Server-side
 * validation returns the same field names, so a rejected submit marks the
 * offending inputs rather than showing one summary line.
 */
const FIELDS = [
  { name: 'title', label: 'Title', flag: 'titleRequired', autoComplete: 'honorific-prefix' },
  { name: 'firstName', label: 'First name', flag: 'firstNameRequired', autoComplete: 'given-name' },
  { name: 'lastName', label: 'Last name', flag: 'lastNameRequired', autoComplete: 'family-name' },
  { name: 'email', label: 'Email', flag: 'emailRequired', type: 'email', autoComplete: 'email' },
  { name: 'phone', label: 'Phone', flag: 'phoneRequired', type: 'tel', autoComplete: 'tel' },
  { name: 'address', label: 'Address', flag: 'addressRequired', autoComplete: 'street-address' },
  { name: 'city', label: 'City', flag: 'cityRequired', autoComplete: 'address-level2' },
  { name: 'state', label: 'County', flag: 'stateRequired', autoComplete: 'address-level1' },
  { name: 'postcode', label: 'Postcode', flag: 'pincodeRequired', autoComplete: 'postal-code' },
  { name: 'country', label: 'Country', flag: 'countryRequired', autoComplete: 'country-name' },
];

export default function GuestForm({ config, totals, onSubmit, onBack, error, fieldErrors }) {
  const [guest, setGuest] = useState({});
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);

  // A field the club does not require is still offered when it is part of the
  // contact details; the ones it never asks for are left off entirely.
  const shown = FIELDS.filter(
    (field) => config[field.flag] || ['firstName', 'lastName', 'email', 'phone'].includes(field.name),
  );

  const set = (name) => (event) => setGuest((current) => ({ ...current, [name]: event.target.value }));

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSubmit({ guest, agreedToPolicy: agreed });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="guest-form" onSubmit={submit} noValidate>
      <h2>Your details</h2>

      <div className="guest-fields">
        {shown.map((field) => (
          <label key={field.name} className="field">
            <span>
              {field.label}
              {config[field.flag] && <em aria-hidden="true"> *</em>}
            </span>
            <input
              type={field.type ?? 'text'}
              name={field.name}
              autoComplete={field.autoComplete}
              value={guest[field.name] ?? ''}
              onChange={set(field.name)}
              aria-invalid={Boolean(fieldErrors?.[field.name])}
              aria-describedby={fieldErrors?.[field.name] ? `${field.name}-error` : undefined}
            />
            {fieldErrors?.[field.name] && (
              <span className="field-error" id={`${field.name}-error`}>
                {fieldErrors[field.name]}
              </span>
            )}
          </label>
        ))}
      </div>

      <section className="policy">
        <h3>Deposit and cancellation</h3>
        <p className="muted">{config.depositPolicy}</p>
        <p className="muted">{config.cancellationPolicy}</p>

        <label className="checkbox">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span>I accept the deposit and cancellation policy</span>
        </label>
      </section>

      {config.creditCardRequired && (
        <p className="muted payment-note">
          Payment is taken on the next step by {config.propertyName}&rsquo;s payment provider.
          Card details are never held by this site.
        </p>
      )}

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="row" style={{ gap: '0.5rem', alignItems: 'center' }}>
        <button type="submit" className="btn-primary" disabled={saving || !agreed}>
          {saving ? 'Confirming…' : `Pay ${formatMoney(totals.depositAmount, config)} and book`}
        </button>
        <button type="button" onClick={onBack} disabled={saving}>Back to basket</button>
      </div>
    </form>
  );
}
