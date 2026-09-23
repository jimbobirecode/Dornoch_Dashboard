import test from 'node:test';
import assert from 'node:assert/strict';
import {
  OPEN_STATUSES,
  WAITLIST_STATUSES,
  buildWaitlistConversion,
  buildWaitlistDemand,
  daysToConvert,
  mintWaitlistId,
  normaliseWaitlistStatus,
  serialiseWaitlistEntry,
  validateWaitlistEntry,
} from '../src/lib/waitlist-domain.js';

/** Two open, one converted, one that gave up. */
const ENTRIES = [
  { status: 'Waiting', players: 4, requestedDate: '2026-05-15', open: true, notificationSent: false, createdAt: '2026-01-01T09:00:00Z', convertedAt: null, convertedBookingId: null },
  { status: 'Notified', players: 2, requestedDate: '2026-05-15', open: true, notificationSent: true, createdAt: '2026-01-02T09:00:00Z', convertedAt: null, convertedBookingId: null },
  { status: 'Converted', players: 4, requestedDate: '2026-05-16', open: false, notificationSent: true, createdAt: '2026-01-01T09:00:00Z', convertedAt: '2026-01-11T09:00:00Z', convertedBookingId: 'BOOK-1' },
  { status: 'Cancelled', players: 2, requestedDate: '2026-05-16', open: false, notificationSent: true, createdAt: '2026-01-01T09:00:00Z', convertedAt: null, convertedBookingId: null },
];

const BOOKINGS = [
  { bookingId: 'BOOK-1', status: 'Booked', total: 1440 },
];

test('the status vocabulary is the one the Streamlit waitlist used', () => {
  assert.deepEqual(WAITLIST_STATUSES, ['Waiting', 'Notified', 'Converted', 'Cancelled']);
  assert.deepEqual(OPEN_STATUSES, ['Waiting', 'Notified']);
  assert.equal(normaliseWaitlistStatus('converted'), 'Converted');
  assert.equal(normaliseWaitlistStatus('nonsense'), 'Waiting', 'an unknown state is still open');
  assert.equal(normaliseWaitlistStatus(null), 'Waiting');
});

test('a serialised entry carries the conversion link and says whether it is open', () => {
  const entry = serialiseWaitlistEntry({
    waitlist_id: 'WL-1', guest_email: 'a@b.co', requested_date: new Date('2026-05-15T00:00:00'),
    players: '4', status: 'Converted', converted_booking_id: 'BOOK-9',
    converted_at: new Date('2026-01-11T09:00:00Z'), club: 'teemail',
  });

  assert.equal(entry.requestedDate, '2026-05-15');
  assert.equal(entry.players, 4, 'a text column still arrives as a number');
  assert.equal(entry.convertedBookingId, 'BOOK-9');
  assert.equal(entry.convertedAt, '2026-01-11T09:00:00.000Z');
  assert.equal(entry.open, false);
  assert.equal(serialiseWaitlistEntry({ waitlist_id: 'x', status: 'Waiting' }).open, true);
});

test('conversion is measured against entries that reached an ending', () => {
  const stats = buildWaitlistConversion(ENTRIES, BOOKINGS);

  assert.equal(stats.entries, 4);
  assert.equal(stats.open, 2);
  assert.equal(stats.converted, 1);
  assert.equal(stats.cancelled, 1);
  assert.equal(stats.settled, 2, 'the two still waiting have not finished');
  assert.equal(stats.conversionRate, 50, 'one of the two that ended became a booking');
  assert.equal(
    stats.conversionRateOfAll,
    25,
    'against every entry the same list reads half as good — both numbers are reported',
  );
  assert.equal(stats.playersWaiting, 6);
  assert.equal(stats.playersConverted, 4);
  assert.equal(stats.revenue, 1440);
  assert.equal(stats.medianDaysToConvert, 10);
});

test('an open list is never reported as a failure', () => {
  const allWaiting = [
    { status: 'Waiting', players: 4, open: true, createdAt: '2026-01-01T09:00:00Z' },
    { status: 'Waiting', players: 2, open: true, createdAt: '2026-01-01T09:00:00Z' },
  ];
  const stats = buildWaitlistConversion(allWaiting);

  assert.equal(stats.settled, 0);
  assert.equal(stats.conversionRate, 0, 'nothing has converted, but nothing has failed either');
  assert.equal(stats.open, 2);
  assert.equal(buildWaitlistConversion([]).entries, 0, 'an empty list does not throw');
});

test('a conversion whose booking was cancelled still converted, but is not revenue', () => {
  const stats = buildWaitlistConversion(ENTRIES, [{ bookingId: 'BOOK-1', status: 'Cancelled', total: 1440 }]);

  assert.equal(stats.converted, 1, 'the waitlist did its job');
  assert.equal(stats.revenue, 0, 'the same rule the rest of the reports follow');
  assert.equal(stats.unlinked, 0);
});

test('a conversion the backfill could not value is counted and flagged', () => {
  // The note-parsing backfill can link an entry to a booking that no longer
  // exists; the conversion is real, the revenue is simply unknown.
  const stats = buildWaitlistConversion(ENTRIES, []);
  assert.equal(stats.converted, 1);
  assert.equal(stats.unlinked, 1, 'so the revenue figure is a floor, not a total');
  assert.equal(stats.revenue, 0);
});

test('notification effectiveness is its own number', () => {
  const stats = buildWaitlistConversion(ENTRIES, BOOKINGS);
  // Three entries were told about an opening; one took it.
  assert.equal(stats.notified, 3);
  assert.equal(stats.notifiedConversionRate, 33.3);
});

test('time to convert ignores a clock that runs backwards', () => {
  assert.equal(daysToConvert({ createdAt: '2026-01-01T09:00:00Z', convertedAt: '2026-01-11T09:00:00Z' }), 10);
  assert.equal(daysToConvert({ createdAt: '2026-01-11T09:00:00Z', convertedAt: '2026-01-01T09:00:00Z' }), null);
  assert.equal(daysToConvert({ createdAt: null, convertedAt: '2026-01-01T09:00:00Z' }), null);
  assert.equal(buildWaitlistConversion([]).medianDaysToConvert, null);
});

test('demand ranks the dates people ask for and do not get', () => {
  const demand = buildWaitlistDemand(ENTRIES);

  const busiest = demand[0];
  assert.equal(busiest.date, '2026-05-15');
  assert.equal(busiest.players, 6);
  assert.equal(busiest.entries, 2);
  assert.equal(busiest.converted, 0);
  assert.equal(busiest.unmet, 2);
  assert.equal(busiest.conversion, 0);

  const other = demand.find((row) => row.date === '2026-05-16');
  assert.equal(other.conversion, 50);
  assert.equal(buildWaitlistDemand([]).length, 0);
});

test('a new entry needs an address, a date and a sane party size', () => {
  const good = validateWaitlistEntry({ guestEmail: ' A@B.co ', requestedDate: '2026-05-15', players: 4 });
  assert.equal(good.ok, true);
  assert.equal(good.value.guestEmail, 'a@b.co');
  assert.equal(good.value.priority, 5, 'the middle of the scale by default');

  assert.match(validateWaitlistEntry({ requestedDate: '2026-05-15', players: 4 }).errors[0], /email/);
  assert.match(validateWaitlistEntry({ guestEmail: 'a@b.co', players: 4 }).errors[0], /requested date/);
  assert.match(validateWaitlistEntry({ guestEmail: 'a@b.co', requestedDate: '2026-05-15', players: 0 }).errors[0], /Players/);
  assert.match(validateWaitlistEntry({ guestEmail: 'a@b.co', requestedDate: '15/05/2026', players: 4 }).errors[0], /requested date/);
  assert.match(
    validateWaitlistEntry({ guestEmail: 'a@b.co', requestedDate: '2026-05-15', players: 4, priority: 99 }).errors[0],
    /Priority/,
  );
});

test('a minted id is dated and unique enough to read', () => {
  const id = mintWaitlistId(new Date('2026-09-23T10:00:00Z'), () => 0.5);
  assert.match(id, /^WL-20260923-[0-9A-F]{4}$/);
  assert.notEqual(mintWaitlistId(new Date(), Math.random), mintWaitlistId(new Date(), Math.random));
});
