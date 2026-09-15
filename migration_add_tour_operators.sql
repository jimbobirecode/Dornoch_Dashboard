-- Migration: Tour operators, credit terms and operator reminder emails
-- Date: 2026-09-15
-- Description:
--   1. A `tour_operators` table — who the trade partners are, how they are
--      recognised on an incoming booking, and what credit they trade on.
--   2. The payment half of a booking: which operator it belongs to, what has
--      been invoiced, what has been paid, and when the money is due.
--   3. Two send-stamp columns so an operator reminder is not sent twice.
--
-- Everything here is additive and idempotent. The dashboard detects these
-- columns at runtime, so an un-migrated database keeps working — it just
-- cannot show the Tour Operators page.

-- ---------------------------------------------------------------------------
-- 1. The operators themselves
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tour_operators (
    id                  SERIAL PRIMARY KEY,
    club                VARCHAR(100) NOT NULL,
    name                VARCHAR(255) NOT NULL,

    contact_name        VARCHAR(255),
    contact_email       VARCHAR(255),
    contact_phone       VARCHAR(64),
    account_code        VARCHAR(64),

    -- How a booking is recognised as this operator's without anybody tagging
    -- it: the email domains they book from, e.g. {"golfbreaks.com"}.
    email_domains       TEXT[] NOT NULL DEFAULT '{}',

    -- Credit terms.
    payment_terms_days          INTEGER NOT NULL DEFAULT 30,
    deposit_percent             NUMERIC(5,2) NOT NULL DEFAULT 0,
    deposit_due_days_before_play   INTEGER,
    balance_due_days_before_play   INTEGER,
    credit_limit        NUMERIC(12,2),
    currency            VARCHAR(3) NOT NULL DEFAULT 'GBP',

    -- Trading state. `on_hold` means no new business until the account is
    -- settled; `active` retires an operator without deleting their history.
    on_hold             BOOLEAN NOT NULL DEFAULT FALSE,
    active              BOOLEAN NOT NULL DEFAULT TRUE,

    notes               TEXT,
    created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by          VARCHAR(255)
);

-- One name per club, case-insensitively: two rows called "Golfbreaks" would
-- split the same account's exposure in half.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tour_operators_club_name
    ON public.tour_operators (club, LOWER(name));
CREATE INDEX IF NOT EXISTS idx_tour_operators_club ON public.tour_operators (club);

COMMENT ON TABLE  public.tour_operators IS 'Trade partners who book on behalf of guests, and the credit they trade on';
COMMENT ON COLUMN public.tour_operators.email_domains IS 'Sending domains that identify a booking as this operator''s';
COMMENT ON COLUMN public.tour_operators.payment_terms_days IS 'Net days from invoice date; 0 means payment on invoice';
COMMENT ON COLUMN public.tour_operators.deposit_percent IS 'Share of the booking total due as a deposit, 0-100';
COMMENT ON COLUMN public.tour_operators.deposit_due_days_before_play IS 'Deposit due this many days before play; NULL falls back to the invoice terms';
COMMENT ON COLUMN public.tour_operators.balance_due_days_before_play IS 'Balance due this many days before play; NULL falls back to the invoice terms';
COMMENT ON COLUMN public.tour_operators.credit_limit IS 'Maximum outstanding balance allowed on the account; NULL means no limit';
COMMENT ON COLUMN public.tour_operators.on_hold IS 'Account suspended — take no new business until it is settled';

-- ---------------------------------------------------------------------------
-- 2. The payment half of a booking
-- ---------------------------------------------------------------------------
ALTER TABLE public.bookings
    ADD COLUMN IF NOT EXISTS tour_operator_id INTEGER
        REFERENCES public.tour_operators(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS payment_status   VARCHAR(32) NOT NULL DEFAULT 'Unpaid',
    ADD COLUMN IF NOT EXISTS amount_paid      NUMERIC(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS invoice_number   VARCHAR(64),
    ADD COLUMN IF NOT EXISTS invoiced_at      DATE,
    ADD COLUMN IF NOT EXISTS deposit_due_date DATE,
    ADD COLUMN IF NOT EXISTS balance_due_date DATE;

COMMENT ON COLUMN public.bookings.tour_operator_id IS 'The trade account this booking belongs to; NULL is a direct guest booking';
COMMENT ON COLUMN public.bookings.payment_status IS 'Unpaid | Deposit paid | Paid | Refunded | Written off';
COMMENT ON COLUMN public.bookings.amount_paid IS 'Money received against this booking so far';
COMMENT ON COLUMN public.bookings.deposit_due_date IS 'Overrides the date derived from the operator''s credit terms';
COMMENT ON COLUMN public.bookings.balance_due_date IS 'Overrides the date derived from the operator''s credit terms';

-- ---------------------------------------------------------------------------
-- 3. Operator reminder send stamps
-- ---------------------------------------------------------------------------
ALTER TABLE public.bookings
    ADD COLUMN IF NOT EXISTS operator_status_email_sent_at  TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS operator_payment_email_sent_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.bookings.operator_status_email_sent_at IS 'When this booking was last included in a booking-status reminder to its operator';
COMMENT ON COLUMN public.bookings.operator_payment_email_sent_at IS 'When this booking was last included in a payment reminder to its operator';

CREATE INDEX IF NOT EXISTS idx_bookings_tour_operator ON public.bookings (tour_operator_id);
CREATE INDEX IF NOT EXISTS idx_bookings_payment_status ON public.bookings (payment_status);
CREATE INDEX IF NOT EXISTS idx_bookings_balance_due ON public.bookings (balance_due_date);
