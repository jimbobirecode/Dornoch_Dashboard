-- Waitlist → booking conversion.
--
-- The waitlist could already be converted to a booking, but the only record of
-- which booking an entry became was a sentence in the booking's note:
-- "Converted from waitlist: WL-0001". That cannot be reported on without
-- parsing prose, and it says nothing about when the conversion happened.
--
-- This adds the link as data, and recovers the history already sitting in
-- those notes. Safe to run more than once, and additive throughout.

-- The table predates the current dashboard on some installs and is absent on
-- others, so create it if it is not there rather than failing.
CREATE TABLE IF NOT EXISTS public.waitlist (
    id                   SERIAL PRIMARY KEY,
    waitlist_id          VARCHAR(50) UNIQUE NOT NULL,
    guest_email          VARCHAR(255) NOT NULL,
    guest_name           VARCHAR(255),
    requested_date       DATE NOT NULL,
    preferred_time       VARCHAR(50),
    time_flexibility     VARCHAR(50),
    players              INTEGER DEFAULT 1,
    golf_course          VARCHAR(100),
    status               VARCHAR(50) DEFAULT 'Waiting',
    priority             INTEGER DEFAULT 5,
    notes                TEXT,
    notification_sent    BOOLEAN DEFAULT FALSE,
    notification_sent_at TIMESTAMP,
    created_at           TIMESTAMP DEFAULT NOW(),
    updated_at           TIMESTAMP DEFAULT NOW(),
    club                 VARCHAR(100)
);

-- Which booking this entry became, and when. Both NULL until it converts.
ALTER TABLE public.waitlist
  ADD COLUMN IF NOT EXISTS converted_booking_id TEXT;
ALTER TABLE public.waitlist
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.waitlist.converted_booking_id IS
  'bookings.booking_id this entry became; NULL until it converts';
COMMENT ON COLUMN public.waitlist.converted_at IS
  'When the conversion was recorded — the clock for time-to-convert';

CREATE INDEX IF NOT EXISTS idx_waitlist_club_date ON public.waitlist (club, requested_date);
CREATE INDEX IF NOT EXISTS idx_waitlist_status ON public.waitlist (club, status);
CREATE INDEX IF NOT EXISTS idx_waitlist_converted ON public.waitlist (converted_booking_id)
  WHERE converted_booking_id IS NOT NULL;

-- Recover the links the old conversion path left in prose. The Streamlit
-- dashboard wrote "Converted from waitlist: WL-0001." into the booking's note
-- and nothing else, so this is the only record those conversions have.
--
-- Matched on the booking rather than the waitlist row because the note is
-- where the id lives; only rows that are not already linked are touched, so
-- re-running cannot overwrite a link recorded properly since.
UPDATE public.waitlist w
   SET converted_booking_id = b.booking_id,
       -- The note carries no timestamp, so the booking's own is the closest
       -- honest answer. Time-to-convert for these rows is approximate.
       converted_at = COALESCE(w.converted_at, b.timestamp, NOW())
  FROM public.bookings b
 WHERE w.converted_booking_id IS NULL
   AND b.note ~ 'Converted from waitlist:'
   -- No '.' in the class: the note ends the sentence with one, and including
   -- it captured "WL-0003." — an id that matches nothing.
   AND w.waitlist_id = substring(b.note from 'Converted from waitlist:\s*([A-Za-z0-9_-]+)')
   AND (w.club IS NOT DISTINCT FROM b.club);

-- An entry that carries a booking is converted, whatever its status said.
UPDATE public.waitlist
   SET status = 'Converted'
 WHERE converted_booking_id IS NOT NULL AND status <> 'Converted';

SELECT 'Waitlist conversion migration complete'                    AS status,
       COUNT(*)                                                     AS entries,
       COUNT(*) FILTER (WHERE converted_booking_id IS NOT NULL)     AS linked_to_a_booking,
       COUNT(*) FILTER (WHERE status = 'Waiting')                   AS still_waiting
  FROM public.waitlist;
