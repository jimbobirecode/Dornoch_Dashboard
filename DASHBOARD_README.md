# Royal Dornoch Visitor Bookings — JavaScript dashboard

A React single-page app served by an Express API, reading the same
`public.bookings` and `public.dashboard_users` tables the Streamlit dashboard
uses. No schema change and no data migration — this is a front-end and API
replacement that can run alongside `dashboard.py` against the same database.

```
server/   Express API (auth, bookings, analytics, exports, guest emails,
          tour operators and operator reminders)
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
bodies, CSV and Excel export, Reports & Analytics, and the customer-journey
guest emails.

Beyond the Streamsong-era fields it also surfaces this install's later columns:
the hosted booking form's **guest details** (lead guest, phone, caddies,
special requests, submitted-at) and **accommodation** (nights, rooms, room
type, preferences, cost, resort fee). Columns are detected at runtime, so an
un-migrated database still loads — the same tolerance
`modules/database/bookings.py` has.

**Not ported:** the waitlist and pro-shop items. Those remain in the Streamlit
app.

Beyond the Streamlit dashboard it adds the trade side of the book — tour
operator accounts, their credit terms, where the money sits, and the two
reminder campaigns that chase it. See **Tour Operators** below.

## Guest Emails

The two customer-journey campaigns from `modules/customer_journey/emails.py`,
sent from the dashboard rather than a cron job:

| Campaign | When | Template |
|---|---|---|
| Pre-arrival welcome | `PRE_ARRIVAL_DAYS` (default 3) before the play date | `SENDGRID_TEMPLATE_PRE_ARRIVAL` |
| Post-play thank you | `POST_PLAY_DAYS` (default 2) after the play date | `SENDGRID_TEMPLATE_POST_PLAY` |

Only `Confirmed` and `Booked` bookings are ever listed. The page opens on the
guests due today and can widen to all upcoming play (welcomes) or the last 30
days (thank yous). Rows are ticked, previewed with a dry run that renders the
same template data without contacting SendGrid, then sent; a guest who has
already been written to stays listed with the timestamp, unticked, so a resend
has to be asked for.

Sending needs five environment variables — `SENDGRID_API_KEY`, `FROM_EMAIL`,
`FROM_NAME` and the two template IDs (see `.env.example`). Without them the
page still lists who is due and names what is missing, but cannot send.

De-duplication needs the tracking columns:

```bash
psql "$DATABASE_URL" -f migration_add_journey_emails.sql
```

Without them the emails still go out, and the page warns that a guest could be
written to twice.

The dynamic-template field names — `guest_name`, `booking_date`, `course_name`,
`tee_time`, `player_count`, `booking_reference` and the older `play_date` /
`booking_ref` spellings — match the Streamlit implementation exactly, so the
existing SendGrid templates work unchanged.


## Tour Operators

The trade half of the book: who books on behalf of guests, what credit they
trade on, what they owe, and what is chased when.

```bash
psql "$DATABASE_URL" -f migration_add_tour_operators.sql
```

Until that runs the two new pages say so and refuse politely; everything else —
bookings, analytics, guest emails — is unaffected. `npm run check` reports
whether an install has it.

### Identifying an operator

A booking is attached to an account on one of three kinds of evidence, and they
are deliberately not equal:

| Evidence | What it is | Acted on automatically |
|---|---|---|
| `assigned` | Somebody set `tour_operator_id` on the booking | Yes |
| `domain` | It arrived from a domain registered to the account | Yes |
| `name` | The account's name appears in the guest name or the enquiry text | **No** |

A name in prose is a suggestion, not an account. Those bookings stay with the
direct pile and are listed under **Unrecognised → Bookings that name an
operator** for somebody to confirm one at a time. Nothing is invoiced on the
strength of a phrase in an email body.

The same tab answers the harder question — *which operators do we trade with
that we have never set up?* — from the data rather than from memory. It groups
the unrecognised bookings by sending domain, drops the consumer mailboxes (a
family booking twice from Gmail is not a tour operator), and lists every
business domain seen more than once with its volume and value. "Open account"
carries the domain and a proposed name straight into the form.

### Credit terms

Each account carries five numbers, and the due date on every one of its
bookings is derived from them rather than stored:

| Term | Meaning |
|---|---|
| Payment terms (days) | Net days from the invoice date; 0 is payable on invoice |
| Deposit (%) | Share of the total due up front; 0 means no deposit |
| Deposit due (days before play) | Overrides the invoice terms for the deposit |
| Balance due (days before play) | Overrides the invoice terms for the balance |
| Credit limit | Most the account may owe at once; blank means none is enforced |

A "days before play" rule wins where it is set, because that is what a tour
operator contract actually says. With no such rule the invoice terms apply —
counted from the invoice date, or from the play date while nothing has been
invoiced, so a club that bills on departure still has a date to chase against.
A single booking can override either date, for the one that was agreed
differently.

Three consequences worth knowing:

- **The money decides the milestone, not the stored status.** A booking sits at
  its deposit until what has been paid covers the deposit, then at its balance.
  So a balance date inside the reminder window does not pull in a booking whose
  deposit is still outstanding — the deposit date does, and it is usually
  older.
- **Overdue is never stored.** It is derived from the due date against today on
  every read, because a stored "Overdue" is wrong the morning after it is
  written.
- **Exposure counts committed bookings only**, on the same rule the analytics
  page uses for revenue. An open enquiry is not money an operator owes, and
  counting it would put accounts over their credit limit on the strength of
  business the club has not agreed to.

The dashboard also reports when the recorded money and the typed payment status
disagree — a booking marked `Unpaid` that is fully paid up — as a hint beside
the figures. It never rewrites the status: the club's own record of what was
agreed is not the dashboard's to overwrite.

Deleting an account with bookings against it **retires** it instead. The
history and the debt stay where they are; only an account with nothing on it is
actually removed.

### Operator reminders

Two campaigns, one email per **account** rather than per booking — an operator
with eleven open bookings wants one message listing eleven lines, which is how
a trade partner reads their post.

| Campaign | Who is listed | Window |
|---|---|---|
| Booking status | Their bookings that have not reached `Booked` | `OPERATOR_STATUS_REMINDER_DAYS` (21) of play dates ahead |
| Payment due | Their committed bookings with money outstanding | `OPERATOR_PAYMENT_REMINDER_DAYS` (7) of due dates ahead, plus everything already late |

Sending is always explicit: accounts are ticked, previewed with a dry run that
renders exactly the data a real run would send, then sent. An account with
bookings but no contact email is still listed — marked unsendable, because that
is a gap somebody needs to fix rather than a silence.

Every booking that went into an email is stamped. The guard is per booking and
lasts seven days, which is the useful shape: an account chased last week about
four bookings is not chased again tomorrow, but a fifth booking that has just
fallen due pulls the account back into the list on its own. "Include recently
chased" widens the list and flags which lines have already been written about.

Sending needs `SENDGRID_API_KEY`, `FROM_EMAIL` and the two template IDs (see
`.env.example`). The sender credentials are shared with the guest campaigns on
purpose: a club that has configured SendGrid once should not have to do it
again to chase an invoice.

The template data carries the account (`operator_name`, `contact_name`,
`credit_terms`, `credit_limit`, `credit_headroom`), the totals
(`total_outstanding`, `total_overdue`, `days_overdue`, `earliest_due_date`) and
the line items twice — as `bookings`, the array a handlebars `{{#each}}` walks
to build a table, and as `booking_lines`, the same content preformatted for a
plain-text part.

### Payment on a booking

The booking drawer gains a **Trade account & payment** panel: which account the
booking sits on, what is owed and when, and fields for the payment status,
amount paid, invoice number and invoice date. Clearing an override date hands
that date back to the account's terms rather than leaving it blank.

The exports carry the same columns — operator, payment status, amount paid,
outstanding, due date, days overdue and invoice number — flattened onto the row,
because that spreadsheet is what goes to the bookkeeper.

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

The payment states are not a new ramp. They reuse the pipeline ramp for the one
thing it was validated for — progress toward a finished state — with muted ink
for nothing paid, the mid gold for a deposit and the light end for settled, plus
the reserved slate for refunded and written off. `Overdue` is not one of them:
it is derived, so it never appears alone, only beside the written day count
(`4d late`), which is what carries the meaning.

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

Set `DATABASE_URL` and a fresh `JWT_SECRET`, plus the SendGrid variables above
if the Guest Emails page should be able to send. `SEED_ON_START=true` seeds sample
data at boot for hosts without shell access; it skips when real bookings exist.
