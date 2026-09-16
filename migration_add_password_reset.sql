-- Self-service password reset.
--
-- Adds the address a reset link is sent to, and the table that records the
-- outstanding links. Safe to run more than once, and safe to run against a
-- live database: everything here is additive, and the dashboard detects at
-- runtime whether it has been applied (an un-migrated install simply keeps the
-- reset link hidden and tells the administrator why).

-- Where the link goes. Accounts whose username is already an email address do
-- not need this filled in — the API falls back to the username.
ALTER TABLE public.dashboard_users
  ADD COLUMN IF NOT EXISTS email TEXT;

COMMENT ON COLUMN public.dashboard_users.email IS
  'Address password reset links are sent to; falls back to username when it is an email address';

-- One row per reset request. The token itself is never stored — only its
-- SHA-256 — so a leaked database cannot be used to take over an account.
CREATE TABLE IF NOT EXISTS public.password_resets (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES public.dashboard_users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  email        TEXT NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  used_at      TIMESTAMPTZ,
  requested_ip TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_resets_user ON public.password_resets(user_id);
CREATE INDEX IF NOT EXISTS idx_password_resets_expiry ON public.password_resets(expires_at);

COMMENT ON TABLE public.password_resets IS 'Outstanding password reset links; token_hash is SHA-256 of the emailed token';

-- Existing accounts whose username is an address already have somewhere to
-- send to; copying it makes that explicit rather than implicit.
UPDATE public.dashboard_users
   SET email = username
 WHERE email IS NULL AND username LIKE '%@%.%';

SELECT 'Password reset migration complete' AS status,
       COUNT(*) FILTER (WHERE email IS NOT NULL) AS users_with_email,
       COUNT(*) AS users
  FROM public.dashboard_users;
