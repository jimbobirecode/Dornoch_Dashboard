import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bookableSlots,
  basePrice,
  bookingWindow,
  cartTotals,
  confirmationCode,
  daysBefore,
  filterSlotsByRange,
  isWithinBookingWindow,
  minutesOfDay,
  parseTimeRange,
  quoteLine,
  refundFor,
  requiredGuestFields,
  validateGuest,
} from '../src/lib/booking/engine-domain.js';
import { bookingConfig, publicConfig } from '../src/lib/booking/property-config.js';

/** Cabot's visitor rate, as its engine reports it: VAT-inclusive, full deposit. */
const VISITOR = {
  rateRef: '194038',
  name: 'Visitor Online Booking',
  rates: { greenFee: 385, cartFee: 0, otherFee: 0 },
  taxPercent: 0,
  depositPercent: 100,
  minimumPlayers: 0,
};

test('a rate is quoted per player, as the live engine does', () => {
  const quote = quoteLine({ rate: VISITOR, players: 4 });

  // The captured cart charged a four-ball 4 x 385 = 1540.
  assert.equal(quote.totalPrice, 1540);
  assert.equal(quote.grandTotal, 1540);
  assert.equal(quote.depositAmount, 1540, 'Cabot takes the full amount up front');
  assert.equal(quote.balanceDue, 0);
  assert.equal(quote.players, 4);
});

test('tax is added on top where the club prices ex-VAT', () => {
  const quote = quoteLine({
    rate: { ...VISITOR, rates: { greenFee: 100, cartFee: 20, otherFee: 0 }, taxPercent: 20 },
    players: 2,
  });

  assert.equal(quote.greenFee, 200);
  assert.equal(quote.cartFee, 40);
  assert.equal(quote.greenFeeTax, 40);
  assert.equal(quote.cartFeeTax, 8);
  assert.equal(quote.totalTax, 48);
  assert.equal(quote.grandTotal, 288);
});

test('a part deposit leaves the rest owing at the club', () => {
  const quote = quoteLine({ rate: { ...VISITOR, depositPercent: 25 }, players: 2 });

  assert.equal(quote.grandTotal, 770);
  assert.equal(quote.depositAmount, 192.5);
  assert.equal(quote.balanceDue, 577.5);
});

test('caddie fees are charged per bag and stay out of the deposit', () => {
  const quote = quoteLine({ rate: VISITOR, players: 4, caddies: 2, caddieFee: 60 });

  assert.equal(quote.caddieTotal, 120);
  assert.equal(quote.grandTotal, 1660, 'caddies are part of the total');
  assert.equal(quote.depositAmount, 1540, 'but never part of what is paid now');
  assert.equal(quote.balanceDue, 120);
});

test('a party of nobody is still a party of one', () => {
  assert.equal(quoteLine({ rate: VISITOR, players: 0 }).players, 1);
  assert.equal(quoteLine({ rate: VISITOR, players: -3 }).players, 1);
  assert.equal(quoteLine({ rate: VISITOR }).totalPrice, 385);
});

test('a cart adds up its lines', () => {
  const totals = cartTotals([
    { quote: quoteLine({ rate: VISITOR, players: 1 }) },
    { quote: quoteLine({ rate: VISITOR, players: 4 }) },
  ]);

  // The captured basket held exactly these two and showed £1,925.
  assert.equal(totals.grandTotal, 1925);
  assert.equal(totals.depositAmount, 1925);
  assert.equal(totals.itemCount, 2);
  assert.equal(totals.players, 5);
});

test('an empty cart totals zero rather than NaN', () => {
  const totals = cartTotals([]);
  assert.equal(totals.grandTotal, 0);
  assert.equal(totals.itemCount, 0);
  assert.equal(cartTotals(null).grandTotal, 0);
});

test("Cabot's cancellation tiers follow its published terms", () => {
  const terms = { playDate: '2026-09-25', amount: 1540 };

  // More than 8 weeks out: refunded in full.
  assert.equal(refundFor({ ...terms, cancelledOn: '2026-07-01' }).refundPercent, 100);
  // Between 4 and 8 weeks: half.
  assert.equal(refundFor({ ...terms, cancelledOn: '2026-08-15' }).refundPercent, 50);
  assert.equal(refundFor({ ...terms, cancelledOn: '2026-08-15' }).refundAmount, 770);
  // Inside 4 weeks: nothing.
  assert.equal(refundFor({ ...terms, cancelledOn: '2026-09-10' }).refundAmount, 0);
  assert.equal(refundFor({ ...terms, cancelledOn: '2026-09-10' }).forfeited, 1540);
});

test('the tier boundaries fall on the right side', () => {
  const terms = { playDate: '2026-09-25', amount: 100 };

  // 56 days is exactly 8 weeks and still refunds in full.
  assert.equal(refundFor({ ...terms, cancelledOn: '2026-07-31' }).daysBefore, 56);
  assert.equal(refundFor({ ...terms, cancelledOn: '2026-07-31' }).refundPercent, 100);
  assert.equal(refundFor({ ...terms, cancelledOn: '2026-08-01' }).refundPercent, 50);
  // 28 days is exactly 4 weeks and still refunds half.
  assert.equal(refundFor({ ...terms, cancelledOn: '2026-08-28' }).refundPercent, 50);
  assert.equal(refundFor({ ...terms, cancelledOn: '2026-08-29' }).refundPercent, 0);
});

test('cancelling after the round refunds nothing', () => {
  const after = refundFor({ playDate: '2026-09-25', cancelledOn: '2026-09-30', amount: 500 });
  assert.equal(after.daysBefore, -5);
  assert.equal(after.refundAmount, 0);
});

test('days before a round ignore the time of day', () => {
  assert.equal(daysBefore('2026-09-25', '2026-09-24'), 1);
  assert.equal(daysBefore('2026-09-25T08:12:00', '2026-09-25'), 0);
  assert.equal(daysBefore('nonsense', '2026-09-25'), null);
});

test("the booking window runs out to the club's days-out setting", () => {
  // Cabot sells 591 days ahead, which is why its calendar reaches 2027.
  const window = bookingWindow(bookingConfig('cabot_highlands'), '2026-09-21');
  assert.equal(window.days, 591);
  assert.equal(window.to, '2028-05-04');

  assert.ok(isWithinBookingWindow('2027-06-01', bookingConfig('cabot_highlands'), '2026-09-21'));
  assert.ok(!isWithinBookingWindow('2029-01-01', bookingConfig('cabot_highlands'), '2026-09-21'));
});

test('required guest fields come from the club config, not the form', () => {
  const cabot = requiredGuestFields(bookingConfig('cabot_highlands')).map((field) => field.name);

  assert.deepEqual(cabot, ['firstName', 'lastName', 'email', 'phone', 'postcode']);
  assert.ok(!cabot.includes('country'), 'Cabot does not ask for a country');

  const dornoch = requiredGuestFields(bookingConfig('royal_dornoch')).map((field) => field.name);
  assert.ok(dornoch.includes('country'), 'Dornoch does');
  assert.ok(!dornoch.includes('postcode'));
});

test('guest details are validated against that same config', () => {
  const config = bookingConfig('cabot_highlands');

  const empty = validateGuest({}, config);
  assert.deepEqual(Object.keys(empty).sort(), ['email', 'firstName', 'lastName', 'phone', 'postcode']);

  const good = validateGuest(
    { firstName: 'A', lastName: 'B', email: 'a@b.com', phone: '01463796111', postcode: 'IV2 7JL' },
    config,
  );
  assert.deepEqual(good, {});
});

test('a malformed email is caught even when not required', () => {
  const optional = { ...bookingConfig('royal_dornoch'), emailRequired: false };

  assert.equal(validateGuest({ email: 'not-an-address' }, optional).email, 'Enter a valid email address.');
  assert.equal(validateGuest({ email: '' }, optional).email, undefined, 'blank is allowed');
  assert.equal(validateGuest({ phone: '123' }, optional).phone, 'Enter a valid phone number.');
});

test('whitespace is not a name', () => {
  const errors = validateGuest(
    { firstName: '   ', lastName: 'B', email: 'a@b.com', phone: '01463796111', postcode: 'IV2' },
    bookingConfig('cabot_highlands'),
  );
  assert.ok(errors.firstName);
});

test('a time range parses into minutes, in either clock', () => {
  assert.deepEqual(parseTimeRange('8:00 AM - 4:00 PM'), { startMinutes: 480, endMinutes: 960 });
  assert.deepEqual(parseTimeRange('06:30 - 18:00'), { startMinutes: 390, endMinutes: 1080 });
  assert.equal(parseTimeRange('whenever'), null);
  assert.equal(minutesOfDay('2026-09-25T08:12:00'), 492);
});

test('12 AM and 12 PM land on the right halves of the day', () => {
  assert.deepEqual(parseTimeRange('12:00 AM - 12:00 PM'), { startMinutes: 0, endMinutes: 720 });
});

const slot = (time, available = 4, rates = [VISITOR]) => ({
  scheduledDateTime: `2026-09-25T${time}:00`,
  availableCount: available,
  rateTypes: rates,
});

test('slots filter to a named time range', () => {
  const slots = [slot('07:00'), slot('09:00'), slot('13:00'), slot('17:00')];
  const morning = filterSlotsByRange(slots, 'Morning', { Morning: '6:30 AM - 11:59 AM' });

  assert.deepEqual(morning.map((s) => s.scheduledDateTime.slice(11, 16)), ['07:00', '09:00']);
});

test('an unknown range shows the whole day rather than nothing', () => {
  const slots = [slot('07:00'), slot('13:00')];
  assert.equal(filterSlotsByRange(slots, 'Twilight', { Morning: '6:30 AM - 11:59 AM' }).length, 2);
});

test('a party only sees slots it fits in', () => {
  const slots = [slot('08:00', 1), slot('08:12', 4), slot('08:24', 2)];

  assert.deepEqual(
    bookableSlots(slots, 4).map((s) => s.scheduledDateTime.slice(11, 16)),
    ['08:12'],
  );
  assert.equal(bookableSlots(slots, 1).length, 3);
});

test("a rate's own minimum can rule it out for a small party", () => {
  const society = { ...VISITOR, rateRef: '999', name: 'Society', minimumPlayers: 8 };
  const slots = [slot('08:12', 4, [VISITOR, society])];

  // The pair sees only the visitor rate, and the slot survives because one rate does.
  assert.deepEqual(bookableSlots(slots, 2)[0].rateTypes.map((r) => r.rateRef), ['194038']);
  // A slot whose every rate is out of reach drops away entirely.
  assert.equal(bookableSlots([slot('08:12', 4, [society])], 2).length, 0);
});

test('the base price is the cheapest public rate on the slot', () => {
  const member = { ...VISITOR, rateRef: '242994', rates: { greenFee: 170, cartFee: 0, otherFee: 0 } };
  const trade = { ...VISITOR, rateRef: '1', isPrivate: true, rates: { greenFee: 5, cartFee: 0, otherFee: 0 } };

  assert.equal(basePrice(slot('08:12', 4, [VISITOR, member, trade])), 170);
  assert.equal(basePrice(slot('08:12', 4, [])), null, 'no rates, no price');
});

test('the base price adds the fee kinds together', () => {
  const buggy = { ...VISITOR, rates: { greenFee: 100, cartFee: 25, otherFee: 5 } };
  assert.equal(basePrice(slot('08:12', 4, [buggy])), 130);
});

test('provider credentials never reach the browser', () => {
  const published = publicConfig(bookingConfig('cabot_highlands'));

  assert.equal(published.agilysys, undefined);
  assert.equal(published.providerKind, 'agilysys');
  assert.equal(published.bookingDaysOut, 591);
  assert.match(published.cancellationPolicy, /8 weeks/);
});

test('an unknown club falls back rather than failing', () => {
  assert.equal(bookingConfig('nowhere-gc').club, 'royal_dornoch');
  assert.equal(bookingConfig('Cabot Highlands').club, 'cabot_highlands');
  assert.equal(bookingConfig('dornoch').club, 'royal_dornoch');
  assert.equal(bookingConfig(null).club, 'royal_dornoch');
});

test('a confirmation code cannot be misheard', () => {
  const code = confirmationCode('RD', () => 0.999999);
  assert.match(code, /^RD-[A-HJ-NP-Z2-9]{6}$/);
  assert.ok(!code.includes('0') && !code.includes('O') && !code.includes('1'));
});
