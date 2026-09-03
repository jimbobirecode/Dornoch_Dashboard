-- Diagnostic: Show exactly what data exists in bookings for email sending
-- Run: psql $DATABASE_URL < diagnose_email_data.sql

\echo '================================================'
\echo 'DIAGNOSTIC: Email Data for Royal Dornoch Bookings'
\echo '================================================'

\echo ''
\echo 'Step 1: Show ALL data from a sample booking'
\echo '================================================'

SELECT
    booking_id,
    guest_email,
    guest_name,
    date,
    tee_time,
    players,
    total,
    golf_courses,
    status,
    club,
    note,
    hotel_required,
    hotel_checkin,
    hotel_checkout,
    pre_arrival_email_sent_at,
    post_play_email_sent_at
FROM bookings
WHERE club = 'dornoch'
AND status = 'Confirmed'
ORDER BY date DESC
LIMIT 5;

\echo ''
\echo 'Step 2: Check for NULL/empty required fields'
\echo '================================================'

SELECT
    booking_id,
    CASE WHEN date IS NULL THEN '❌ NULL' ELSE '✅ ' || date::text END as date_check,
    CASE WHEN golf_courses IS NULL OR golf_courses = '' THEN '❌ EMPTY' ELSE '✅ ' || golf_courses END as course_check,
    CASE WHEN tee_time IS NULL OR tee_time = '' THEN '❌ EMPTY' ELSE '✅ ' || tee_time END as tee_time_check,
    CASE WHEN players IS NULL THEN '❌ NULL' ELSE '✅ ' || players::text END as players_check,
    CASE WHEN booking_id IS NULL OR booking_id = '' THEN '❌ EMPTY' ELSE '✅ ' || booking_id END as booking_ref_check
FROM bookings
WHERE club = 'dornoch'
AND status = 'Confirmed'
ORDER BY date DESC
LIMIT 10;

\echo ''
\echo 'Step 3: Show what would be sent to SendGrid'
\echo '================================================'

SELECT
    booking_id as "Booking Ref (booking_ref)",
    TO_CHAR(date, 'Day, Month DD, YYYY') as "Date (date)",
    COALESCE(golf_courses, 'Royal Dornoch Golf Club') as "Course (course)",
    COALESCE(tee_time, 'TBD') as "Tee Time (tee_time)",
    COALESCE(players::text, '0') as "Players (players)",
    guest_email as "Send To"
FROM bookings
WHERE club = 'dornoch'
AND status = 'Confirmed'
ORDER BY date DESC
LIMIT 5;

\echo ''
\echo 'Step 4: Count bookings with missing data'
\echo '================================================'

SELECT
    COUNT(*) FILTER (WHERE golf_courses IS NULL OR golf_courses = '') as missing_course,
    COUNT(*) FILTER (WHERE tee_time IS NULL OR tee_time = '') as missing_tee_time,
    COUNT(*) FILTER (WHERE players IS NULL) as missing_players,
    COUNT(*) FILTER (WHERE date IS NULL) as missing_date,
    COUNT(*) as total_dornoch_bookings
FROM bookings
WHERE club = 'dornoch'
AND status = 'Confirmed';

\echo ''
\echo '================================================'
\echo 'COPY THIS OUTPUT and share it so we can see'
\echo 'exactly what data exists in your database!'
\echo '================================================'
