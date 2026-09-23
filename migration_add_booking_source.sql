-- Where a booking came from.
--
-- Until now every row in `bookings` arrived the same way: a guest emailed, the
-- bot parsed it, and the booking moved down the pipeline. Uploading a club's
-- own tee sheet breaks that assumption — those bookings were made somewhere
-- else and were never a TeeMail enquiry.
--
-- Without a marker they would be counted as enquiries TeeMail converted, and
-- the conversion funnel, the request-utilisation grid and the response times
-- would all quietly overstate. This records the difference so the reports can
-- ask for one or the other.
--
-- Safe to run more than once; additive throughout.

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'teemail';

-- Which upload a row came in on, so an import can be reviewed or undone as a
-- batch rather than row by row.
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS import_batch TEXT;
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ;

COMMENT ON COLUMN public.bookings.source IS
  'teemail = came through the enquiry pipeline; imported = uploaded from the club''s own tee sheet';
COMMENT ON COLUMN public.bookings.import_batch IS
  'The upload this row arrived on; NULL for anything TeeMail took itself';

DO $$
BEGIN
  ALTER TABLE public.bookings
    ADD CONSTRAINT bookings_source_check CHECK (source IN ('teemail', 'imported'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_bookings_source ON public.bookings (club, source);
CREATE INDEX IF NOT EXISTS idx_bookings_import_batch ON public.bookings (import_batch)
  WHERE import_batch IS NOT NULL;

-- Every row that exists today came through the pipeline, which is what the
-- column already defaults to. Stated rather than assumed, because the default
-- only applies to rows written after the column existed.
UPDATE public.bookings SET source = 'teemail' WHERE source IS NULL;

SELECT 'Booking source migration complete'                  AS status,
       COUNT(*)                                              AS bookings,
       COUNT(*) FILTER (WHERE source = 'imported')           AS imported,
       COUNT(DISTINCT import_batch)                          AS import_batches
  FROM public.bookings;
