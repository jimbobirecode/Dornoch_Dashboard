-- Retire the 'Confirmed' booking status.
--
-- The pipeline is now Inquiry -> Requested -> Booked. Rows still carrying
-- 'Confirmed' already display and count as Booked (the dashboard reads the
-- old spelling as its replacement), so this only tidies the stored value.
-- Safe to run more than once.

BEGIN;

UPDATE public.bookings
   SET status = 'Booked'
 WHERE status = 'Confirmed';

COMMIT;
