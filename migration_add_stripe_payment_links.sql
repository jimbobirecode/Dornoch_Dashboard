-- Stripe payment links emailed to guests from the dashboard.
--
-- Sending a link sets payment_status to 'Pending'; Stripe's webhook then adds
-- what was paid to amount_paid and sets 'Paid' (or 'Deposit paid' when only
-- part of the total has been received).
--
-- payment_status and amount_paid normally come from
-- migration_add_tour_operators.sql; they are added here too so this migration
-- also works on its own. Safe to run more than once. The dashboard picks the
-- new columns up within 30 seconds, with no restart.

BEGIN;

ALTER TABLE public.bookings
    ADD COLUMN IF NOT EXISTS payment_status             VARCHAR(32) NOT NULL DEFAULT 'Unpaid',
    ADD COLUMN IF NOT EXISTS amount_paid                NUMERIC(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS stripe_payment_link_id     VARCHAR(64),
    ADD COLUMN IF NOT EXISTS stripe_payment_link_url    TEXT,
    ADD COLUMN IF NOT EXISTS payment_link_amount        NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS payment_link_sent_at       TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS payment_link_sent_by       VARCHAR(255),
    ADD COLUMN IF NOT EXISTS stripe_checkout_session_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS stripe_paid_at             TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.bookings.payment_status IS 'Unpaid | Pending | Deposit paid | Paid | Refunded | Written off';
COMMENT ON COLUMN public.bookings.stripe_payment_link_id IS 'The Stripe Payment Link last emailed to the guest (plink_...)';
COMMENT ON COLUMN public.bookings.stripe_payment_link_url IS 'Its URL, as the guest received it';
COMMENT ON COLUMN public.bookings.payment_link_amount IS 'The amount that link asks for';
COMMENT ON COLUMN public.bookings.payment_link_sent_at IS 'When the link was last emailed';
COMMENT ON COLUMN public.bookings.stripe_checkout_session_id IS 'The last Stripe payment counted; stops a retried webhook counting it twice';
COMMENT ON COLUMN public.bookings.stripe_paid_at IS 'When Stripe last reported a payment for this booking';

CREATE INDEX IF NOT EXISTS idx_bookings_stripe_payment_link ON public.bookings (stripe_payment_link_id);

COMMIT;
