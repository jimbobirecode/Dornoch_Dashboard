import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TIME_BANDS,
  WEEK_ORDER,
  buildAccommodation,
  buildAnalytics,
  buildCourseMix,
  buildFunnel,
  buildLeadTime,
  buildPartySizes,
  buildSeries,
  buildTotals,
  buildUtilisation,
  bucketDate,
  leadTimeDays,
  parseTeeHour,
} from '../src/lib/analytics-domain.js';

/** Four bookings spanning both courses, both months and a cancellation. */
const ROWS = [
  { status: 'Booked', total: 400, players: 4, date: '2026-03-18', teeTime: '10:04 AM', timestamp: '2026-02-01T09:00:00Z', golfCourses: 'Championship Course', hotelRequired: true },
  { status: 'Confirmed', total: 200, players: 2, date: '2026-03-20', teeTime: '08:30', timestamp: '2026-03-18T09:00:00Z', golfCourses: 'Struie Course', hotelRequired: false },
  { status: 'Inquiry', total: 150, players: 3, date: '2026-04-02', teeTime: 'Not Specified', timestamp: '2026-03-01T09:00:00Z', golfCourses: '', hotelRequired: false },
  { status: 'Cancelled', total: 999, players: 2, date: '2026-04-05', teeTime: '14:15', timestamp: '2026-01-01T09:00:00Z', golfCourses: 'Championship Course and Struie Course', hotelRequired: true },
];

test('parses every tee-time spelling in this database', () => {
  assert.equal(parseTeeHour('10:04 AM'), 10 + 4 / 60);
  assert.equal(parseTeeHour('1:30 PM'), 13.5);
  assert.equal(parseTeeHour('12:00 AM'), 0, 'midnight is hour 0, not 12');
  assert.equal(parseTeeHour('12:30 PM'), 12.5, 'noon stays 12');
  assert.equal(parseTeeHour('09:20'), 9 + 20 / 60, '24-hour tee sheet');
  assert.equal(parseTeeHour('7:30pm'), 19.5);
  assert.equal(parseTeeHour('Not Specified'), null);
  assert.equal(parseTeeHour('25:00'), null);
});

test('lead time ignores rows backfilled after the round', () => {
  assert.equal(leadTimeDays({ date: '2026-03-18', timestamp: '2026-03-01T09:00:00Z' }), 17);
  assert.equal(leadTimeDays({ date: '2026-03-18', timestamp: '2026-03-18T23:00:00Z' }), 0, 'same day');
  assert.equal(leadTimeDays({ date: '2026-03-01', timestamp: '2026-03-18T09:00:00Z' }), null);
});

test('weeks bucket to their Monday', () => {
  assert.equal(bucketDate('2026-03-18', 'month'), '2026-03-01');
  assert.equal(bucketDate('2026-03-18', 'week'), '2026-03-16', 'Wednesday');
  assert.equal(bucketDate('2026-03-16', 'week'), '2026-03-16', 'Monday is its own week');
  assert.equal(bucketDate('2026-03-22', 'week'), '2026-03-16', 'Sunday closes the week before');
});

test('revenue counts only committed bookings', () => {
  const totals = buildTotals(ROWS, [{ status: 'Booked', total: 300, players: 2 }]);

  assert.equal(totals.revenue, 600, 'the cancelled 999 and the open 150 are excluded');
  assert.equal(totals.averageValue, 300);
  assert.equal(totals.committed, 2);
  assert.equal(totals.lost, 1);
  assert.equal(totals.conversionRate, 50);
  assert.equal(totals.cancellationRate, 25);
  assert.equal(totals.delta.revenue, 100, '300 to 600 is +100%');
});

test('growth from a zero baseline is undefined, not infinite', () => {
  const totals = buildTotals(ROWS, [{ status: 'Inquiry', total: 0, players: 0 }]);
  assert.equal(totals.delta.revenue, null);
});

test('the time series is zero-filled across the whole span', () => {
  const daily = buildSeries(ROWS, 'day');

  assert.equal(daily[0].date, '2026-03-18');
  assert.equal(daily.at(-1).date, '2026-04-05');
  assert.equal(daily.length, 19, 'every day exists');
  assert.ok(daily.some((day) => day.count === 0), 'quiet days read as troughs');
  assert.equal(daily.reduce((n, day) => n + day.count, 0), 4);
  assert.equal(daily.reduce((n, day) => n + day.revenue, 0), 600);
});

test('coarser granularities roll up', () => {
  assert.deepEqual(buildSeries(ROWS, 'month').map((m) => m.date), ['2026-03-01', '2026-04-01']);
  assert.deepEqual(buildSeries(ROWS, 'month').map((m) => m.count), [2, 2]);
  assert.ok(
    buildSeries(ROWS, 'week').every((w) => new Date(`${w.date}T00:00:00Z`).getUTCDay() === 1),
    'every week starts on a Monday',
  );
});

test('the funnel narrows and says where enquiries were lost', () => {
  const funnel = buildFunnel(ROWS);

  assert.equal(funnel[0].count, 3, 'the cancellation is excluded');
  assert.ok(funnel.every((s, i) => i === 0 || s.count <= funnel[i - 1].count), 'monotonic');
  assert.equal(funnel[0].conversionFromPrevious, 100, 'the top stage has no predecessor');
  assert.equal(funnel[1].droppedHere, 1, 'the open enquiry never advanced');
  assert.equal(funnel.at(-1).stage, 'Booked');
});

test('lead time distribution and median', () => {
  const lead = buildLeadTime(ROWS);

  assert.equal(lead.distribution.reduce((n, b) => n + b.count, 0), 4);
  assert.equal(lead.distribution[0].key, '0–7 days');
  assert.equal(lead.distribution[0].count, 1, 'the two-day booking');
  assert.equal(lead.median, 39, 'median of [2, 32, 45, 94] is 38.5, rounded');
  assert.equal(buildLeadTime([]).median, null);
});

test('party size buckets keep their empty rows', () => {
  const sizes = buildPartySizes(ROWS);

  assert.equal(sizes.find((b) => b.key === '4-ball').count, 1);
  assert.equal(sizes.find((b) => b.key === 'Pair').count, 2);
  assert.equal(sizes.find((b) => b.key === '9+').count, 0, 'the axis keeps its shape');
});

test('a booking naming both courses counts toward both', () => {
  const courses = buildCourseMix(ROWS);

  assert.equal(courses.find((c) => c.key === 'Championship').count, 2);
  assert.equal(courses.find((c) => c.key === 'Struie').count, 2);
  assert.equal(courses.find((c) => c.key === 'Not specified').count, 1);
  assert.ok(courses.every((c) => c.count > 0), 'courses nobody booked are dropped');
});

test('accommodation attach rate and basket size', () => {
  const stay = buildAccommodation(ROWS);

  assert.equal(stay.withAccommodation, 2);
  assert.equal(stay.attachRate, 50);
  assert.equal(stay.averageWith, 400, 'only the committed stay counts');
  assert.equal(stay.averageWithout, 200);
});

test('the utilisation grid is complete and drops untimed rows', () => {
  const grid = buildUtilisation(ROWS);
  const at = (band, day) => grid.cells.find((c) => c.band === band && c.day === day).count;

  assert.equal(grid.cells.length, TIME_BANDS.length * 7, 'every cell exists, even at zero');
  assert.equal(grid.placed, 3, 'the Not Specified row is not placed');
  assert.equal(at('09:00–11:59', 'Wednesday'), 1);
  assert.equal(at('Before 09:00', 'Friday'), 1);
  assert.equal(at('14:00–16:59', 'Sunday'), 1);
  assert.deepEqual(grid.days, WEEK_ORDER);
  assert.equal(grid.days[0], 'Monday', 'a tee sheet is read Monday-first');
});

test('buildAnalytics composes every section', () => {
  const analytics = buildAnalytics(ROWS, { granularity: 'nonsense' });

  assert.equal(analytics.granularity, 'day', 'an unknown granularity falls back');
  for (const key of ['totals', 'byStatus', 'series', 'funnel', 'leadTime', 'partySizes',
    'courses', 'accommodation', 'utilisation', 'popularTeeTimes', 'busiestDays']) {
    assert.ok(analytics[key] !== undefined, `missing ${key}`);
  }
  assert.equal(analytics.byStatus.length, 6);
  assert.ok(!analytics.popularTeeTimes.some((e) => e.key === 'Not Specified'));
});

test('an empty period does not throw', () => {
  const analytics = buildAnalytics([]);
  assert.equal(analytics.totals.bookings, 0);
  assert.equal(analytics.series.length, 0);
  assert.equal(analytics.leadTime.median, null);
});
