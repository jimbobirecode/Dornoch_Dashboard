import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth } from '../auth.js';
import {
  ALL_STATUSES,
  PIPELINE_STAGES,
  serialiseBooking,
} from '../lib/bookings-domain.js';
import { getBookingColumns } from '../lib/schema.js';

const router = Router();
router.use(requireAuth);

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEK_ORDER = [...DAY_NAMES.slice(1), DAY_NAMES[0]]; // Monday-first

router.get('/', async (req, res, next) => {
  try {
    const columns = await getBookingColumns();
    const { rows } = await query(
      `SELECT ${columns.selectList} FROM public.bookings WHERE club = $1`,
      [req.user.customerId],
    );

    let bookings = rows.map(serialiseBooking);
    const { from, to } = req.query;
    if (from) bookings = bookings.filter((b) => b.date && b.date >= from);
    if (to) bookings = bookings.filter((b) => b.date && b.date <= to);

    res.json(buildAnalytics(bookings));
  } catch (err) {
    next(err);
  }
});

export function buildAnalytics(bookings) {
  const revenueStatuses = new Set(['Confirmed', 'Booked']);
  const totalRevenue = sum(bookings.filter((b) => revenueStatuses.has(b.status)), 'total');

  const byStatus = ALL_STATUSES.map((status) => {
    const group = bookings.filter((b) => normalise(b.status) === status);
    return {
      status,
      count: group.length,
      revenue: round2(sum(group, 'total')),
      players: sum(group, 'players'),
    };
  });

  return {
    totals: {
      bookings: bookings.length,
      // Revenue only counts what is actually committed, not open inquiries.
      revenue: round2(totalRevenue),
      averageValue: round2(bookings.length ? sum(bookings, 'total') / bookings.length : 0),
      players: sum(bookings, 'players'),
    },
    byStatus,
    daily: buildDaily(bookings),
    funnel: buildFunnel(bookings),
    popularTeeTimes: topN(countBy(bookings, (b) => b.teeTime).filter((e) => e.key !== 'Not Specified'), 8),
    busiestDays: WEEK_ORDER.map((day) => ({
      key: day,
      count: bookings.filter((b) => b.date && DAY_NAMES[new Date(`${b.date}T00:00:00Z`).getUTCDay()] === day).length,
    })),
  };
}

/** Zero-filled day series so the trend line has no phantom gaps. */
function buildDaily(bookings) {
  const dated = bookings.filter((b) => b.date);
  if (!dated.length) return [];

  const counts = new Map();
  for (const booking of dated) {
    const entry = counts.get(booking.date) ?? { count: 0, revenue: 0 };
    entry.count += 1;
    entry.revenue += booking.total;
    counts.set(booking.date, entry);
  }

  const dates = [...counts.keys()].sort();
  const series = [];
  for (
    let cursor = new Date(`${dates[0]}T00:00:00Z`), end = new Date(`${dates.at(-1)}T00:00:00Z`);
    cursor <= end;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const key = cursor.toISOString().slice(0, 10);
    const entry = counts.get(key) ?? { count: 0, revenue: 0 };
    series.push({ date: key, count: entry.count, revenue: round2(entry.revenue) });
  }
  return series;
}

/**
 * Each stage counts every booking that reached it or beyond, so the funnel
 * narrows monotonically the way a conversion funnel should.
 */
function buildFunnel(bookings) {
  const live = bookings.filter((b) => !['Rejected', 'Cancelled'].includes(b.status));

  return PIPELINE_STAGES.map((stage, index) => {
    const reached = live.filter(
      (b) => PIPELINE_STAGES.indexOf(normalise(b.status)) >= index,
    ).length;
    const top = live.length || 1;
    return {
      stage,
      count: reached,
      conversionFromTop: round1((reached / top) * 100),
    };
  });
}

function normalise(status) {
  return status === 'Pending' ? 'Inquiry' : status;
}

function countBy(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].map(([key, count]) => ({ key, count }));
}

function topN(entries, n) {
  return entries.sort((a, b) => b.count - a.count).slice(0, n);
}

const sum = (items, key) => items.reduce((acc, item) => acc + (Number(item[key]) || 0), 0);
const round2 = (n) => Math.round(n * 100) / 100;
const round1 = (n) => Math.round(n * 10) / 10;

export default router;
