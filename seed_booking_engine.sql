-- Tee sheet for the booking engine proof of concept.
--
-- Royal Dornoch only. Its two courses, their tariffs, and 90 days of tee times
-- generated from today. Re-runnable: it clears its own generated slots for the
-- window before regenerating, and leaves carts and bookings alone.
--
-- Cabot Highlands is deliberately NOT seeded. It books through Agilysys, so its
-- tee sheet, rates and caddie types come from the live engine; inventing rows
-- here would be dead data that could make a broken connection look healthy.

BEGIN;

INSERT INTO golf_courses (club, course_ref, name, hole_type, request_only, list_order, image_url)
VALUES
  ('royal_dornoch', 'championship', 'Championship Course', 18, FALSE, 0,  NULL),
  ('royal_dornoch', 'struie',       'Struie Course',       18, FALSE, 10, NULL)
ON CONFLICT (club, course_ref) DO UPDATE
  SET name = EXCLUDED.name, list_order = EXCLUDED.list_order;

-- Rates. `deposit_percent` below 100 is what makes Dornoch show a balance due
-- at the club, where a club taking the whole fee up front would set it to 100.
INSERT INTO golf_rate_types
  (club, course_id, rate_ref, tariff_ref, player_type_ref, name, hole_type,
   green_fee, cart_fee, other_fee, tax_percent, deposit_percent, minimum_players, is_private)
SELECT 'royal_dornoch', c.id, v.rate_ref, v.tariff_ref, v.player_type_ref, v.name, 18,
       v.green_fee, 0, 0, 0, v.deposit_percent, v.minimum_players, FALSE
  FROM golf_courses c
  JOIN (VALUES
      ('championship', 'visitor',  '457', '70', 'Visitor Green Fee',  495.00, 25.00, 1),
      ('championship', 'twilight', '458', '70', 'Twilight Green Fee', 295.00, 25.00, 1),
      ('championship', 'member',   '490', '69', 'Member Guest',       195.00, 100.00, 1),
      ('struie',       'visitor',  '457', '70', 'Visitor Green Fee',  120.00, 25.00, 1),
      ('struie',       'member',   '490', '69', 'Member Guest',        60.00, 100.00, 1)
    ) AS v(course_ref, rate_ref, tariff_ref, player_type_ref, name, green_fee,
           deposit_percent, minimum_players)
    ON v.course_ref = c.course_ref
 WHERE c.club = 'royal_dornoch'
ON CONFLICT (club, course_id, rate_ref) DO UPDATE
  SET green_fee = EXCLUDED.green_fee, deposit_percent = EXCLUDED.deposit_percent;

INSERT INTO golf_caddie_types (club, caddie_ref, name, bag_value, fee)
VALUES
  ('royal_dornoch', 'single',     'Single Bag', 1, 70.00),
  ('royal_dornoch', 'double',     'Double Bag', 2, 110.00),
  ('royal_dornoch', 'forecaddie', 'Forecaddie', 4, 140.00)
ON CONFLICT (club, caddie_ref) DO UPDATE SET fee = EXCLUDED.fee, name = EXCLUDED.name;

-- Clear only the window this script is about to regenerate, and only slots
-- nothing has been booked against.
DELETE FROM golf_tee_sheet
 WHERE club = 'royal_dornoch'
   AND play_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 90
   AND NOT EXISTS (
     SELECT 1 FROM booking_cart_items i
      WHERE i.scheduled_at = golf_tee_sheet.scheduled_at
        AND i.course_id = golf_tee_sheet.course_id
   );

-- 90 days of tee times, 06:40 to 17:50 at ten-minute intervals.
INSERT INTO golf_tee_sheet
  (club, course_id, scheduled_at, play_date, available_count, hole_number,
   allocation_code, allocation_name)
SELECT
  c.club,
  c.id,
  slot_at::timestamp,
  slot_at::date,
  -- A realistic sheet is not uniformly empty: the early and late ends of the
  -- day keep all four places, the prime middle is partly taken.
  CASE
    WHEN EXTRACT(HOUR FROM slot_at) BETWEEN 9 AND 14
      THEN (ARRAY[0, 1, 2, 2, 3, 4, 4])[1 + (EXTRACT(EPOCH FROM slot_at)::bigint % 7)]
    ELSE (ARRAY[2, 3, 4, 4])[1 + (EXTRACT(EPOCH FROM slot_at)::bigint % 4)]
  END,
  '1', 'ALL', 'ALL'
FROM golf_courses c
CROSS JOIN generate_series(CURRENT_DATE, CURRENT_DATE + 90, INTERVAL '1 day') AS day
CROSS JOIN LATERAL generate_series(
  day + INTERVAL '6 hours 40 minutes',
  day + INTERVAL '17 hours 50 minutes',
  INTERVAL '10 minutes'
) AS slot_at
WHERE c.club = 'royal_dornoch'
ON CONFLICT (club, course_id, scheduled_at) DO NOTHING;

-- A slot with no places left is simply full.
DELETE FROM golf_tee_sheet WHERE club = 'royal_dornoch' AND available_count <= 0;

COMMIT;

SELECT club, COUNT(*) AS slots, MIN(play_date) AS "from", MAX(play_date) AS "to"
  FROM golf_tee_sheet GROUP BY club ORDER BY club;
