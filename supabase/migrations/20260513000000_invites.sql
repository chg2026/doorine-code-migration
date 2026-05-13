-- Invite table for team member and guest invite management.
-- Idempotent — safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.invites (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID        NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  email       TEXT        NOT NULL,
  role        TEXT        NOT NULL DEFAULT 'viewer',   -- 'admin' | 'viewer'
  type        TEXT        NOT NULL DEFAULT 'member',   -- 'member' | 'guest'
  token       TEXT        NOT NULL UNIQUE,
  status      TEXT        NOT NULL DEFAULT 'pending',  -- 'pending' | 'accepted' | 'expired'
  invited_by  UUID        REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS invites_account_id_idx ON public.invites(account_id);
CREATE INDEX IF NOT EXISTS invites_token_idx      ON public.invites(token);
CREATE INDEX IF NOT EXISTS invites_email_idx      ON public.invites(email);
