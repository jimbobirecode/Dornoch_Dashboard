-- User management: roles, invitations and the audit trail behind an account.
--
-- Builds on migration_add_password_reset.sql, which must be run first — an
-- invitation is a password-reset token with a different purpose and a longer
-- life, so the two share one table rather than growing a second copy of the
-- same machinery. That order is checked below rather than assumed: running
-- these the wrong way round otherwise fails halfway through, with a bare
-- "column email does not exist" and no hint as to which file to run.
--
-- Safe to run more than once, and safe against a live database: everything
-- here is additive and the dashboard detects at runtime whether it has been
-- applied. An un-migrated install keeps working exactly as it does today —
-- the Users page simply says which migration to run.

-- ---------------------------------------------------------------------------
-- Prerequisite
-- ---------------------------------------------------------------------------

-- Stop before changing anything if the migration this one extends has not been
-- run. Failing on the first statement, with the remedy in the message, beats
-- failing on the twentieth with a column name.
DO $$
DECLARE
  missing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF to_regclass('public.dashboard_users') IS NULL THEN
    RAISE EXCEPTION
      'public.dashboard_users does not exist. This is not the dashboard database, '
      'or it has never been set up — run scripts/seed.mjs or seed_royal_dornoch_demo.sql first.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'dashboard_users' AND column_name = 'email'
  ) THEN
    missing := array_append(missing, 'dashboard_users.email');
  END IF;

  IF to_regclass('public.password_resets') IS NULL THEN
    missing := array_append(missing, 'public.password_resets');
  END IF;

  IF array_length(missing, 1) > 0 THEN
    RAISE EXCEPTION
      'Run migration_add_password_reset.sql first — this migration extends it, and % %',
      array_to_string(missing, ' and '),
      CASE WHEN array_length(missing, 1) = 1 THEN 'is missing.' ELSE 'are missing.' END;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------

-- What an account may do. 'admin' can manage other accounts; 'staff' is the
-- working login — bookings, emails, reports, everything except user admin.
ALTER TABLE public.dashboard_users
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'staff';

-- Who made the account and when, so an unexpected login has a paper trail.
ALTER TABLE public.dashboard_users
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.dashboard_users
  ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE public.dashboard_users
  ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ;

COMMENT ON COLUMN public.dashboard_users.role IS
  'admin = may manage other accounts; staff = everything else';
COMMENT ON COLUMN public.dashboard_users.invited_at IS
  'When an invitation was last emailed. Whether it has been accepted is read from password_hash, not from here';

-- Only the two roles the code knows about, so a typo cannot quietly create an
-- account that can do nothing. Added separately from the column so re-running
-- is safe on a database that already has it.
DO $$
BEGIN
  ALTER TABLE public.dashboard_users
    ADD CONSTRAINT dashboard_users_role_check CHECK (role IN ('admin', 'staff'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Every account that exists today can already do everything — there were no
-- roles to stop it. Making them admins preserves exactly that, rather than
-- locking the club out of its own dashboard on the morning of the upgrade.
-- New accounts default to 'staff' and are promoted deliberately.
--
-- Guarded on "no admins yet" rather than on a date: the column defaults to
-- NOW() for rows that predate it, so any date test would match every staff
-- account on a second run and quietly promote the lot.
UPDATE public.dashboard_users
   SET role = 'admin'
 WHERE NOT EXISTS (SELECT 1 FROM public.dashboard_users WHERE role = 'admin');

-- One account per address, and one per login spelled any case — logins are
-- matched case-insensitively, and two accounts sharing an inbox would both be
-- sent the same reset link, the second reader being told it was already spent.
--
-- These can legitimately fail on a database that already holds duplicates.
-- That must not abort the rest of the migration: the roles and the invitation
-- machinery are still worth having, so a clash is reported and left for
-- somebody to resolve by hand.
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS idx_dashboard_users_email
    ON public.dashboard_users (LOWER(email)) WHERE email IS NOT NULL;
EXCEPTION
  WHEN unique_violation THEN
    RAISE WARNING 'dashboard_users holds two accounts with the same email address. '
                  'Resolve the duplicate, then re-run this migration to add the index.';
  WHEN undefined_column THEN
    RAISE WARNING 'dashboard_users has no email column — run migration_add_password_reset.sql, '
                  'then re-run this migration to add the index.';
END $$;

DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS idx_dashboard_users_username
    ON public.dashboard_users (LOWER(username));
EXCEPTION WHEN unique_violation THEN
    RAISE WARNING 'dashboard_users holds two accounts whose usernames differ only by case. '
                  'Resolve the duplicate, then re-run this migration to add the index.';
END $$;

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------

-- An invitation and a password reset are the same object with different
-- wording and a different life: 'invite' links live for days because they are
-- sent to somebody who was not expecting them, 'reset' links for an hour
-- because somebody just asked for one.
ALTER TABLE public.password_resets
  ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'reset';

DO $$
BEGIN
  ALTER TABLE public.password_resets
    ADD CONSTRAINT password_resets_purpose_check CHECK (purpose IN ('reset', 'invite'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN public.password_resets.purpose IS
  'reset = the account asked; invite = an administrator created the account';

CREATE INDEX IF NOT EXISTS idx_password_resets_purpose
  ON public.password_resets (user_id, purpose) WHERE used_at IS NULL;

-- ---------------------------------------------------------------------------

SELECT 'User management migration complete'        AS status,
       COUNT(*)                                     AS users,
       COUNT(*) FILTER (WHERE role = 'admin')       AS admins,
       COUNT(*) FILTER (WHERE email IS NOT NULL)    AS with_email
  FROM public.dashboard_users;
