-- Guests amending or cancelling their own booking.
--
-- A guest follows a link in their confirmation email, sees their booking, and
-- asks for a change. What happens next is the club's policy, not the software's:
-- by default nothing moves until somebody at the club approves it, because a
-- tee time is scarce and usually inside a charging window.
--
-- The link itself is stateless — an HMAC of the booking reference — so there is
-- no token table here and a link cannot be leaked from the database. Only the
-- requests are stored.
--
-- Safe to run more than once; additive throughout.

CREATE TABLE IF NOT EXISTS public.booking_change_requests (
  id              SERIAL PRIMARY KEY,
  booking_id      TEXT NOT NULL,
  club            TEXT NOT NULL,

  -- 'cancel' or 'amend'. An amend carries what they want in `message`; the
  -- club decides what to do with it, because a tee sheet is not a form.
  kind            TEXT NOT NULL,
  message         TEXT,

  -- What they asked to move to, where they said. All optional: a guest who
  -- writes "any time on the Sunday" has told the club something useful that
  -- does not fit in a date column.
  requested_date  DATE,
  requested_time  TEXT,
  requested_players INTEGER,

  status          TEXT NOT NULL DEFAULT 'Pending',
  -- Recorded at the moment of the request, so a later policy change cannot
  -- rewrite what the guest was told at the time.
  auto_applied    BOOLEAN NOT NULL DEFAULT FALSE,
  days_before_play INTEGER,

  resolved_at     TIMESTAMPTZ,
  resolved_by     TEXT,
  resolution_note TEXT,

  guest_email     TEXT,
  requested_ip    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  ALTER TABLE public.booking_change_requests
    ADD CONSTRAINT booking_change_requests_kind_check CHECK (kind IN ('cancel', 'amend'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.booking_change_requests
    ADD CONSTRAINT booking_change_requests_status_check
    CHECK (status IN ('Pending', 'Approved', 'Declined', 'Applied'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_change_requests_booking ON public.booking_change_requests (booking_id);
CREATE INDEX IF NOT EXISTS idx_change_requests_open ON public.booking_change_requests (club, status)
  WHERE status = 'Pending';

COMMENT ON TABLE public.booking_change_requests IS
  'Amendments and cancellations asked for by the guest; the club approves unless policy auto-applies';
COMMENT ON COLUMN public.booking_change_requests.auto_applied IS
  'True where club policy let the change take effect without staff approval';

SELECT 'Change request migration complete' AS status,
       COUNT(*)                             AS requests,
       COUNT(*) FILTER (WHERE status = 'Pending') AS pending
  FROM public.booking_change_requests;
