# Royal Dornoch Golf Club - Demo Setup (Dashboard)

This branch makes the dashboard **club-profile driven** and adds a
**Royal Dornoch Golf Club** profile for the customer demo. Set
`CLUB_PROFILE=streamsong` to get the original Streamsong dashboard back.

## What changes for Royal Dornoch

| Area | Streamsong | Royal Dornoch demo |
|---|---|---|
| Branding | Slate blue / copper / olive, Streamsong logo | **Dornoch green / gorse gold / North Sea blue**, Royal Dornoch wordmark |
| Title | Streamsong Dashboard | **Royal Dornoch Visitor Bookings** |
| Currency | `$` | **`£`** on every card, report, metric and export |
| Dates | `Mar 18, 2026`, `12:20 PM` | **`18 Mar 2026`, `12:20`** (UK) |
| Courses | free text | **Championship Course / Struie Course** picker on the waitlist form |
| Club filter | `customer_id` of the login | login must have `customer_id = 'royal_dornoch'` |
| Journey emails | hard-coded `club = 'streamsong'` | filtered by the active profile's club id |
| Pro-shop items | Streamsong cap / balls / polo | Royal Dornoch crested cap, logo balls, merino sweater |

Everything above lives in **`club_config.py`** (colours, formats, courses,
pro-shop items). The core API has a matching `club_config.py` - keep the two
`club_id` values identical (`royal_dornoch`).

## Files added / changed

- `club_config.py` - club profiles, `apply_brand_colors()`, `money()`, date formats
- `assets/royal-dornoch-logo.png` (dark backgrounds) and
  `assets/royal-dornoch-logo-dark.png` (light backgrounds)
- `seed_royal_dornoch_demo.sql` - tables (if missing), demo login, 12 bookings
  across every status, waitlist entries
- `dashboard.py` - profile-driven title/logo/currency/dates; every `st.markdown`
  call is passed through `apply_brand_colors()` so the Streamsong-era inline
  colours are re-skinned without touching each one
- `modules/ui/styles.py` - palette comes from the profile
- `modules/customer_journey/emails.py` - club filter, `£`, UK dates, profile
  pro-shop items; the `🔍 DEBUG` banners that printed raw booking data into
  the UI are removed
- `modules/utils/helpers.py` - tee-time extraction also accepts 24-hour times

## Deploy on Render (new service for the demo)

1. **New Web Service** from this repo, branch `claude/royal-dornoch-demo-1qwj27`.
2. Build: `pip install -r requirements.txt`
   Start: `streamlit run dashboard.py --server.port $PORT --server.address 0.0.0.0`
3. Environment variables:

   | Variable | Value |
   |---|---|
   | `CLUB_PROFILE` | `royal_dornoch` (already the default on this branch) |
   | `DATABASE_URL` | same Postgres as the core API |
   | `SENDGRID_API_KEY` | for the Customer Journey Emails page |
   | `FROM_EMAIL` / `FROM_NAME` | `royaldornoch@bookings.teemail.io` / `Royal Dornoch Golf Club` |
   | `SENDGRID_TEMPLATE_PRE_ARRIVAL` / `SENDGRID_TEMPLATE_POST_PLAY` | SendGrid dynamic template ids (optional) |

## Seed the demo database

```bash
psql $DATABASE_URL -f seed_royal_dornoch_demo.sql
```

This is safe on an existing database (it only adds missing tables/columns and
replaces rows whose id starts with `RDG-DEMO-`). It creates:

- login **`dornoch_demo`** / temporary password **`Dornoch2026!`** (you are asked
  to set a permanent password on first login)
- 12 bookings for `club = 'royal_dornoch'`: 2 Inquiry, 2 Requested (one a
  12-player corporate day), 3 Confirmed (one playing in 3 days - shows up on the
  Welcome-email tab), 4 Booked (past and future, with partner-hotel stays),
  1 Rejected
- 3 waitlist entries

Bookings created live by the email bot appear alongside these automatically.

## Demo walk-through

1. Log in as `dornoch_demo`, set a password.
2. **Bookings** - click the *Requested* card: Sarah McLeod's two-round trip with
   a partner-hotel stay and Northern Capital's 12-player day are waiting. Use
   the *→ Confirmed* button.
3. **Reports & Analytics** - revenue in £, course popularity (Championship vs
   Struie), lodging mix.
4. **Waitlist** - Alan Reid's 8-ball waiting for a Saturday slot.
5. **Customer Journey Emails** - Mike O'Brien plays in 3 days (welcome email),
   David Brown played 2 days ago (thank-you email).
6. Send one of the sample emails from the core API repo
   (`test_emails_royal_dornoch.txt`) and watch the new Inquiry appear.
