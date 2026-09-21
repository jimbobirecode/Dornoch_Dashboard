/**
 * Formatting for the booking pages.
 *
 * The club's currency and locale come from its config rather than the browser's,
 * because the price shown has to be the price charged — a guest in Frankfurt
 * booking Dornoch is quoted pounds, not euros.
 */
export function formatMoney(amount, config) {
  const value = Number(amount) || 0;
  try {
    return new Intl.NumberFormat(config?.locale === 'EN' ? 'en-GB' : undefined, {
      style: 'currency',
      currency: config?.currency ?? 'GBP',
      minimumFractionDigits: value % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${config?.currencySymbol ?? '£'}${value.toFixed(2)}`;
  }
}

/** '2026-10-21T09:00:00' → '9:00 am'. Parsed as text: it is wall-clock at the
 *  course, and letting Date touch it would drag the viewer's zone in. */
export function formatTime(scheduledDateTime) {
  const match = String(scheduledDateTime ?? '').match(/T(\d{2}):(\d{2})/);
  if (!match) return '';

  const hours = Number(match[1]);
  const meridiem = hours < 12 ? 'am' : 'pm';
  const display = hours % 12 === 0 ? 12 : hours % 12;
  return `${display}:${match[2]} ${meridiem}`;
}

/** '2026-10-21' → 'Wednesday 21 October 2026', without a timezone shift. */
export function formatDate(date, { weekday = true } = {}) {
  const day = String(date ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';

  const parsed = new Date(`${day}T12:00:00Z`);
  return new Intl.DateTimeFormat('en-GB', {
    weekday: weekday ? 'long' : undefined,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
}

export function formatDateShort(date) {
  const day = String(date ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  }).format(new Date(`${day}T12:00:00Z`));
}

/** Today, plus or minus days, as YYYY-MM-DD. */
export function shiftDate(date, days) {
  const parsed = new Date(`${String(date).slice(0, 10)}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

/** The next `count` days from `start`, for the date strip. */
export function dateStrip(start, count, { earliest, latest } = {}) {
  const days = [];
  for (let index = 0; index < count; index += 1) {
    const day = shiftDate(start, index);
    if (earliest && day < earliest) continue;
    if (latest && day > latest) break;
    days.push(day);
  }
  return days;
}
