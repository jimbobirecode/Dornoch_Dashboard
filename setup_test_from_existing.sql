-- Pull booking data and show what's available for emails
-- This will help you see what data exists in your bookings table

\echo '============================================'
\echo 'EXISTING BOOKINGS SAMPLE'
\echo '============================================'

SELECT
    booking_id,
    guest_email,
    date,
    tee_time,
    players,
    golf_courses,
    status,
    note
FROM bookings
ORDER BY date DESC
LIMIT 20;

\echo ''
\echo '============================================'
\echo 'BOOKING STATUS DISTRIBUTION'
\echo '============================================'

SELECT
    status,
    COUNT(*) as count
FROM bookings
GROUP BY status
ORDER BY count DESC;

\echo ''
\echo '============================================'
\echo 'BOOKINGS WITH MISSING DATA'
\echo '============================================'

SELECT
    booking_id,
    date,
    CASE WHEN tee_time IS NULL OR tee_time = '' THEN '❌ Missing' ELSE '✓' END as tee_time_status,
    CASE WHEN golf_courses IS NULL OR golf_courses = '' THEN '❌ Missing' ELSE '✓' END as course_status,
    CASE WHEN players IS NULL THEN '❌ Missing' ELSE '✓' END as players_status
FROM bookings
WHERE status = 'Confirmed'
ORDER BY date DESC
LIMIT 20;

\echo ''
\echo '============================================'
\echo 'CREATE TEST BOOKINGS FROM EXISTING DATA'
\echo 'Copying your first confirmed booking...'
\echo '============================================'

-- Copy an existing booking and adjust dates for testing
WITH sample_booking AS (
    SELECT *
    FROM bookings
    WHERE status = 'Confirmed'
    AND date IS NOT NULL
    LIMIT 1
)
INSERT INTO bookings (
    booking_id,
    guest_email,
    guest_name,
    date,
    tee_time,
    players,
    golf_courses,
    total,
    status,
    club,
    note,
    timestamp,
    hotel_required,
    hotel_checkin,
    hotel_checkout
)
SELECT
    'EMAIL-TEST-WELCOME-' || TO_CHAR(NOW(), 'YYYYMMDD'),
    COALESCE(guest_email, 'test@example.com'),
    COALESCE(guest_name, 'Test Guest'),
    CURRENT_DATE + INTERVAL '3 days',
    COALESCE(tee_time, '09:00 AM'),
    COALESCE(players, 4),
    COALESCE(
        CASE
            WHEN golf_courses IS NOT NULL AND golf_courses != '' THEN golf_courses
            WHEN note ILIKE '%blue%' THEN 'Blue Course'
            WHEN note ILIKE '%red%' THEN 'Red Course'
            WHEN note ILIKE '%black%' THEN 'Black Course'
            ELSE 'Royal Dornoch Golf Club'
        END,
        'Royal Dornoch Golf Club'
    ),
    total,
    'Confirmed',
    COALESCE(club, 'dornoch'),
    'Test booking for welcome email - ' || note,
    NOW(),
    hotel_required,
    hotel_checkin,
    hotel_checkout
FROM sample_booking
WHERE NOT EXISTS (
    SELECT 1 FROM bookings
    WHERE booking_id = 'EMAIL-TEST-WELCOME-' || TO_CHAR(NOW(), 'YYYYMMDD')
);

WITH sample_booking AS (
    SELECT *
    FROM bookings
    WHERE status = 'Confirmed'
    AND date IS NOT NULL
    LIMIT 1
)
INSERT INTO bookings (
    booking_id,
    guest_email,
    guest_name,
    date,
    tee_time,
    players,
    golf_courses,
    total,
    status,
    club,
    note,
    timestamp,
    hotel_required,
    hotel_checkin,
    hotel_checkout
)
SELECT
    'EMAIL-TEST-THANKS-' || TO_CHAR(NOW(), 'YYYYMMDD'),
    COALESCE(guest_email, 'test@example.com'),
    COALESCE(guest_name, 'Test Guest'),
    CURRENT_DATE - INTERVAL '2 days',
    COALESCE(tee_time, '10:00 AM'),
    COALESCE(players, 4),
    COALESCE(
        CASE
            WHEN golf_courses IS NOT NULL AND golf_courses != '' THEN golf_courses
            WHEN note ILIKE '%blue%' THEN 'Blue Course'
            WHEN note ILIKE '%red%' THEN 'Red Course'
            WHEN note ILIKE '%black%' THEN 'Black Course'
            ELSE 'Royal Dornoch Golf Club'
        END,
        'Royal Dornoch Golf Club'
    ),
    total,
    'Confirmed',
    COALESCE(club, 'dornoch'),
    'Test booking for thank you email - ' || note,
    NOW(),
    hotel_required,
    hotel_checkin,
    hotel_checkout
FROM sample_booking
WHERE NOT EXISTS (
    SELECT 1 FROM bookings
    WHERE booking_id = 'EMAIL-TEST-THANKS-' || TO_CHAR(NOW(), 'YYYYMMDD')
);

\echo ''
\echo 'Test bookings created! Verifying...'
\echo ''

SELECT
    booking_id,
    guest_email,
    date,
    tee_time,
    players,
    golf_courses,
    status,
    CASE
        WHEN date = CURRENT_DATE + INTERVAL '3 days' THEN '✅ WELCOME EMAIL'
        WHEN date = CURRENT_DATE - INTERVAL '2 days' THEN '✅ THANK YOU EMAIL'
        ELSE ''
    END as email_type
FROM bookings
WHERE booking_id LIKE 'EMAIL-TEST-%'
ORDER BY date;

\echo ''
\echo '============================================'
\echo 'DONE! Now check your dashboard:'
\echo 'Customer Journey Emails > Upcoming Welcome Emails'
\echo 'Customer Journey Emails > Recent Thank You Emails'
\echo '============================================'
