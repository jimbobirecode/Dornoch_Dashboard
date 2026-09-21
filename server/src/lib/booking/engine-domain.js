/**
 * The booking engine's vocabulary: how a tee time is priced, what a cart comes
 * to, which guest details a club insists on, and what a cancellation refunds.
 *
 * Everything here is pure. The provider modules fetch and persist; this decides.
 * The shapes are the ones the Agilysys Web Booking Engine uses for Cabot
 * Highlands, so the same domain serves an Agilysys club and a Postgres one.
 */

/** Fees always break down these three ways, as Agilysys `rates` does. */
export const FEE_KINDS = ['greenFee', 'cartFee', 'otherFee'];

const money = (value) => Math.round((Number(value) || 0) * 100) / 100;

/**
 * `rBookConfig` decides which guest fields are mandatory, one boolean per
 * field. Listing them here rather than in the form keeps the API and the UI
 * agreeing about what a club actually needs.
 */
const GUEST_FIELDS = [
  ['firstName', 'firstNameRequired', 'First name'],
  ['lastName', 'lastNameRequired', 'Last name'],
  ['email', 'emailRequired', 'Email'],
  ['phone', 'phoneRequired', 'Phone number'],
  ['title', 'titleRequired', 'Title'],
  ['gender', 'genderRequired', 'Gender'],
  ['birthday', 'birthdayRequired', 'Date of birth'],
  ['address', 'addressRequired', 'Address'],
  ['city', 'cityRequired', 'City'],
  ['state', 'stateRequired', 'County'],
  ['postcode', 'pincodeRequired', 'Postcode'],
  ['country', 'countryRequired', 'Country'],
];

/** The fields this club's config marks mandatory, in form order. */
export function requiredGuestFields(config) {
  return GUEST_FIELDS.filter(([, flag]) => config?.[flag] === true).map(([name, , label]) => ({
    name,
    label,
  }));
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Guest details checked against the club's config. Returns one message per
 * offending field, keyed by field, so the form can mark them all at once
 * rather than surfacing them one refused submit at a time.
 */
export function validateGuest(guest, config) {
  const errors = {};
  const value = (name) => String(guest?.[name] ?? '').trim();

  for (const { name, label } of requiredGuestFields(config)) {
    if (!value(name)) errors[name] = `${label} is required.`;
  }

  // A malformed address is worth catching even where the club does not demand
  // one, because the confirmation is the only copy of the booking the guest gets.
  const email = value('email');
  if (email && !EMAIL.test(email)) errors.email = 'Enter a valid email address.';

  const phone = value('phone');
  if (phone && phone.replace(/[^\d]/g, '').length < 7) {
    errors.phone = 'Enter a valid phone number.';
  }

  return errors;
}

/**
 * What one cart line costs.
 *
 * Agilysys quotes a per-player rate and multiplies by the party, which is why
 * the HAR's four-ball at £385 came back as £1,540. Tax is added on top of the
 * fees; at Cabot the fees are VAT-inclusive so `taxPercent` is 0 and the tax
 * lines are zero throughout — the arithmetic is the same either way.
 */
export function quoteLine({ rate, players = 1, caddies = 0, caddieFee = 0 }) {
  const party = Math.max(1, Math.trunc(Number(players) || 1));
  const taxPercent = Number(rate?.taxPercent) || 0;
  const depositPercent = rate?.depositPercent === undefined || rate?.depositPercent === null
    ? 100
    : Number(rate.depositPercent);

  const fees = {};
  const taxes = {};
  for (const kind of FEE_KINDS) {
    const perPlayer = money(rate?.rates?.[kind]);
    fees[kind] = money(perPlayer * party);
    taxes[`${kind}Tax`] = money(fees[kind] * (taxPercent / 100));
  }

  // Caddies are booked per bag, not per player, and are never part of the
  // deposit — the HAR's deposit policy says so in as many words.
  const caddieCount = Math.max(0, Math.trunc(Number(caddies) || 0));
  const caddieTotal = money(caddieCount * money(caddieFee));

  const totalPrice = money(FEE_KINDS.reduce((sum, kind) => sum + fees[kind], 0));
  const totalTax = money(FEE_KINDS.reduce((sum, kind) => sum + taxes[`${kind}Tax`], 0));
  const grandTotal = money(totalPrice + totalTax + caddieTotal);

  return {
    players: party,
    ...fees,
    ...taxes,
    caddies: caddieCount,
    caddieTotal,
    totalPrice,
    totalTax,
    /** Payable now to hold the tee time; caddie fees are settled at the club. */
    depositAmount: money((totalPrice + totalTax) * (depositPercent / 100)),
    grandTotal,
    /** Owed at the club on the day. */
    balanceDue: money(grandTotal - money((totalPrice + totalTax) * (depositPercent / 100))),
  };
}

/** A cart's lines added up, in the shape `cartSummary` returns. */
export function cartTotals(items) {
  const lines = Array.isArray(items) ? items : [];
  const sum = (pick) => money(lines.reduce((total, item) => total + (Number(pick(item)) || 0), 0));

  return {
    itemCount: lines.length,
    players: lines.reduce((total, item) => total + (Number(item?.quote?.players) || 0), 0),
    totalPrice: sum((item) => item?.quote?.totalPrice),
    totalTax: sum((item) => item?.quote?.totalTax),
    caddieTotal: sum((item) => item?.quote?.caddieTotal),
    depositAmount: sum((item) => item?.quote?.depositAmount),
    grandTotal: sum((item) => item?.quote?.grandTotal),
    balanceDue: sum((item) => item?.quote?.balanceDue),
  };
}

/**
 * Cabot's published cancellation terms, as tiers rather than prose: full refund
 * more than 8 weeks out, half between 4 and 8 weeks, nothing inside 4 weeks.
 *
 * A club with different terms supplies its own tiers; the prose in the config
 * is what the guest reads, and these are what the money follows.
 */
export const DEFAULT_CANCELLATION_TIERS = [
  { minDaysBefore: 56, refundPercent: 100 },
  { minDaysBefore: 28, refundPercent: 50 },
  { minDaysBefore: 0, refundPercent: 0 },
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days from `cancelledOn` to `playDate`, both as YYYY-MM-DD. */
export function daysBefore(playDate, cancelledOn) {
  const play = Date.parse(`${String(playDate).slice(0, 10)}T00:00:00Z`);
  const cancelled = Date.parse(`${String(cancelledOn).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(play) || Number.isNaN(cancelled)) return null;
  return Math.floor((play - cancelled) / DAY_MS);
}

/**
 * What cancelling on `cancelledOn` returns of `amount`.
 *
 * Cancelling after the date of play refunds nothing, which the tiers already
 * say — a negative `daysBefore` matches no tier's floor but the last one.
 */
export function refundFor({ playDate, cancelledOn, amount, tiers = DEFAULT_CANCELLATION_TIERS }) {
  const days = daysBefore(playDate, cancelledOn);
  const ordered = [...tiers].sort((a, b) => b.minDaysBefore - a.minDaysBefore);
  const tier = days === null
    ? null
    : ordered.find((candidate) => days >= candidate.minDaysBefore) ?? ordered[ordered.length - 1];

  const percent = tier ? Number(tier.refundPercent) || 0 : 0;
  return {
    daysBefore: days,
    refundPercent: percent,
    refundAmount: money((Number(amount) || 0) * (percent / 100)),
    forfeited: money((Number(amount) || 0) * (1 - percent / 100)),
  };
}

/**
 * The window a club sells: from its own today out to `bookingDaysOut` days.
 * Cabot's 591 is a little over 19 months, which is why its calendar opens on
 * dates most engines would refuse.
 */
export function bookingWindow(config, today) {
  const from = String(today).slice(0, 10);
  const days = Math.max(0, Number(config?.bookingDaysOut) || 0);
  const to = new Date(Date.parse(`${from}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
  return { from, to, days };
}

export function isWithinBookingWindow(date, config, today) {
  const { from, to } = bookingWindow(config, today);
  const day = String(date).slice(0, 10);
  return day >= from && day <= to;
}

/** "8:00 AM - 4:00 PM" as minutes from midnight, or null if unparseable. */
export function parseTimeRange(text) {
  const match = String(text ?? '').match(
    /(\d{1,2}):(\d{2})\s*([AP]M)?\s*-\s*(\d{1,2}):(\d{2})\s*([AP]M)?/i,
  );
  if (!match) return null;

  const toMinutes = (hour, minute, meridiem) => {
    let hours = Number(hour) % 12;
    if (!meridiem) hours = Number(hour) % 24;
    else if (meridiem.toUpperCase() === 'PM') hours += 12;
    return hours * 60 + Number(minute);
  };

  return {
    startMinutes: toMinutes(match[1], match[2], match[3]),
    endMinutes: toMinutes(match[4], match[5], match[6]),
  };
}

/** Minutes from midnight of a local `YYYY-MM-DDTHH:MM:SS`. */
export function minutesOfDay(scheduledDateTime) {
  const match = String(scheduledDateTime ?? '').match(/T(\d{2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/**
 * Slots inside a named time range, the filter behind the engine's morning /
 * afternoon chips. An unknown range name filters nothing out, so a misspelled
 * one shows the whole day rather than an empty sheet.
 */
export function filterSlotsByRange(slots, rangeName, timeRanges) {
  const range = parseTimeRange(timeRanges?.[rangeName]);
  if (!range) return slots;

  return slots.filter((slot) => {
    const minutes = minutesOfDay(slot.scheduledDateTime);
    return minutes !== null && minutes >= range.startMinutes && minutes <= range.endMinutes;
  });
}

/**
 * Slots a party of this size can actually take, which is not simply
 * `availableCount >= players`: a rate can set its own minimum, and Agilysys
 * reports a `minimumPlayers` of 0 meaning "no minimum" rather than "no players".
 */
export function bookableSlots(slots, players) {
  const party = Math.max(1, Math.trunc(Number(players) || 1));

  return slots
    .filter((slot) => Number(slot.availableCount) >= party)
    .map((slot) => ({
      ...slot,
      rateTypes: slot.rateTypes.filter((rate) => (Number(rate.minimumPlayers) || 0) <= party),
    }))
    .filter((slot) => slot.rateTypes.length > 0);
}

/**
 * The cheapest rate on a slot, which is what the tee sheet shows before the
 * guest says who they are — Agilysys's `withBasePrice`.
 */
export function basePrice(slot) {
  const totals = (slot?.rateTypes ?? [])
    .filter((rate) => !rate.isPrivate)
    .map((rate) => money(FEE_KINDS.reduce((sum, kind) => sum + money(rate?.rates?.[kind]), 0)));

  return totals.length ? Math.min(...totals) : null;
}

/**
 * Whether the cart still reflects what the tee sheet says, re-quoting every
 * line. A line whose slot has since sold out or changed price is flagged
 * rather than quietly adjusted, because the guest agreed to the old number.
 */
export function reconcileCart(items, quotes) {
  const byId = new Map(quotes.map((quote) => [quote.itemId, quote]));

  return items.map((item) => {
    const fresh = byId.get(item.id);
    if (!fresh) return { ...item, soldOut: true, priceChanged: false };

    const priceChanged = money(fresh.quote.grandTotal) !== money(item.quote?.grandTotal);
    return {
      ...item,
      soldOut: fresh.available === false,
      priceChanged,
      currentQuote: priceChanged ? fresh.quote : null,
    };
  });
}

/** A short, unambiguous confirmation code — no 0/O or 1/I to mishear. */
export function confirmationCode(prefix, random = Math.random) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let index = 0; index < 6; index += 1) {
    code += alphabet[Math.floor(random() * alphabet.length)];
  }
  return `${prefix}-${code}`;
}
