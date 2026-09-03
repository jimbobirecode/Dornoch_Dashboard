-- Diagnostic: Check tee_time data specifically for Royal Dornoch bookings
-- Run: psql $DATABASE_URL < diagnose_tee_times.sql

\echo '================================================'
\echo 'DIAGNOSTIC: TEE TIME DATA FOR ROYAL DORNOCH'
\echo '================================================'

\echo ''
\echo 'Step 1: Show tee_time values from recent bookings'
\echo '================================================'

SELECT
    booking_id,
    guest_email,
    date,
    tee_time,
    CASE
        WHEN tee_time IS NULL THEN '❌ NULL'
        WHEN tee_time = '' THEN '❌ EMPTY STRING'
        ELSE '✅ HAS VALUE: ' || tee_time
    END as tee_time_status,
    golf_courses,
    players,
    status,
    club
FROM bookings
WHERE club = 'dornoch'
AND status = 'Confirmed'
ORDER BY date DESC
LIMIT 10;

\echo ''
\echo 'Step 2: Count NULL vs populated tee_times'
\echo '================================================'

SELECT
    COUNT(*) as total_bookings,
    COUNT(tee_time) as tee_times_not_null,
    COUNT(*) FILTER (WHERE tee_time IS NULL) as tee_times_null,
    COUNT(*) FILTER (WHERE tee_time = '') as tee_times_empty_string,
    COUNT(*) FILTER (WHERE tee_time IS NOT NULL AND tee_time != '') as tee_times_with_value
FROM bookings
WHERE club = 'dornoch'
AND status = 'Confirmed';

\echo ''
\echo 'Step 3: Show data type of tee_time column'
\echo '================================================'

SELECT
    column_name,
    data_type,
    character_maximum_length,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'bookings'
AND column_name = 'tee_time';

\echo ''
\echo 'Step 4: Show EXACT data that would be sent to email'
\echo '================================================'

SELECT
    booking_id as "Booking ID",
    guest_email as "Guest Email",
    date as "Play Date",
    COALESCE(tee_time, 'TBD') as "Tee Time (what email gets)",
    tee_time as "Raw tee_time value",
    golf_courses as "Course",
    players as "Players"
FROM bookings
WHERE club = 'dornoch'
AND status = 'Confirmed'
AND date >= CURRENT_DATE
ORDER BY date
LIMIT 10;

\echo ''
\echo 'Step 5: Check if there are other tee time columns'
\echo '================================================'

SELECT column_name
FROM information_schema.columns
WHERE table_name = 'bookings'
AND column_name ILIKE '%tee%'
OR column_name ILIKE '%time%';

\echo ''
\echo '================================================'
\echo 'ANALYSIS COMPLETE'
\echo '================================================'
