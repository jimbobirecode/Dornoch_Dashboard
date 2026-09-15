/**
 * Every aggregation the Reports & Analytics page reads.
 *
 * Pure functions over already-serialised bookings, so the route stays thin and
 * the arithmetic is testable without a database. Each exported builder answers
 * one question the golf office actually asks; `buildAnalytics` composes them.
 */
import { PIPELINE_STAGES, TERMINAL_STATUSES, normaliseStatus } from './bookings-domain.js';

/** Revenue is only counted once a booking is actually committed. */
const COMMITTED = new Set(['Confirmed', 'Booked']);

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** Monday-first, the way a tee sheet is read. */
export const WEEK_ORDER = [...DAY_NAMES.slice(1), DAY_NAMES[0]];

export const GRANULARITIES = ['day', 'week', 'month'];

/** Ordered buckets, so the axis reads low to high rather than by frequency. */
export const LEAD_TIME_BUCKETS = [
  { key: '0–7 days', max: 7 },
  { key: '8–14 days', max: 14 },
  { key: '15–30 days', max: 30 },
  { key: '31–60 days', max: 60 },
  { key: '61–90 days', max: 90 },
  { key: '91–180 days', max: 180 },
  { key: '180+ days', max: Infinity },
];

export const PARTY_SIZE_BUCKETS = [
  { key: 'Single', min: 1, max: 1 },
  { key: 'Pair', min: 2, max: 2 },
  { key: '3-ball', min: 3, max: 3 },
  { key: '4-ball', min: 4, max: 4 },
  { key: '5–8', min: 5, max: 8 },
  { key: '9+', min: 9, max: Infinity },
];

/** Tee sheet bands. Dornoch's first tee goes out early and light runs late. */
export const TIME_BANDS = [
  { key: 'Before 09:00', min: 0, max: 8.9999 },
  { key: '09:00–11:59', min: 9, max: 11.9999 },
  { key: '12:00–13:59', min: 12, max: 13.9999 },
  { key: '14:00–16:59', min: 14, max: 16.9999 },
  { key: '17:00+', min: 17, max: 24 },
];

/**
 * '10:04 AM' / '09:20' / '7:30pm' -> hour as a float. Null when the row has no
 * usable time, which keeps "not specified" out of the utilisation grid rather
 * than piling it onto midnight.
 */
export function parseTeeHour(teeTime) {
  if (!teeTime) return null;
  const match = String(teeTime).trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)?/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();

  if (hour > 23 || minutes > 59) return null;
  if (meridiem === 'PM' && hour < 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;

  return hour + minutes / 60;
}

/** Whole days between the enquiry landing and the round being played. */
export function leadTimeDays(booking) {
  if (!booking.date || !booking.timestamp) return null;
  const teeDate = Date.parse(`${booking.date}T00:00:00Z`);
  const enquiry = Date.parse(booking.timestamp);
  if (Number.isNaN(teeDate) || Number.isNaN(enquiry)) return null;

  const days = Math.floor((teeDate - startOfUtcDay(enquiry)) / 86_400_000);
  // Rows backfilled after the round was played would otherwise read as negative.
  return days < 0 ? null : days;
}

/** The label a booking's tee date falls under at this granularity. */
export function bucketDate(date, granularity) {
  if (granularity === 'month') return `${date.slice(0, 7)}-01`;
  if (granularity === 'week') {
    const time = Date.parse(`${date}T00:00:00Z`);
    const weekday = (new Date(time).getUTCDay() + 6) % 7; // Monday = 0
    return new Date(time - weekday * 86_400_000).toISOString().slice(0, 10);
  }
  return date;
}

/**
 * Bookings and revenue over time, zero-filled across the whole span so a quiet
 * week reads as a trough rather than vanishing into a straight line.
 */
export function buildSeries(bookings, granularity = 'day') {
  const step = GRANULARITIES.includes(granularity) ? granularity : 'day';
  const dated = bookings.filter((booking) => booking.date);
  if (!dated.length) return [];

  const buckets = new Map();
  for (const booking of dated) {
    const key = bucketDate(booking.date, step);
    const entry = buckets.get(key) ?? { count: 0, revenue: 0, players: 0 };
    entry.count += 1;
    entry.players += num(booking.players);
    if (COMMITTED.has(booking.status)) entry.revenue += num(booking.total);
    buckets.set(key, entry);
  }

  const keys = [...buckets.keys()].sort();
  const series = [];
  for (const key of spanKeys(keys[0], keys.at(-1), step)) {
    const entry = buckets.get(key) ?? { count: 0, revenue: 0, players: 0 };
    series.push({
      date: key,
      count: entry.count,
      players: entry.players,
      revenue: round2(entry.revenue),
    });
  }
  return series;
}

/** Headline numbers, plus the same numbers for the preceding period. */
export function buildTotals(bookings, previous) {
  const totals = periodTotals(bookings);
  if (!previous) return totals;

  const before = periodTotals(previous);
  return {
    ...totals,
    previous: before,
    delta: {
      bookings: percentChange(before.bookings, totals.bookings),
      revenue: percentChange(before.revenue, totals.revenue),
      averageValue: percentChange(before.averageValue, totals.averageValue),
      players: percentChange(before.players, totals.players),
    },
  };
}

function periodTotals(bookings) {
  const committed = bookings.filter((booking) => COMMITTED.has(booking.status));
  const lost = bookings.filter((booking) => TERMINAL_STATUSES.includes(booking.status));

  return {
    bookings: bookings.length,
    revenue: round2(sum(committed, 'total')),
    averageValue: round2(committed.length ? sum(committed, 'total') / committed.length : 0),
    players: sum(bookings, 'players'),
    committed: committed.length,
    lost: lost.length,
    conversionRate: round1(bookings.length ? (committed.length / bookings.length) * 100 : 0),
    cancellationRate: round1(bookings.length ? (lost.length / bookings.length) * 100 : 0),
  };
}

/**
 * Stage-by-stage conversion. `conversionFromTop` narrows monotonically for the
 * funnel's geometry; `conversionFromPrevious` is the number that tells the
 * office *where* enquiries are actually being lost.
 */
export function buildFunnel(bookings) {
  const live = bookings.filter((booking) => !TERMINAL_STATUSES.includes(booking.status));
  const top = live.length || 1;

  let previousCount = null;
  return PIPELINE_STAGES.map((stage, index) => {
    const count = live.filter(
      (booking) => PIPELINE_STAGES.indexOf(normaliseStatus(booking.status)) >= index,
    ).length;

    const row = {
      stage,
      count,
      conversionFromTop: round1((count / top) * 100),
      conversionFromPrevious:
        previousCount === null ? 100 : round1(previousCount ? (count / previousCount) * 100 : 0),
      droppedHere: previousCount === null ? 0 : Math.max(previousCount - count, 0),
    };
    previousCount = count;
    return row;
  });
}

/** How far ahead people book — the number that drives when to open the sheet. */
export function buildLeadTime(bookings) {
  const days = bookings.map(leadTimeDays).filter((value) => value !== null);

  const distribution = LEAD_TIME_BUCKETS.map(({ key }) => ({ key, count: 0 }));
  for (const value of days) {
    const index = LEAD_TIME_BUCKETS.findIndex((bucket) => value <= bucket.max);
    distribution[index].count += 1;
  }

  return { distribution, median: median(days), average: days.length ? round1(mean(days)) : null };
}

export function buildPartySizes(bookings) {
  return PARTY_SIZE_BUCKETS.map(({ key, min, max }) => {
    const group = bookings.filter((booking) => {
      const players = num(booking.players);
      return players >= min && players <= max;
    });
    return {
      key,
      count: group.length,
      players: sum(group, 'players'),
      revenue: round2(sum(group.filter((b) => COMMITTED.has(b.status)), 'total')),
    };
  });
}

/**
 * Course mix. `golf_courses` is free text that may name several courses, so a
 * booking counts toward each course it mentions — the totals are deliberately
 * not a partition and the page says so.
 */
export function buildCourseMix(bookings, knownCourses = ['Championship', 'Struie']) {
  const rows = knownCourses.map((course) => ({ key: course, count: 0, revenue: 0, players: 0 }));
  const unspecified = { key: 'Not specified', count: 0, revenue: 0, players: 0 };

  for (const booking of bookings) {
    const text = String(booking.golfCourses ?? '').toLowerCase();
    const matched = rows.filter((row) => text.includes(row.key.toLowerCase()));
    for (const row of matched.length ? matched : [unspecified]) {
      row.count += 1;
      row.players += num(booking.players);
      if (COMMITTED.has(booking.status)) row.revenue += num(booking.total);
    }
  }

  return [...rows, unspecified]
    .filter((row) => row.count > 0)
    .map((row) => ({ ...row, revenue: round2(row.revenue) }))
    .sort((a, b) => b.count - a.count);
}

/** What share of parties also want a bed, and what those parties are worth. */
export function buildAccommodation(bookings) {
  const withStay = bookings.filter((booking) => booking.hotelRequired);
  const committedWith = withStay.filter((booking) => COMMITTED.has(booking.status));
  const committedWithout = bookings.filter(
    (booking) => !booking.hotelRequired && COMMITTED.has(booking.status),
  );

  return {
    total: bookings.length,
    withAccommodation: withStay.length,
    attachRate: round1(bookings.length ? (withStay.length / bookings.length) * 100 : 0),
    averageWith: round2(
      committedWith.length ? sum(committedWith, 'total') / committedWith.length : 0,
    ),
    averageWithout: round2(
      committedWithout.length ? sum(committedWithout, 'total') / committedWithout.length : 0,
    ),
  };
}

/**
 * Weekday × time-band grid. Every cell exists even at zero, so an unsold band
 * reads as a hole in the sheet instead of a missing row.
 */
export function buildUtilisation(bookings) {
  const cells = [];
  const index = new Map();

  for (const band of TIME_BANDS) {
    for (const day of WEEK_ORDER) {
      const cell = { band: band.key, day, count: 0, players: 0 };
      index.set(`${band.key}|${day}`, cell);
      cells.push(cell);
    }
  }

  let placed = 0;
  for (const booking of bookings) {
    const hour = parseTeeHour(booking.teeTime);
    if (hour === null || !booking.date) continue;

    const band = TIME_BANDS.find((entry) => hour >= entry.min && hour <= entry.max);
    const day = DAY_NAMES[new Date(`${booking.date}T00:00:00Z`).getUTCDay()];
    const cell = index.get(`${band.key}|${day}`);
    if (!cell) continue;

    cell.count += 1;
    cell.players += num(booking.players);
    placed += 1;
  }

  return { cells, bands: TIME_BANDS.map((band) => band.key), days: WEEK_ORDER, placed };
}

export function buildStatusBreakdown(bookings) {
  return [...PIPELINE_STAGES, ...TERMINAL_STATUSES].map((status) => {
    const group = bookings.filter((booking) => normaliseStatus(booking.status) === status);
    return {
      status,
      count: group.length,
      revenue: round2(sum(group, 'total')),
      players: sum(group, 'players'),
    };
  });
}

export function buildPopularTeeTimes(bookings, limit = 8) {
  const counts = new Map();
  for (const booking of bookings) {
    const key = booking.teeTime;
    if (!key || key === 'Not Specified') continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function buildBusiestDays(bookings) {
  return WEEK_ORDER.map((day) => ({
    key: day,
    count: bookings.filter(
      (booking) =>
        booking.date && DAY_NAMES[new Date(`${booking.date}T00:00:00Z`).getUTCDay()] === day,
    ).length,
  }));
}

export function buildAnalytics(bookings, { granularity = 'day', previous = null } = {}) {
  return {
    granularity: GRANULARITIES.includes(granularity) ? granularity : 'day',
    totals: buildTotals(bookings, previous),
    byStatus: buildStatusBreakdown(bookings),
    series: buildSeries(bookings, granularity),
    funnel: buildFunnel(bookings),
    leadTime: buildLeadTime(bookings),
    partySizes: buildPartySizes(bookings),
    courses: buildCourseMix(bookings),
    accommodation: buildAccommodation(bookings),
    utilisation: buildUtilisation(bookings),
    popularTeeTimes: buildPopularTeeTimes(bookings),
    busiestDays: buildBusiestDays(bookings),
  };
}

/* ---------- helpers ---------- */

function spanKeys(first, last, step) {
  const keys = [];
  const cursor = new Date(`${first}T00:00:00Z`);
  const end = Date.parse(`${last}T00:00:00Z`);

  while (cursor.getTime() <= end) {
    keys.push(cursor.toISOString().slice(0, 10));
    if (step === 'month') cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    else cursor.setUTCDate(cursor.getUTCDate() + (step === 'week' ? 7 : 1));
  }
  return keys;
}

function startOfUtcDay(time) {
  const date = new Date(time);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * Growth against a zero baseline is undefined rather than infinite — the page
 * shows "new" instead of a meaningless percentage.
 */
function percentChange(before, after) {
  if (!before) return after ? null : 0;
  return round1(((after - before) / before) * 100);
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const sum = (items, key) => items.reduce((total, item) => total + num(item[key]), 0);
const mean = (values) => values.reduce((total, value) => total + value, 0) / values.length;
const round2 = (value) => Math.round(value * 100) / 100;
const round1 = (value) => Math.round(value * 10) / 10;
