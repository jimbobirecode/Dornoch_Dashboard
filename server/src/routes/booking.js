/**
 * The public booking API.
 *
 * These routes are deliberately unauthenticated: a visitor books a tee time
 * before the club knows who they are. The basket is the only identity, and it
 * is a server-issued UUID held in a cookie — guessing one gains nothing worth
 * having, and every route is scoped to a club so one club's basket can never
 * be read through another's.
 *
 * The endpoints line up with the Agilysys ones they replace, so the mapping in
 * BOOKING_ENGINE.md reads straight across.
 */
import { Router } from 'express';
import { BookingError, engine } from '../lib/booking/engine.js';
import { knownBookingClubs } from '../lib/booking/property-config.js';

const router = Router();

/** The club whose engine a request is for. */
const DEFAULT_CLUB = process.env.BOOKING_CLUB ?? 'royal_dornoch';
const CART_COOKIE = 'booking_cart';
const CART_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

function clubOf(req) {
  const asked = String(req.query.club ?? req.body?.club ?? '').trim().toLowerCase();
  // An unknown club falls back rather than 404s, but a *known* one asked for
  // explicitly is honoured — that is what makes one deployment serve both.
  return knownBookingClubs().includes(asked) ? asked : DEFAULT_CLUB;
}

function cartIdOf(req) {
  const fromBody = req.body?.cartId;
  const fromQuery = req.query.cartId;
  const fromCookie = req.cookies?.[CART_COOKIE];
  const id = fromBody || fromQuery || fromCookie || null;
  return isUuid(id) ? id : null;
}

function isUuid(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function rememberCart(res, cartId) {
  res.cookie(CART_COOKIE, cartId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: CART_MAX_AGE,
  });
}

/**
 * Every route's error handling in one place. A `BookingError` is something the
 * guest can act on and keeps its message; anything else is ours and is logged
 * rather than shown, because provider errors can carry internal detail.
 */
function handle(fn) {
  return async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof BookingError) {
        return res.status(err.status).json({
          error: err.message,
          code: err.code,
          details: err.details,
        });
      }
      if (err?.name === 'AgilysysError') {
        console.error('[booking] provider:', err.message, err.correlationId ?? '');
        return res.status(502).json({
          error: 'The booking system is temporarily unavailable. Please try again.',
          code: 'PROVIDER_ERROR',
        });
      }
      return next(err);
    }
  };
}

/** Config, the club's today, its booking window and its caddie options. */
router.get('/config', handle(async (req, res) => {
  const payload = await engine(clubOf(req)).loadConfig();
  res.json(payload);
}));

/**
 * The tee sheet. Mirrors `multiCourse`: one call answers every course for the
 * date, so the page can show them side by side without a request each.
 */
router.get('/availability', handle(async (req, res) => {
  const { date, toDate, players, timeRange } = req.query;
  const payload = await engine(clubOf(req)).availability({
    date,
    toDate,
    players: Number(players) || 1,
    timeRange: timeRange || null,
  });
  res.json(payload);
}));

/** A live re-quote for one or more slots, as `getPrice` is. */
router.post('/price', handle(async (req, res) => {
  const quotes = await engine(clubOf(req)).price(req.body?.lines);
  res.json({ quotes });
}));

router.get('/cart', handle(async (req, res) => {
  const cartId = cartIdOf(req);
  if (!cartId) return res.json({ cartId: null, items: [], totals: { itemCount: 0, grandTotal: 0 } });

  const booking = engine(clubOf(req));
  try {
    res.json(await booking.summary(cartId));
  } catch (err) {
    // An expired basket is not an error to the page; it just starts a new one.
    if (err instanceof BookingError && err.code === 'NO_CART') {
      res.clearCookie(CART_COOKIE);
      return res.json({ cartId: null, items: [], totals: { itemCount: 0, grandTotal: 0 } });
    }
    throw err;
  }
}));

router.post('/cart/items', handle(async (req, res) => {
  const booking = engine(clubOf(req));
  const {
    courseRef, rateRef, scheduledDateTime, players, holes, caddies, caddieTypeRef,
    courseName, rateName,
  } = req.body ?? {};

  if (!courseRef || !rateRef || !scheduledDateTime) {
    throw new BookingError('Pick a course, a time and a rate.', { code: 'INCOMPLETE_LINE' });
  }

  const { cartId } = await booking.addToCart(cartIdOf(req), {
    courseRef, rateRef, scheduledDateTime, players, holes, caddies, caddieTypeRef,
    // Display labels for providers that do not name a course on a re-quote.
    courseName, rateName,
  });
  rememberCart(res, cartId);
  res.status(201).json(await booking.summary(cartId));
}));

router.patch('/cart/items/:itemId', handle(async (req, res) => {
  const cartId = cartIdOf(req);
  if (!cartId) throw new BookingError('That basket has expired.', { status: 404, code: 'NO_CART' });

  res.json(await engine(clubOf(req)).updateCartItem(cartId, req.params.itemId, req.body ?? {}));
}));

router.delete('/cart/items/:itemId', handle(async (req, res) => {
  const cartId = cartIdOf(req);
  if (!cartId) throw new BookingError('That basket has expired.', { status: 404, code: 'NO_CART' });

  res.json(await engine(clubOf(req)).removeFromCart(cartId, req.params.itemId));
}));

/** Where the card form is hosted. No card detail passes through this server. */
router.get('/payment-session', handle(async (req, res) => {
  res.json(await engine(clubOf(req)).paymentSession());
}));

router.post('/checkout', handle(async (req, res) => {
  const cartId = cartIdOf(req);
  if (!cartId) throw new BookingError('Your basket is empty.', { status: 404, code: 'NO_CART' });

  const booking = engine(clubOf(req));
  const confirmation = await booking.checkout(cartId, {
    guest: req.body?.guest,
    paymentReference: req.body?.paymentReference ?? null,
    agreedToPolicy: req.body?.agreedToPolicy === true,
  });

  res.clearCookie(CART_COOKIE);
  res.status(201).json(confirmation);
}));

/** What cancelling today would refund, without cancelling anything. */
router.get('/reservations/:code/refund-quote', handle(async (req, res) => {
  const { refund } = await engine(clubOf(req)).refundQuote(req.params.code);
  res.json(refund);
}));

router.post('/reservations/:code/cancel', handle(async (req, res) => {
  res.json(await engine(clubOf(req)).cancel(req.params.code));
}));

export default router;
