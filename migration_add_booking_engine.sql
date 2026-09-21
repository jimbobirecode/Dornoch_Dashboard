-- Booking engine: the tee sheet, its rates, and the carts built against it.
--
-- The shape mirrors what the Agilysys Web Booking Engine exposes for Cabot
-- Highlands (see BOOKING_ENGINE.md), so a club served by Agilysys and a club
-- served by these tables answer the same API. Safe to run more than once.

CREATE TABLE IF NOT EXISTS golf_courses (
    id              SERIAL PRIMARY KEY,
    club            VARCHAR(100) NOT NULL,
    -- The provider's own id for the course. Agilysys calls this courseId
    -- (39 = Castle Stuart, 40 = Old Petty); a Postgres-backed club reuses `id`.
    course_ref      VARCHAR(50)  NOT NULL,
    name            VARCHAR(255) NOT NULL,
    hole_type       INTEGER      NOT NULL DEFAULT 18,
    -- Agilysys `resvReqd`: the course cannot be booked online, only requested.
    request_only    BOOLEAN      NOT NULL DEFAULT FALSE,
    -- Agilysys `listOrder`; ascending, so 0 sorts first.
    list_order      INTEGER      NOT NULL DEFAULT 0,
    image_url       TEXT,
    active          BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (club, course_ref)
);

-- A price a slot can be sold at. Agilysys splits this in two: `rateTypeId` is
-- the tariff (457 = visitor, 490 = member) and `id` is that tariff priced for
-- one course, which is why two courses on one tariff carry different ids.
CREATE TABLE IF NOT EXISTS golf_rate_types (
    id              SERIAL PRIMARY KEY,
    club            VARCHAR(100) NOT NULL,
    course_id       INTEGER      NOT NULL REFERENCES golf_courses(id) ON DELETE CASCADE,
    rate_ref        VARCHAR(50)  NOT NULL,
    tariff_ref      VARCHAR(50),
    player_type_ref VARCHAR(50),
    name            VARCHAR(255) NOT NULL,
    hole_type       INTEGER      NOT NULL DEFAULT 18,
    green_fee       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    cart_fee        DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    other_fee       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    -- Fees are VAT-inclusive at Cabot, so this is 0 there; a club that adds
    -- tax on top sets a rate here and the quote grows a tax line.
    tax_percent     DECIMAL(5,2)  NOT NULL DEFAULT 0.00,
    -- What must be paid to hold the booking. Cabot takes the lot (100).
    deposit_percent DECIMAL(5,2)  NOT NULL DEFAULT 100.00,
    minimum_players INTEGER      NOT NULL DEFAULT 1,
    -- Not offered to the public; reachable only with a rate code.
    is_private      BOOLEAN      NOT NULL DEFAULT FALSE,
    active          BOOLEAN      NOT NULL DEFAULT TRUE,
    UNIQUE (club, course_id, rate_ref)
);

-- One bookable tee time. `available_count` is what is left, not the capacity,
-- exactly as Agilysys reports it.
CREATE TABLE IF NOT EXISTS golf_tee_sheet (
    id                SERIAL PRIMARY KEY,
    club              VARCHAR(100) NOT NULL,
    course_id         INTEGER      NOT NULL REFERENCES golf_courses(id) ON DELETE CASCADE,
    tee_time_ref      VARCHAR(50),
    -- Local wall-clock at the course; the club's zone turns it into an instant.
    scheduled_at      TIMESTAMP    NOT NULL,
    play_date         DATE         NOT NULL,
    available_count   INTEGER      NOT NULL DEFAULT 4,
    hole_number       VARCHAR(10)  NOT NULL DEFAULT '1',
    allocation_code   VARCHAR(50)  NOT NULL DEFAULT 'ALL',
    allocation_name   VARCHAR(100) NOT NULL DEFAULT 'ALL',
    -- Empty means every active rate on the course is sellable at this time.
    rate_refs         TEXT[],
    blocked           BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (club, course_id, scheduled_at)
);

CREATE INDEX IF NOT EXISTS idx_tee_sheet_club_date ON golf_tee_sheet (club, play_date);

-- A cart is anonymous and long-lived: Agilysys hands the browser a cart id and
-- the guest returns to it days later, which is why the HAR's cart still held a
-- tee time added two days earlier.
CREATE TABLE IF NOT EXISTS booking_carts (
    id              UUID PRIMARY KEY,
    club            VARCHAR(100) NOT NULL,
    locale          VARCHAR(10)  NOT NULL DEFAULT 'EN',
    guest           JSONB,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ
);

-- A cart line names the course and rate by the *provider's* reference rather
-- than by a foreign key, because the club whose tee sheet comes from Agilysys
-- has no rows in `golf_courses` at all. The refs are what booking and pricing
-- use; the names beside them are display labels and are never used for money.
CREATE TABLE IF NOT EXISTS booking_cart_items (
    -- Agilysys calls this transactionId; it identifies the line, not the cart.
    id              UUID PRIMARY KEY,
    cart_id         UUID         NOT NULL REFERENCES booking_carts(id) ON DELETE CASCADE,
    club            VARCHAR(100) NOT NULL,
    course_ref      VARCHAR(50)  NOT NULL,
    course_name     VARCHAR(255) NOT NULL,
    rate_ref        VARCHAR(50)  NOT NULL,
    rate_name       VARCHAR(255) NOT NULL,
    image_url       TEXT,
    scheduled_at    TIMESTAMP    NOT NULL,
    play_date       DATE         NOT NULL,
    players         INTEGER      NOT NULL DEFAULT 1,
    holes           INTEGER      NOT NULL DEFAULT 18,
    caddie_type_ref VARCHAR(50),
    caddies         INTEGER      NOT NULL DEFAULT 0,
    -- The quote as it stood when the line was added. Re-priced at checkout;
    -- a difference is what makes the cart show "price changed" rather than
    -- silently charging the new amount.
    quote           JSONB        NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON booking_cart_items (cart_id);

-- What the cart became once it was paid for. One row per cart; the lines it
-- covered are kept verbatim so a later rate change cannot rewrite history.
CREATE TABLE IF NOT EXISTS booking_reservations (
    id                 SERIAL PRIMARY KEY,
    club               VARCHAR(100) NOT NULL,
    confirmation_code  VARCHAR(50)  UNIQUE NOT NULL,
    cart_id            UUID,
    guest              JSONB        NOT NULL,
    items              JSONB        NOT NULL,
    grand_total        DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    deposit_amount     DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    total_tax          DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    currency           VARCHAR(10)  NOT NULL DEFAULT 'GBP',
    status             VARCHAR(50)  NOT NULL DEFAULT 'Booked',
    payment_status     VARCHAR(50)  NOT NULL DEFAULT 'Deposit Paid',
    payment_reference  VARCHAR(100),
    cancellation_policy TEXT,
    cancelled_at       TIMESTAMPTZ,
    refund_amount      DECIMAL(10,2),
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reservations_club ON booking_reservations (club, created_at DESC);

-- Caddies are configured per club, matching the Agilysys caddyTypeConfig call.
-- `bag_value` is how many bags the caddie carries, which is what decides how
-- many a four-ball needs.
CREATE TABLE IF NOT EXISTS golf_caddie_types (
    id          SERIAL PRIMARY KEY,
    club        VARCHAR(100) NOT NULL,
    caddie_ref  VARCHAR(50)  NOT NULL,
    name        VARCHAR(100) NOT NULL,
    bag_value   INTEGER      NOT NULL DEFAULT 1,
    fee         DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    active      BOOLEAN      NOT NULL DEFAULT TRUE,
    UNIQUE (club, caddie_ref)
);
