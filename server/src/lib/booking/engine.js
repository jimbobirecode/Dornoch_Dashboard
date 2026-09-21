/**
 * The booking flow, one club at a time.
 *
 * This is where the pieces meet: the club's configuration decides the rules,
 * a provider supplies the tee sheet, and the cart tables hold what the guest
 * has chosen so far. The route layer does nothing but translate HTTP.
 *
 * The flow mirrors the one Cabot's engine runs, because that is the flow the
 * guest already recognises:
 *
 *     config → availability → price → add to cart → summary → checkout
 *
 * Every step re-checks the one before it. Availability is stale the moment it
 * is rendered, so adding to the cart re-prices, and checking out re-prices
 * again before taking a penny.
 */
import {
  bookableSlots,
  basePrice,
  bookingWindow,
  cartTotals,
  confirmationCode,
  filterSlotsByRange,
  isWithinBookingWindow,
  quoteLine,
  refundFor,
  validateGuest,
} from './engine-domain.js';
import { bookingConfig, publicConfig } from './property-config.js';
import { client as agilysysClient } from './providers/agilysys.js';
import { provider as postgresProvider, carts, reservations } from './providers/postgres.js';

/** Raised for anything the guest can fix; the route turns it into a 4xx. */
export class BookingError extends Error {
  constructor(message, { status = 400, code = null, details = null } = {}) {
    super(message);
    this.name = 'BookingError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * The provider a club books through. Agilysys clubs read their tee sheet from
 * the WBE; everyone else reads it from this database. Carts and reservations
 * are ours either way, so a club can move between providers without losing
 * what guests have in progress.
 */
function providerFor(config) {
  if (config.provider === 'agilysys') {
    if (!config.agilysys?.baseUrl) {
      throw new BookingError('This club is configured for Agilysys but has no endpoint set.', {
        status: 503,
        code: 'PROVIDER_UNCONFIGURED',
      });
    }
    return agilysysClient(config.agilysys);
  }
  return postgresProvider(config.club);
}

/** The club's own today, which need not be the server's. */
export function clubToday(config, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timeZone ?? 'Europe/London',
  }).format(now);
}

export function engine(club, { now = () => new Date() } = {}) {
  const config = bookingConfig(club);
  const source = providerFor(config);

  /** Courses and caddies alongside the config the booking page is driven by. */
  async function loadConfig() {
    const today = clubToday(config, now());
    const caddieTypes = await source.caddieTypes(config.locale).catch(() => []);

    return {
      config: publicConfig(config),
      today,
      window: bookingWindow(config, today),
      caddieTypes,
    };
  }

  /**
   * The tee sheet for a date, filtered to what this party can actually book.
   *
   * A date outside the club's window is refused rather than answered empty:
   * "we don't sell that far ahead" and "that day is full" are different
   * answers and the page says so differently.
   */
  async function availability({ date, toDate, players = 1, timeRange = null }) {
    const today = clubToday(config, now());

    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date ?? ''))) {
      throw new BookingError('Give a date as YYYY-MM-DD.', { code: 'BAD_DATE' });
    }
    if (date < today) {
      throw new BookingError('That date has passed.', { code: 'DATE_IN_PAST' });
    }
    if (!isWithinBookingWindow(date, config, today)) {
      const { to } = bookingWindow(config, today);
      throw new BookingError(`${config.propertyName} is taking bookings up to ${to}.`, {
        code: 'OUTSIDE_WINDOW',
        details: { bookingDaysOut: config.bookingDaysOut, latestDate: to },
      });
    }

    const courses = await source.availability({ fromDate: date, toDate: toDate ?? date });

    return {
      date,
      players: Math.max(1, Number(players) || 1),
      timeRanges: config.timeRanges,
      courses: courses
        .map((course) => {
          const ranged = timeRange
            ? filterSlotsByRange(course.slots, timeRange, config.timeRanges)
            : course.slots;
          const slots = bookableSlots(ranged, players).map((slot) => ({
            ...slot,
            basePrice: basePrice(slot),
          }));
          return { ...course, slots };
        })
        // A course with nothing left for this party is still worth showing as
        // a course — the page greys it out rather than pretending it is gone.
        .map((course) => ({ ...course, soldOut: course.slots.length === 0 })),
    };
  }

  /** Re-quote lines against the live sheet; the price check and the hold check. */
  function price(lines) {
    if (!Array.isArray(lines) || lines.length === 0) {
      throw new BookingError('Nothing to price.', { code: 'NO_LINES' });
    }
    if (lines.length > 20) {
      throw new BookingError('Too many tee times in one request.', { code: 'TOO_MANY_LINES' });
    }
    return source.price(lines);
  }

  async function getOrCreateCart(cartId) {
    if (cartId) {
      const existing = await carts.get(config.club, cartId);
      if (existing) return existing.id;
    }
    return carts.create(config.club, config.locale);
  }

  /**
   * Add a tee time, at the price the sheet quotes now.
   *
   * The price the browser was showing is never trusted — it is re-quoted here
   * and the fresh number is what goes in the cart, so a stale page cannot book
   * yesterday's rate.
   */
  async function addToCart(cartId, line) {
    const players = Math.max(1, Math.trunc(Number(line.players) || 1));
    if (players > config.maxPlayersPerBooking) {
      throw new BookingError(
        `A booking can hold up to ${config.maxPlayersPerBooking} players.`,
        { code: 'TOO_MANY_PLAYERS' },
      );
    }

    const [quote] = await source.price([{ ...line, players }]);
    if (!quote || !quote.available) {
      throw new BookingError('That tee time has just gone.', {
        status: 409,
        code: 'SLOT_UNAVAILABLE',
        details: { remaining: quote?.availableSlots ?? 0 },
      });
    }

    const id = await getOrCreateCart(cartId);
    const itemId = await carts.addItem(config.club, id, {
      courseRef: line.courseRef,
      rateRef: quote.rateRef,
      scheduledDateTime: quote.scheduledDateTime,
      players,
      holes: line.holes ?? 18,
      caddieTypeRef: line.caddieTypeRef ?? null,
      caddies: line.caddies ?? 0,
      quote: quote.quote,
      // Labels only. The provider supplies them where it can; Agilysys does not
      // return names on a re-quote, so the page's own labels stand in. Nothing
      // is priced or booked from these — the refs above carry all of that.
      courseName: quote.courseName ?? line.courseName ?? null,
      rateName: quote.rateName ?? line.rateName ?? null,
      imageUrl: quote.imageUrl ?? line.imageUrl ?? null,
    });

    return { cartId: id, itemId };
  }

  async function updateCartItem(cartId, itemId, patch) {
    const items = await carts.items(config.club, cartId);
    const item = items.find((candidate) => candidate.id === itemId);
    if (!item) throw new BookingError('That tee time is not in your basket.', { status: 404 });

    const players = patch.players === undefined
      ? item.players
      : Math.max(1, Math.trunc(Number(patch.players) || 1));
    if (players > config.maxPlayersPerBooking) {
      throw new BookingError(
        `A booking can hold up to ${config.maxPlayersPerBooking} players.`,
        { code: 'TOO_MANY_PLAYERS' },
      );
    }

    const caddies = patch.caddies === undefined ? item.caddies : Number(patch.caddies) || 0;
    const [quote] = await source.price([{
      itemId,
      courseRef: item.courseRef,
      rateRef: item.rateRef,
      scheduledDateTime: item.scheduledDateTime,
      players,
      caddies,
      caddieFee: patch.caddieFee ?? 0,
    }]);

    if (!quote?.available) {
      throw new BookingError('There are not enough places left at that time.', {
        status: 409,
        code: 'SLOT_UNAVAILABLE',
        details: { remaining: quote?.availableSlots ?? 0 },
      });
    }

    await carts.updateItem(config.club, cartId, itemId, {
      players,
      caddies,
      caddieTypeRef: patch.caddieTypeRef,
      quote: quote.quote,
    });
    return summary(cartId);
  }

  function removeFromCart(cartId, itemId) {
    return carts.removeItem(config.club, cartId, itemId).then(() => summary(cartId));
  }

  /**
   * The basket, re-checked against the live sheet.
   *
   * Every line is re-priced so the summary can say which have sold out and
   * which have moved in price since they were added. Nothing is silently
   * corrected — the totals still reflect what the guest agreed to, and the page
   * asks before adopting a new number.
   */
  async function summary(cartId) {
    const cart = await carts.get(config.club, cartId);
    if (!cart) throw new BookingError('That basket has expired.', { status: 404, code: 'NO_CART' });

    const items = await carts.items(config.club, cartId);
    if (!items.length) {
      return { cartId, items: [], totals: cartTotals([]), guest: cart.guest ?? null, config: publicConfig(config) };
    }

    const quotes = await source.price(items.map((item) => ({
      itemId: item.id,
      courseRef: item.courseRef,
      rateRef: item.rateRef,
      scheduledDateTime: item.scheduledDateTime,
      players: item.players,
      caddies: item.caddies,
    })));

    const byId = new Map(quotes.map((quote) => [quote.itemId, quote]));
    const checked = items.map((item) => {
      const fresh = byId.get(item.id);
      const changed = fresh?.quote
        && Number(fresh.quote.grandTotal) !== Number(item.quote?.grandTotal);

      return {
        ...item,
        soldOut: !fresh?.available,
        remaining: fresh?.availableSlots ?? 0,
        priceChanged: Boolean(changed),
        currentQuote: changed ? fresh.quote : null,
      };
    });

    return {
      cartId,
      items: checked,
      totals: cartTotals(checked),
      guest: cart.guest ?? null,
      config: publicConfig(config),
      hasProblems: checked.some((item) => item.soldOut || item.priceChanged),
    };
  }

  /**
   * Turn a basket into a booking.
   *
   * The order matters. Details are validated, the basket is re-checked, the
   * places are taken, and only then is the booking written. If taking the
   * places fails there is nothing to unwind; if writing the booking fails the
   * places go back, so a crash here cannot leave a slot held by nobody.
   */
  async function checkout(cartId, { guest, paymentReference = null, agreedToPolicy = false }) {
    const errors = validateGuest(guest, config);
    if (Object.keys(errors).length) {
      throw new BookingError('Some details are missing.', {
        code: 'GUEST_INVALID',
        details: errors,
      });
    }
    if (!agreedToPolicy) {
      throw new BookingError('The cancellation policy has to be accepted.', {
        code: 'POLICY_NOT_ACCEPTED',
      });
    }

    const basket = await summary(cartId);
    if (!basket.items.length) {
      throw new BookingError('Your basket is empty.', { code: 'EMPTY_CART' });
    }
    if (basket.hasProblems) {
      throw new BookingError('Some tee times have changed. Review your basket.', {
        status: 409,
        code: 'CART_STALE',
        details: basket.items.filter((item) => item.soldOut || item.priceChanged),
      });
    }
    if (config.creditCardRequired && !paymentReference) {
      throw new BookingError('Payment is required to confirm this booking.', {
        code: 'PAYMENT_REQUIRED',
      });
    }

    const lines = basket.items.map((item) => ({
      courseRef: item.courseRef,
      scheduledDateTime: item.scheduledDateTime,
      players: item.players,
    }));

    // Agilysys holds the slot itself when the booking is placed; a Postgres
    // club has to take it here.
    const held = source.reserve ? await source.reserve(lines) : { ok: true };
    if (!held.ok) {
      throw new BookingError('That tee time has just gone.', {
        status: 409,
        code: 'SLOT_UNAVAILABLE',
        details: held.soldOut,
      });
    }

    try {
      const record = await reservations.create(config.club, {
        confirmationCode: confirmationCode(config.confirmationPrefix),
        cartId,
        guest,
        items: basket.items.map(({ currentQuote, soldOut, priceChanged, remaining, ...keep }) => keep),
        grandTotal: basket.totals.grandTotal,
        depositAmount: basket.totals.depositAmount,
        totalTax: basket.totals.totalTax,
        currency: config.currency,
        paymentReference,
        paymentStatus: paymentReference ? 'Deposit Paid' : 'Unpaid',
        cancellationPolicy: config.cancellationPolicy,
      });

      await carts.clear(config.club, cartId);

      return {
        confirmationCode: record.confirmation_code,
        bookedAt: record.created_at,
        totals: basket.totals,
        items: basket.items,
        guest,
        cancellationPolicy: config.cancellationPolicy,
        depositPolicy: config.depositPolicy,
      };
    } catch (err) {
      if (source.release) await source.release(lines).catch(() => {});
      throw err;
    }
  }

  /**
   * What cancelling a booking today would return, and the booking it applies to.
   *
   * The refund follows the tiers in the config rather than the prose, and is
   * worked out against the club's today — a guest in another time zone
   * cancelling "tonight" gets the club's calendar, not their own.
   *
   * This is the half `cancel` and the quote route share, so the figure the
   * guest is shown before confirming is produced by the same code that later
   * pays it out, rather than by a second implementation that could drift.
   */
  async function refundQuote(code) {
    if (!config.allowTeeTimesCancel) {
      throw new BookingError('Bookings cannot be cancelled online. Please call the club.', {
        code: 'CANCEL_NOT_ALLOWED',
      });
    }

    const booking = await reservations.byCode(config.club, code);
    if (!booking) throw new BookingError('No booking with that reference.', { status: 404 });
    if (booking.status === 'Cancelled') {
      throw new BookingError('That booking is already cancelled.', { code: 'ALREADY_CANCELLED' });
    }

    const items = booking.items ?? [];
    const today = clubToday(config, now());
    // A multi-day booking refunds on its earliest round, which is the first
    // date the club loses.
    const playDate = items.map((item) => item.date).sort()[0] ?? today;

    const refund = refundFor({
      playDate,
      cancelledOn: today,
      amount: Number(booking.deposit_amount) || 0,
      tiers: config.cancellationTiers,
    });

    return {
      booking,
      items,
      refund: {
        confirmationCode: booking.confirmation_code,
        depositPaid: Number(booking.deposit_amount) || 0,
        playDate,
        cancellationPolicy: config.cancellationPolicy,
        ...refund,
      },
    };
  }

  /** Cancel for real: give the places back and record what was refunded. */
  async function cancel(code) {
    const { items, refund } = await refundQuote(code);

    const cancelled = await reservations.cancel(config.club, code, refund.refundAmount);
    if (!cancelled) {
      // Somebody cancelled it between the quote and the write.
      throw new BookingError('That booking is already cancelled.', { code: 'ALREADY_CANCELLED' });
    }
    if (source.release) {
      await source.release(items.map((item) => ({
        courseRef: item.courseRef,
        scheduledDateTime: item.scheduledDateTime,
        players: item.players,
      }))).catch(() => {});
    }

    return { ...refund, confirmationCode: cancelled.confirmation_code, cancelled: true };
  }

  /**
   * What the payment iframe needs. Card details never touch this server: the
   * browser posts them to the gateway and hands back only a token.
   */
  async function paymentSession() {
    if (source.payToken) return source.payToken();

    // A Postgres club has no gateway wired up yet; the checkout page shows a
    // stand-in rather than a broken iframe.
    return {
      gatewayId: 'none',
      iframeUrl: null,
      simulated: true,
      note: 'No payment gateway is configured for this club.',
    };
  }

  return {
    config,
    loadConfig,
    availability,
    price,
    addToCart,
    updateCartItem,
    removeFromCart,
    summary,
    checkout,
    refundQuote,
    cancel,
    paymentSession,
    setGuest: (cartId, guest) => carts.setGuest(config.club, cartId, guest),
    quoteLine,
  };
}
