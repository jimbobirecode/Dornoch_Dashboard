-- Fix tee_time field by copying from selected_tee_times if needed
-- Run: psql $DATABASE_URL < fix_tee_times.sql

\echo '================================================'
\echo 'CHECKING TEE TIME DATA'
\echo '================================================'

\echo ''
\echo 'Step 1: Show current state of tee_time vs selected_tee_times'
\echo '================================================'

SELECT
    booking_id,
    date,
    tee_time,
    selected_tee_times,
    CASE
        WHEN tee_time IS NULL AND selected_tee_times IS NOT NULL THEN '⚠️ CAN FIX'
        WHEN tee_time IS NOT NULL THEN '✅ HAS TEE_TIME'
        ELSE '❌ NO DATA'
    END as status
FROM bookings
WHERE club = 'dornoch'
AND status = 'Confirmed'
ORDER BY date DESC
LIMIT 20;

\echo ''
\echo 'Step 2: Count fixable records'
\echo '================================================'

SELECT
    COUNT(*) FILTER (WHERE tee_time IS NULL AND selected_tee_times IS NOT NULL) as can_fix,
    COUNT(*) FILTER (WHERE tee_time IS NOT NULL) as already_has_tee_time,
    COUNT(*) FILTER (WHERE tee_time IS NULL AND selected_tee_times IS NULL) as no_data_anywhere
FROM bookings
WHERE club = 'dornoch'
AND status = 'Confirmed';

\echo ''
\echo 'Step 3: Copy selected_tee_times to tee_time where needed'
\echo '================================================'

UPDATE bookings
SET tee_time = selected_tee_times
WHERE club = 'dornoch'
AND status = 'Confirmed'
AND tee_time IS NULL
AND selected_tee_times IS NOT NULL;

\echo ''
\echo '✅ Update complete! Showing updated records:'
\echo ''

SELECT
    booking_id,
    date,
    tee_time,
    golf_courses,
    players
FROM bookings
WHERE club = 'dornoch'
AND status = 'Confirmed'
AND tee_time IS NOT NULL
ORDER BY date DESC
LIMIT 10;
