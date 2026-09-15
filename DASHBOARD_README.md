# Royal Dornoch Visitor Bookings — JavaScript dashboard

A React single-page app served by an Express API, reading the same
`public.bookings` and `public.dashboard_users` tables the Streamlit dashboard
uses. No schema change and no data migration — this is a front-end and API
replacement that can run alongside `dashboard.py` against the same database.

```
server/   Express API (auth, bookings, analytics, exports)
web/      React + Vite SPA (bookings table, detail drawer, charts)
scripts/  seed + read-only compatibility check
```

## Running

```bash
npm install
cp .env.example .env         # DATABASE_URL + JWT_SECRET
npm run dev                  # API :3001, web :5173
npm run build && npm start   # production, single origin on :3001
```

| Script | Purpose |
|---|---|
| `npm run check` | Read-only preflight: can this database run the dashboard as-is? |
| `npm run seed` | Sample Royal Dornoch bookings (`--reset` to rebuild) |
| `npm test` | Unit tests for the booking and analytics arithmetic (no database needed) |

## What is ported from the Streamlit dashboard

Bookings list and filtering, the `Inquiry → Requested → Confirmed → Booked`
pipeline, status/note/tee-time edits, delete, tee-time extraction from email
bodies, CSV and Excel export, and Reports & Analytics.

Beyond the Streamsong-era fields it also surfaces this install's later columns:
the hosted booking form's **guest details** (lead guest, phone, caddies,
special requests, submitted-at) and **accommodation** (nights, rooms, room
type, preferences, cost, resort fee). Columns are detected at runtime, so an
un-migrated database still loads — the same tolerance
`modules/database/bookings.py` has.

**Not ported:** Customer Journey Emails, the waitlist, and pro-shop items.
Those remain in the Streamlit app.

## Branding

`web/src/lib/brand.js` plus the token block at the top of `web/src/theme.css`
carry everything club-specific — the equivalent of `club_config.py` for the
JavaScript app.

Surfaces are Dornoch green, accent gorse gold, text links sand, all taken from
the `royal_dornoch` profile in `club_config.py`.

### Reports & Analytics

The analytics endpoint aggregates in `server/src/lib/analytics-domain.js` — pure
functions over serialised bookings, so every number here is unit-tested without
a database (`npm test`).

| Section | Question it answers |
|---|---|
| KPI row | Bookings, committed revenue, average value, conversion and loss rate, each against the preceding period of equal length |
| Over time | Bookings, revenue or players by tee date, at daily / weekly / monthly granularity |
| Conversion funnel | How many reached each stage, and how many were lost *at* each stage |
| Lead time | How far ahead the sheet fills, bucketed, with the median |
| Party size | Where the volume and the money sit, by players per booking |
| Course mix | Championship vs Struie vs unrecorded |
| Accommodation | Attach rate, and basket size with a stay against golf-only |
| Tee sheet utilisation | Weekday against time-of-day band |

Two things the numbers deliberately do **not** do. Revenue counts only
`Confirmed` and `Booked`, so an open enquiry never inflates it. And course mix
counts a booking naming both courses toward each, so those rows do not sum to
the total — the card says so on its face.

The comparison window is the same length immediately before the selected range,
so "next 90 days" is judged against the 90 days before it. Where the previous
period was zero, the tile says "No activity in the previous period" rather than
showing an infinite percentage.

### Charts

The chart components in `web/src/components/charts/` are Tremor's
(<https://www.tremor.so/charts>) ported to plain JSX and re-themed onto the
club's palette, rather than the `@tremor/react` package — which has not been
published since January 2025 and pulls in four sizeable transitive
dependencies. They are Recharts underneath, which the dashboard already used.

Tremor needs Tailwind, so Tailwind is in the build with **`preflight`
disabled**: this app is styled by `theme.css`, and Tailwind's base reset would
flatten its buttons, inputs and tables. Utilities are emitted after that
stylesheet so a chart can still override locally. `web/tailwind.config.js`
reads its colours from `web/src/lib/palette.js`, so the theme and the validated
ramps cannot drift apart.

### Chart colours

`web/src/lib/palette.js` is the single source, and every ramp in it was checked
against this app's own chart surface (`#1D3B2A`) rather than a generic dark
grey. Re-run the validator before changing any value.

| Ramp | Job | Result on `#1D3B2A` |
|---|---|---|
| Pipeline `#B8862B → #F0E0A6` | ordinal (funnel, status) | monotone lightness, step gaps, light end 3.79:1 |
| Sequential `#4a4c28 → #dec163` | heatmap magnitude | one hue (21° spread), monotone |
| Categorical `#3987e5, #d95926, #199e70` | identity (courses) | all-pairs CVD ΔE 9.4, normal-vision ΔE 20.9 |
| Delta `#2FB24A` / `#E8636B` | period-over-period | both clear 3:1 |

Three consequences worth knowing before editing:

- **The categorical array is capped at three.** A fourth hue does not clear the
  all-pairs floors on this surface, so a fourth category folds into "Other" or
  the chart becomes a table.
- **Up-green and down-red are the same colour to a deuteranope** (ΔE 2.4). The
  delta cues therefore only ever appear in a stat tile beside an arrow glyph and
  the signed number, never as a mark inside a plot.
- **An empty heatmap cell is bare surface with a hairline**, not the ramp's
  darkest step, so "nobody booked this" and "almost nobody booked this" cannot
  look alike.

The club's own status colours still could not be carried over, for the reasons
below. Every status is written out in text as well, and every chart has a table
view behind "Show the numbers", so no reading depends on colour.

The original categorical status colours are unusable here: North Sea blue for
Requested reaches only 1.74:1 on this surface, and the two greens for Confirmed
and Booked sit ΔE 8.8 apart — below the 15 floor. The terminal states use
reserved colours outside the brand palette: `Rejected #DB4F7D` and
`Cancelled #93A9B8`.

### Logo

`assets/royal-dornoch-logo.png` and `assets/royal-dornoch-logo-dark.png` are
**byte-identical** — both are the dark-green artwork, so there is no
light-on-dark variant despite `club_config.py` treating them as two assets.
The mark is therefore shown on a links-sand plate. If a reversed logo is
supplied, replace `web/public/logo.png` and set `BRAND.logoOnDark = true`.

## Deploying

A separate Render service from the Streamlit one, against the same database:

| Setting | Value |
|---|---|
| Build Command | `npm install --include=dev && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |

`--include=dev` is required: Render sets `NODE_ENV=production`, which makes npm
skip devDependencies, and `vite` is one of them.

Set `DATABASE_URL` and a fresh `JWT_SECRET`. `SEED_ON_START=true` seeds sample
data at boot for hosts without shell access; it skips when real bookings exist.
