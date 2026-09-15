import { BRAND } from './brand.js';

const EMPTY = '—';

const number = new Intl.NumberFormat(BRAND.locale);
const currencyWhole = new Intl.NumberFormat(BRAND.locale, {
  style: 'currency',
  currency: BRAND.currency,
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const currencyExact = new Intl.NumberFormat(BRAND.locale, {
  style: 'currency',
  currency: BRAND.currency,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// Date-only values are 'YYYY-MM-DD' strings, so they are read as UTC and
// printed as UTC — otherwise a negative local offset shows the previous day.
const dateMedium = new Intl.DateTimeFormat(BRAND.locale, {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const dateDay = new Intl.DateTimeFormat(BRAND.locale, {
  day: '2-digit',
  month: 'short',
  timeZone: 'UTC',
});
// Timestamps are real instants, so these render in the club's own time zone.
const dateTime = new Intl.DateTimeFormat(BRAND.locale, {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: BRAND.timeZone,
});

export function formatNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? number.format(parsed) : EMPTY;
}

export function formatCurrency(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return EMPTY;
  return Number.isInteger(parsed) ? currencyWhole.format(parsed) : currencyExact.format(parsed);
}

/** 18 Mar 2026 */
export function formatDate(value) {
  const date = parseDateOnly(value);
  return date ? dateMedium.format(date) : EMPTY;
}

/** 18 Mar — the axis tick on the daily volume chart. */
export function formatDateShort(value) {
  const date = parseDateOnly(value);
  return date ? dateDay.format(date) : EMPTY;
}

/** 18 Mar 2026, 14:30 */
export function formatDateTime(value) {
  if (!value) return EMPTY;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? EMPTY : dateTime.format(date);
}

function parseDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const text = String(value);
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  const date = new Date(match ? `${match[1]}T00:00:00Z` : text);
  return Number.isNaN(date.getTime()) ? null : date;
}
