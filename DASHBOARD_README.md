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

### Chart colours

Pipeline stages use a single-hue gorse gold ordinal ramp that brightens toward
completion, validated against the `#1D3B2A` chart surface (monotone lightness,
step gaps, light end 3.79:1). Its two dim steps are the club's own heather gold
and gorse gold.

The club's original status colours could not be carried over: they are
categorical (North Sea blue for Requested, two greens for Confirmed and
Booked), and on a dark green surface the two greens sit ΔE 8.8 apart — below
the 15 floor, so indistinguishable — while the blue reaches only 1.74:1
contrast. The terminal states are reserved status colours outside the brand
palette: `Rejected #DB4F7D` and `Cancelled #93A9B8`, checked against the ramp
at ΔE 16.6 normal / 9.7 colourblind, all above 3:1. Every status is written out
in text as well, so nothing depends on colour alone.

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
