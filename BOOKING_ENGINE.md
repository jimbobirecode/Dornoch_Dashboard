# Booking engine

A visitor-facing tee-time booking system, modelled on the Agilysys Web Booking
Engine that Cabot Highlands books through, and proved out against Royal
Dornoch's own tee sheet.

The point of the exercise is that both clubs run the **same** flow, the same
pages and the same rules, over different inventory: Dornoch's tee sheet lives in
this database, Cabot's lives in Agilysys. Everything above the provider line is
shared.

```
  browser  →  /api/book/*  →  engine.js  →  ┬─ providers/postgres.js  (Dornoch)
                                 │          └─ providers/agilysys.js  (Cabot)
                                 │
                          property-config.js   — the club's rules
                          engine-domain.js     — pricing, policy, validation
```

## Where the design came from

The Agilysys behaviour was taken from a capture of Cabot Highlands' live booking
engine (`book.onagilysys.eu`, tenant 10282, property `CabotHighlands`). The
payloads in `server/test/fixtures/agilysys-cabot.json` are that capture, trimmed
to a few slots per course and with the payment tokens scrubbed, and the
translation is tested against them.

### Endpoint mapping

| Agilysys (Cabot) | Ours | Notes |
| --- | --- | --- |
| `GET /wbe-golf-service/golf/{scope}/propertyInfo` | `GET /api/book/config` | `rBookConfig` becomes the club profile: required fields, booking window, policies |
| `GET /wbe-property-service/golftimeinterval/{tenant}` | (folded into `/config`) | `timeRanges`, `intervalTime` |
| `POST /wbe-golf-service/golf/{scope}/multiCourse` | `GET /api/book/availability` | One call answers every course for the date |
| `PUT /wbe-golf-service/golf/{scope}/getPrice` | `POST /api/book/price` | Re-quote; also the availability re-check |
| `GET /wbe-cart-service/V2/{scope}/getCartItems` | `GET /api/book/cart` | |
| `PUT /wbe-cart-service/V2/{scope}/updateCartItems` | `POST/PATCH/DELETE /api/book/cart/items` | Split into real verbs |
| `POST /wbe-cart-service/V2/{scope}/cartSummary` | (the response of any cart call) | Every cart response already carries the totals |
| `GET /wbe-golf-service/caddyTypeConfig/{scope}/caddyTypeByLocale` | (folded into `/config`) | Only `isActive && isEnabled` types are offered |
| `GET /wbe-reservation-service/reservation/{tenant}/payToken` | `GET /api/book/payment-session` | Hosted iframe; no card detail reaches us |
| `GET /wbe-golf-service/golf/{scope}/getCancellationPolicy` | `GET /api/book/reservations/:code/refund-quote` | Ours answers with money, not prose |

Four endpoints in the capture are deliberately not replicated: the Azure blob
SAS and the blob-hosted country list (asset plumbing), `crossProductLinkage`
(returned "Linkage not found" — Cabot has no cross-sell configured), and
`customFields` (empty).

### Quirks the translation absorbs

These are the things that would bite anyone integrating against the WBE, and
they are the reason `providers/agilysys.js` exists as a layer rather than the
routes calling the service directly.

- **A rate is two ids.** `rateTypeId` is the tariff (457 visitor, 490
  member/resident) and `id` is that tariff priced for one course. The same
  tariff is `194038` on Castle Stuart and `194223` on Old Petty. Booking one
  course with the other's id is rejected. We carry both as `rateRef` and
  `tariffRef`.
- **`teeTimeId` is `0` for a slot nobody has booked yet.** It is not a key, and
  is mapped to `null` so nothing tries to look a slot up by it.
- **Failures arrive as HTTP 200** with `success: false`. The status code alone
  cannot be trusted. Worse, the services disagree about the spelling —
  golf-service sends `success`, property-service sends `Success`.
- **Prices are per player.** A four-ball at £385 is £1,540.
- **Cabot prices VAT-inclusive** and takes the full amount as deposit, so every
  tax field is `0.0` and `depositAmount == totalPrice`. The arithmetic still
  runs for a club that adds tax on top; `tax_percent` and `deposit_percent` are
  per rate.
- **Caddie fees are excluded from the deposit**, which Cabot's own deposit
  policy says in as many words. `quoteLine` keeps them out of `depositAmount`
  and puts them in `balanceDue`.

## The flow

    config → availability → price → add to cart → summary → checkout

Every step re-checks the one before it. Availability is stale the moment it is
rendered, so adding to the basket re-prices server-side, and checking out
re-prices again before taking money. A basket line whose slot has gone, or whose
price has moved, is **flagged rather than silently corrected** — the guest
agreed to a number and has to see the new one.

### Holding a slot

For a Postgres club, `reserve` decrements `available_count` under
`SELECT ... FOR UPDATE` with an `available_count >= players` guard, all lines in
one transaction. Without the guard the decrement would go negative and two
guests racing for the last places in a four-ball would both be told they had it.

Verified by racing six concurrent four-ball checkouts at a single four-place
slot: one `201`, five `409`, final count `0`, one reservation written.

If writing the reservation fails after the places are taken, they are given back
— a crash between the two cannot leave a slot held by nobody.

## Configuration

`server/src/lib/booking/property-config.js` holds one profile per club. The
Cabot profile carries the values its live engine actually returns (591 days out,
postcode required, country not, no online cancellation), so it is a target to
build against rather than a guess.

Which club a request is for comes from `?club=`, falling back to
`BOOKING_CLUB` (default `royal_dornoch`). One deployment can serve both.

Provider credentials never reach the browser: `publicConfig()` strips the
`agilysys` block.

## Cancellation

The published prose is what the guest reads; `cancellationTiers` is what the
money follows. Cabot's terms as tiers:

| Cancelled | Refund |
| --- | --- |
| more than 8 weeks before (≥ 56 days) | 100% |
| 4–8 weeks before (28–55 days) | 50% |
| less than 4 weeks before | 0% |

`GET /api/book/reservations/:code/refund-quote` answers what cancelling today
would return, without cancelling. It shares its implementation with the cancel
path, so the figure quoted is produced by the code that later pays it out.

## Setting it up

```bash
psql "$DATABASE_URL" -f migration_add_booking_engine.sql
psql "$DATABASE_URL" -f seed_booking_engine.sql     # Royal Dornoch only
npm run build && npm start
# visitor booking page:
open http://localhost:3001/book
```

`seed_booking_engine.sql` seeds **Dornoch only**, on purpose. Cabot books
through Agilysys, so its tee sheet, rates and caddie types come from the live
engine; seeded rows would be dead data that could make a broken connection look
healthy.

The page is public — it sits outside the dashboard's login, because a visitor
books before the club knows who they are.

## What is not built

- **No real payment capture.** `/api/book/payment-session` returns Agilysys's
  hosted iframe details for a Cabot-style club, and a `simulated: true` stand-in
  for a Postgres one. Wiring a gateway for Dornoch is the next step; the
  checkout already refuses to confirm without a payment reference when
  `creditCardRequired` is set.
- **No write-back to Agilysys.** The adapter reads availability, prices and the
  payment token. Placing the booking into Agilysys itself needs its reservation
  endpoint, which the capture does not cover — the session ended at the payment
  iframe.
- **Bookings are not yet joined to the `bookings` table** the dashboard reads,
  so a booking taken here does not appear on the Bookings page. The
  `booking_reservations` row holds everything needed to do it.

## Tests

```bash
npm test                     # the whole server suite
node --test server/test/booking-engine-domain.test.js
node --test server/test/booking-agilysys.test.js
```

47 tests cover the pricing arithmetic, the cancellation tiers and their
boundaries, config-driven validation, the slot filters, and the Agilysys
translation against the captured payloads.
