-- Sample Bookings for Testing Customer Journey Emails
-- Run this after the migration to create test data

-- Sample bookings for WELCOME EMAILS (3 days from today)
INSERT INTO bookings (
    booking_id,
    guest_email,
    guest_name,
    date,
    tee_time,
    players,
    total,
    status,
    club,
    note,
    timestamp
) VALUES
(
    'TEST-WELCOME-001',
    'john.smith@example.com',
    'John Smith',
    CURRENT_DATE + INTERVAL '3 days',
    '09:00 AM',
    4,
    850.00,
    'Confirmed',
    'dornoch',
    'Tee time: 09:00 AM - Blue Course',
    NOW()
),
(
    'TEST-WELCOME-002',
    'sarah.jones@example.com',
    'Sarah Jones',
    CURRENT_DATE + INTERVAL '3 days',
    '10:30 AM',
    2,
    425.00,
    'Confirmed',
    'dornoch',
    'Tee time: 10:30 AM - Red Course',
    NOW()
),
(
    'TEST-WELCOME-003',
    'mike.wilson@example.com',
    'Mike Wilson',
    CURRENT_DATE + INTERVAL '3 days',
    '02:00 PM',
    3,
    637.50,
    'Confirmed',
    'dornoch',
    'Tee time: 02:00 PM - Black Course',
    NOW()
);

-- Sample bookings for THANK YOU EMAILS (2 days ago)
INSERT INTO bookings (
    booking_id,
    guest_email,
    guest_name,
    date,
    tee_time,
    players,
    total,
    status,
    club,
    note,
    timestamp
) VALUES
(
    'TEST-THANKS-001',
    'emma.davis@example.com',
    'Emma Davis',
    CURRENT_DATE - INTERVAL '2 days',
    '08:30 AM',
    4,
    850.00,
    'Confirmed',
    'dornoch',
    'Tee time: 08:30 AM - Blue Course - Completed',
    NOW() - INTERVAL '3 days'
),
(
    'TEST-THANKS-002',
    'david.brown@example.com',
    'David Brown',
    CURRENT_DATE - INTERVAL '2 days',
    '11:00 AM',
    2,
    425.00,
    'Confirmed',
    'dornoch',
    'Tee time: 11:00 AM - Red Course - Completed',
    NOW() - INTERVAL '3 days'
),
(
    'TEST-THANKS-003',
    'lisa.taylor@example.com',
    'Lisa Taylor',
    CURRENT_DATE - INTERVAL '2 days',
    '01:30 PM',
    3,
    637.50,
    'Confirmed',
    'dornoch',
    'Tee time: 01:30 PM - Black Course - Completed',
    NOW() - INTERVAL '3 days'
);

-- Additional booking for today (won't show in email lists)
INSERT INTO bookings (
    booking_id,
    guest_email,
    guest_name,
    date,
    tee_time,
    players,
    total,
    status,
    club,
    note,
    timestamp
) VALUES
(
    'TEST-TODAY-001',
    'test.user@example.com',
    'Test User',
    CURRENT_DATE,
    '03:00 PM',
    2,
    425.00,
    'Confirmed',
    'dornoch',
    'Tee time: 03:00 PM - Today',
    NOW()
);

-- Verify the data
SELECT
    booking_id,
    guest_email,
    guest_name,
    date,
    tee_time,
    players,
    status,
    CASE
        WHEN date = CURRENT_DATE + INTERVAL '3 days' THEN '✅ Welcome Email (3 days ahead)'
        WHEN date = CURRENT_DATE - INTERVAL '2 days' THEN '✅ Thank You Email (2 days ago)'
        WHEN date = CURRENT_DATE THEN '⏰ Today'
        ELSE '❌ Other date'
    END as email_category
FROM bookings
WHERE booking_id LIKE 'TEST-%'
ORDER BY date, tee_time;
