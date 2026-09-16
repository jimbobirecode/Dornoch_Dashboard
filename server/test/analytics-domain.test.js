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
  buildRequestUtilisation,
  buildTotals,
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

test('the request grid is complete and drops untimed rows', () => {
  const grid = buildRequestUtilisation(ROWS);
  const at = (band, day) => grid.cells.find((c) => c.band === band && c.day === day);

  assert.equal(grid.cells.length, TIME_BANDS.length * 7, 'every cell exists, even at zero');
  assert.equal(grid.placed, 3, 'the Not Specified row carries no slot to ask for');
  assert.equal(grid.unplaced, 1);
  assert.equal(at('09:00–11:59', 'Wednesday').requests, 1);
  assert.equal(at('Before 09:00', 'Friday').requests, 1);
  assert.equal(at('14:00–16:59', 'Sunday').requests, 1);
  assert.deepEqual(grid.days, WEEK_ORDER);
  assert.equal(grid.days[0], 'Monday', 'a tee sheet is read Monday-first');
});

test('the request grid separates what was asked for from what was booked', () => {
  const grid = buildRequestUtilisation(ROWS);
  const at = (band, day) => grid.cells.find((c) => c.band === band && c.day === day);

  const converted = at('09:00–11:59', 'Wednesday');
  assert.equal(converted.converted, 1);
  assert.equal(converted.missed, 0);
  assert.equal(converted.conversion, 100);
  assert.equal(converted.bookings, 1, 'asked for and played in the same band');
  assert.equal(converted.revenue, 400);

  const cancelled = at('14:00–16:59', 'Sunday');
  assert.equal(cancelled.requests, 1);
  assert.equal(cancelled.converted, 0);
  assert.equal(cancelled.declined, 1);
  assert.equal(cancelled.missed, 1, 'demand that walked away');
  assert.equal(cancelled.conversion, 0);
  assert.equal(cancelled.bookings, 0, 'a cancellation never occupies the sheet');

  assert.equal(grid.totals.requests, 3);
  assert.equal(grid.totals.converted, 2);
  assert.equal(grid.totals.declined, 1);
  assert.equal(grid.totals.open, 0, 'the open enquiry has no slot to sit in');
  assert.equal(grid.totals.missed, 1);
  assert.equal(grid.totals.conversion, 66.7);
  assert.equal(grid.totals.bookings, 2);
});

test('the form selection is the ask, the tee sheet is the booking', () => {
  const moved = [
    {
      status: 'Booked',
      total: 400,
      players: 4,
      date: '2026-03-18',
      teeTime: '02:30 PM',
      selectedTeeTimes: 'course: Championship, time: 08:10 AM',
      timestamp: '2026-02-01T09:00:00Z',
    },
  ];
  const grid = buildRequestUtilisation(moved);
  const at = (band) => grid.cells.find((c) => c.band === band && c.day === 'Wednesday');

  assert.equal(at('Before 09:00').requests, 1, 'the ask sits where they asked');
  assert.equal(at('Before 09:00').bookings, 0);
  assert.equal(at('Before 09:00').movedOut, 1);
  assert.equal(at('14:00–16:59').bookings, 1, 'the booking sits where they play');
  assert.equal(at('14:00–16:59').requests, 0);
  assert.equal(at('14:00–16:59').movedIn, 1);

  assert.equal(grid.totals.moved, 1);
  assert.deepEqual(grid.shifts.map((s) => [s.from, s.to, s.count]), [
    ['Before 09:00', '14:00–16:59', 1],
  ]);
});

test('gaps rank the slots people ask for and walk away from', () => {
  const rows = [
    // Two asked for Saturday morning, neither booked; one booked Monday morning.
    { status: 'Cancelled', players: 4, date: '2026-03-21', teeTime: '09:30' },
    { status: 'Inquiry', players: 2, date: '2026-03-21', teeTime: '10:30' },
    { status: 'Booked', players: 2, total: 200, date: '2026-03-16', teeTime: '09:30' },
  ];
  const grid = buildRequestUtilisation(rows);

  assert.equal(grid.gaps[0].key, 'Saturday · 09:00–11:59');
  assert.equal(grid.gaps[0].requests, 2);
  assert.equal(grid.gaps[0].missed, 2);
  assert.equal(grid.gaps[0].declined, 1);
  assert.equal(grid.gaps[0].open, 1, 'still live counts as not booked yet, separately');
  assert.equal(grid.gaps[0].conversion, 0);
  assert.equal(grid.gaps.length, 1, 'a fully converted slot is not a gap');
});

test('buildAnalytics composes every section', () => {
  const analytics = buildAnalytics(ROWS, { granularity: 'nonsense' });

  assert.equal(analytics.granularity, 'day', 'an unknown granularity falls back');
  for (const key of ['totals', 'byStatus', 'series', 'funnel', 'leadTime', 'partySizes',
    'courses', 'accommodation', 'requestUtilisation', 'popularTeeTimes', 'busiestDays']) {
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
