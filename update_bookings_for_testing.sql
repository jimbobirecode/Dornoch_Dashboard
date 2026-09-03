-- Update Royal Dornoch bookings to send to jamie@teemail.io for testing
-- This will redirect emails and ensure data is properly populated

-- OPTION 1: Update ALL confirmed Royal Dornoch bookings
-- (Use this if you want all bookings to go to your test email)
UPDATE bookings
SET
    guest_email = 'jamie@teemail.io',
    guest_name = COALESCE(guest_name, 'Jamie Test'),
    -- Ensure course data is populated
    golf_courses = COALESCE(
        NULLIF(golf_courses, ''),
        CASE
            WHEN note ILIKE '%blue%' THEN 'Blue Course'
            WHEN note ILIKE '%red%' THEN 'Red Course'
            WHEN note ILIKE '%black%' THEN 'Black Course'
            ELSE 'Royal Dornoch Golf Club'
        END
    ),
    -- Ensure tee time is populated
    tee_time = COALESCE(NULLIF(tee_time, ''), '09:00 AM')
WHERE
    club = 'dornoch'
    AND status = 'Confirmed';

-- Verify the updates
SELECT
    booking_id,
    guest_email,
    guest_name,
    date,
    tee_time,
    players,
    golf_courses,
    total,
    status
FROM bookings
WHERE guest_email = 'jamie@teemail.io'
ORDER BY date
LIMIT 10;

-- OPTION 2: Create specific test bookings for immediate testing
-- (These will show up in the email tabs right away)
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
    hotel_checkout,
    lodging_nights,
    lodging_rooms
) VALUES
-- Welcome email test (3 days from now)
(
    'TEST-JAMIE-WELCOME-001',
    'jamie@teemail.io',
    'Jamie Test',
    CURRENT_DATE + INTERVAL '3 days',
    '09:30 AM',
    4,
    'Blue Course',
    850.00,
    'Confirmed',
    'dornoch',
    'Test booking for welcome email - Blue Course morning tee time',
    NOW(),
    true,
    CURRENT_DATE + INTERVAL '2 days',
    CURRENT_DATE + INTERVAL '5 days',
    3,
    2
),
-- Thank you email test (2 days ago)
(
    'TEST-JAMIE-THANKS-001',
    'jamie@teemail.io',
    'Jamie Test',
    CURRENT_DATE - INTERVAL '2 days',
    '02:00 PM',
    3,
    'Red Course',
    637.50,
    'Confirmed',
    'dornoch',
    'Test booking for thank you email - Red Course afternoon round',
    NOW() - INTERVAL '3 days',
    false,
    NULL,
    NULL,
    0,
    0
)
ON CONFLICT (booking_id) DO UPDATE SET
    guest_email = EXCLUDED.guest_email,
    guest_name = EXCLUDED.guest_name,
    date = EXCLUDED.date,
    tee_time = EXCLUDED.tee_time,
    golf_courses = EXCLUDED.golf_courses,
    status = 'Confirmed';

-- Show what will be in the email tabs
\echo ''
\echo '============================================'
\echo 'BOOKINGS READY FOR WELCOME EMAILS (3 days ahead)'
\echo '============================================'
SELECT
    booking_id,
    guest_email,
    date,
    tee_time,
    players,
    golf_courses,
    COALESCE(total::text, '0') as total
FROM bookings
WHERE guest_email = 'jamie@teemail.io'
AND date = CURRENT_DATE + INTERVAL '3 days'
AND status = 'Confirmed';

\echo ''
\echo '============================================'
\echo 'BOOKINGS READY FOR THANK YOU EMAILS (2 days ago)'
\echo '============================================'
SELECT
    booking_id,
    guest_email,
    date,
    tee_time,
    players,
    golf_courses,
    COALESCE(total::text, '0') as total
FROM bookings
WHERE guest_email = 'jamie@teemail.io'
AND date = CURRENT_DATE - INTERVAL '2 days'
AND status = 'Confirmed';
