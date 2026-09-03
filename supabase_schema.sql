-- =============================================================================
-- Royal Dornoch Golf Club - Supabase schema
-- =============================================================================
-- Consolidates every incremental migration in this repo into a single
-- idempotent script, so a fresh Supabase project can be brought up in one run.
--
-- Apply with either:
--   psql "$DATABASE_URL" -f supabase_schema.sql
--   or paste into the Supabase SQL editor.
--
-- Supersedes (do not also run these on a fresh project):
--   migration_add_hotel_and_workflow.sql
--   migration_add_resort_fees.sql
--   migration_add_journey_emails.sql
--   ../streamsong-core-api/add_resort_fee_column.sql
-- =============================================================================


-- -----------------------------------------------------------------------------
-- bookings
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookings (
    id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_id                VARCHAR(50)  UNIQUE NOT NULL,
    club                      VARCHAR(100) NOT NULL,

    -- Guest
    guest_email               VARCHAR(255) NOT NULL,
    guest_name                VARCHAR(255),

    -- Golf
    date                      DATE,
    tee_time                  VARCHAR(50),
    players                   INTEGER,
    total                     DECIMAL(10, 2),
    golf_dates                TEXT[],
    golf_courses              TEXT,
    selected_tee_times        JSONB,

    -- Workflow: Inquiry -> Requested -> Confirmed -> Booked
    status                    VARCHAR(50) DEFAULT 'Inquiry',
    note                      TEXT,

    -- Lodging
    hotel_required            BOOLEAN DEFAULT FALSE,
    hotel_checkin             DATE,
    hotel_checkout            DATE,
    hotel_nights              INTEGER,
    hotel_rooms               INTEGER,
    hotel_cost                DECIMAL(10, 2),
    lodging_intent            TEXT,
    lodging_nights            INTEGER,
    lodging_rooms             INTEGER,
    lodging_room_type         VARCHAR(255),
    lodging_preferences       TEXT,
    lodging_cost              DECIMAL(10, 2),

    -- Resort fees
    resort_fee_per_person     DECIMAL(10, 2) DEFAULT 0.00,
    resort_fee_total          DECIMAL(10, 2) DEFAULT 0.00,

    -- Customer journey email tracking
    pre_arrival_email_sent_at TIMESTAMP WITH TIME ZONE,
    post_play_email_sent_at   TIMESTAMP WITH TIME ZONE,

    -- Audit
    customer_confirmed_at     TIMESTAMP WITH TIME ZONE,
    timestamp                 TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at                TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at                TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by                VARCHAR(255)
);

COMMENT ON TABLE  bookings IS 'Visitor tee time enquiries and bookings';
COMMENT ON COLUMN bookings.booking_id IS 'Public booking reference, format RDG-YYYYMMDD-XXXX';
COMMENT ON COLUMN bookings.club IS 'Club key this booking belongs to (matches CLUB_ID env var)';
COMMENT ON COLUMN bookings.status IS 'Inquiry -> Requested -> Confirmed -> Booked';
COMMENT ON COLUMN bookings.selected_tee_times IS 'JSON array of selected tee times with course, time and pricing';
COMMENT ON COLUMN bookings.resort_fee_total IS 'Total resort fees for the entire stay';
COMMENT ON COLUMN bookings.pre_arrival_email_sent_at IS 'When the welcome email was sent (3 days before play)';
COMMENT ON COLUMN bookings.post_play_email_sent_at IS 'When the thank you email was sent (2 days after play)';
COMMENT ON COLUMN bookings.customer_confirmed_at IS 'When the customer confirmed their tee time selection';

CREATE INDEX IF NOT EXISTS idx_bookings_club              ON bookings(club);
CREATE INDEX IF NOT EXISTS idx_bookings_status            ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_date              ON bookings(date);
CREATE INDEX IF NOT EXISTS idx_bookings_guest_email       ON bookings(guest_email);
CREATE INDEX IF NOT EXISTS idx_bookings_hotel_checkin     ON bookings(hotel_checkin);
CREATE INDEX IF NOT EXISTS idx_bookings_pre_arrival_email ON bookings(pre_arrival_email_sent_at);
CREATE INDEX IF NOT EXISTS idx_bookings_post_play_email   ON bookings(post_play_email_sent_at);
CREATE INDEX IF NOT EXISTS idx_bookings_club_status_date  ON bookings(club, status, date);


-- -----------------------------------------------------------------------------
-- waitlist
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS waitlist (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    waitlist_id          VARCHAR(50)  UNIQUE NOT NULL,
    club                 VARCHAR(100) NOT NULL,

    guest_email          VARCHAR(255) NOT NULL,
    guest_name           VARCHAR(255),

    requested_date       DATE NOT NULL,
    preferred_time       VARCHAR(50),
    time_flexibility     VARCHAR(50) DEFAULT 'Flexible',
    players              INTEGER DEFAULT 1,
    golf_course          VARCHAR(255),

    status               VARCHAR(50) DEFAULT 'Waiting',
    priority             INTEGER DEFAULT 5,
    notes                TEXT,

    notification_sent    BOOLEAN DEFAULT FALSE,
    notification_sent_at TIMESTAMP WITH TIME ZONE,

    created_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE  waitlist IS 'Tee time waitlist entries';
COMMENT ON COLUMN waitlist.priority IS '1 (lowest) to 10 (highest); default 5';

CREATE INDEX IF NOT EXISTS idx_waitlist_club        ON waitlist(club);
CREATE INDEX IF NOT EXISTS idx_waitlist_status      ON waitlist(status);
CREATE INDEX IF NOT EXISTS idx_waitlist_req_date    ON waitlist(requested_date);
CREATE INDEX IF NOT EXISTS idx_waitlist_club_status ON waitlist(club, status, requested_date);


-- -----------------------------------------------------------------------------
-- updated_at maintenance
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bookings_updated_at ON bookings;
CREATE TRIGGER trg_bookings_updated_at
    BEFORE UPDATE ON bookings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_waitlist_updated_at ON waitlist;
CREATE TRIGGER trg_waitlist_updated_at
    BEFORE UPDATE ON waitlist
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
-- Both the booking bot and the dashboard connect over Postgres with the
-- `postgres` role (which bypasses RLS), not through PostgREST. RLS is enabled
-- with no permissive policy so that the anon and authenticated API roles cannot
-- read booking data if the project's REST API is ever exposed.
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON bookings FROM anon, authenticated;
REVOKE ALL ON waitlist FROM anon, authenticated;
