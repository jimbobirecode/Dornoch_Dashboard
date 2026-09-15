/**
 * Tee-date ranges. Every range is a pair of inclusive 'YYYY-MM-DD' strings (or
 * null for open-ended), which is exactly the shape the API's `from`/`to` query
 * parameters and `booking.date` use — so filtering never parses a date.
 */
export const DATE_PRESETS = [
  { id: 'all', label: 'All dates' },
  { id: 'next7', label: 'Next 7 days' },
  { id: 'next30', label: 'Next 30 days' },
  { id: 'next90', label: 'Next 90 days' },
  { id: 'next180', label: 'Next 6 months' },
  { id: 'thisMonth', label: 'This month' },
  { id: 'nextMonth', label: 'Next month' },
  { id: 'past30', label: 'Past 30 days' },
  { id: 'past90', label: 'Past 90 days' },
  { id: 'custom', label: 'Custom range…' },
];

export const DEFAULT_PRESET = 'all';

export function resolvePreset(preset, custom = {}) {
  const today = startOfToday();

  switch (preset) {
    case 'next7':
      return { from: iso(today), to: iso(addDays(today, 7)) };
    case 'next30':
      return { from: iso(today), to: iso(addDays(today, 30)) };
    case 'next90':
      return { from: iso(today), to: iso(addDays(today, 90)) };
    case 'next180':
      return { from: iso(today), to: iso(addDays(today, 180)) };
    case 'past30':
      return { from: iso(addDays(today, -30)), to: iso(today) };
    case 'past90':
      return { from: iso(addDays(today, -90)), to: iso(today) };
    case 'thisMonth':
      return monthRange(today, 0);
    case 'nextMonth':
      return monthRange(today, 1);
    case 'custom':
      // A half-filled custom range is treated as open on the unset side.
      return { from: custom.from || null, to: custom.to || null };
    case 'all':
    default:
      return { from: null, to: null };
  }
}

/** Undated bookings stay visible unless the reader narrows the range. */
export function withinRange(date, range) {
  if (!range || (!range.from && !range.to)) return true;
  if (!date) return false;
  if (range.from && date < range.from) return false;
  if (range.to && date > range.to) return false;
  return true;
}

function startOfToday() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function monthRange(today, offset) {
  const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset, 1));
  const last = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset + 1, 0));
  return { from: iso(first), to: iso(last) };
}

function iso(date) {
  return date.toISOString().slice(0, 10);
}
