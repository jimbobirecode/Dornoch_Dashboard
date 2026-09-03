-- Fix Missing Course Data
-- If your bookings don't have golf_courses populated, this will help

-- Check current state
\echo 'Current bookings with missing course data:'
SELECT booking_id, guest_email, date, golf_courses
FROM bookings
WHERE status = 'Confirmed'
AND (golf_courses IS NULL OR golf_courses = '')
LIMIT 10;

\echo ''
\echo 'Updating bookings with default course information...'

-- Update bookings that have course info in the note field
UPDATE bookings
SET golf_courses =
    CASE
        WHEN note ILIKE '%blue course%' OR note ILIKE '%blue%' THEN 'Blue Course'
        WHEN note ILIKE '%red course%' OR note ILIKE '%red%' THEN 'Red Course'
        WHEN note ILIKE '%black course%' OR note ILIKE '%black%' THEN 'Black Course'
        ELSE 'Royal Dornoch Golf Club'
    END
WHERE status = 'Confirmed'
AND (golf_courses IS NULL OR golf_courses = '');

\echo ''
\echo 'Update complete! Checking results:'

SELECT
    COUNT(*) as total_confirmed,
    COUNT(*) FILTER (WHERE golf_courses IS NOT NULL AND golf_courses != '') as with_course_data,
    COUNT(*) FILTER (WHERE golf_courses IS NULL OR golf_courses = '') as missing_course_data
FROM bookings
WHERE status = 'Confirmed';
