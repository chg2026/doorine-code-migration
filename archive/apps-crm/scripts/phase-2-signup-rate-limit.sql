-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 2 — Postgres-backed signup rate limiter
-- ═══════════════════════════════════════════════════════════════════════════
-- Purpose: replace the in-memory Map in server/routes/auth.js with a shared
-- counter that survives deploys and scales across multiple server instances.
-- Audit item from Phase 0 (CLAUDE.md §Active Security Issues).
--
-- What it creates:
--   • public.signup_attempts — one row per signup POST, keyed on IP
--   • index on (ip_address, attempted_at) for fast windowed count
--
-- What it does NOT do:
--   • Auto-prune old rows. The server opportunistically deletes stale rows
--     on each signup check. If the signup endpoint ever goes cold, a cron
--     cleanup can be added later — not worth it at current traffic.
--   • Block abuse beyond the rate-limit window. This is DoS protection for
--     the signup flow, not a full WAF.
--
-- Safety:
--   • Additive. IF NOT EXISTS on everything. Safe to re-run.
--   • No RLS needed — the server writes with service-role key; clients never
--     touch this table directly.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.signup_attempts (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address   TEXT        NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signup_attempts_ip_time
  ON public.signup_attempts (ip_address, attempted_at DESC);

-- Lock down: clients get zero access; service role bypasses RLS anyway.
ALTER TABLE public.signup_attempts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'signup_attempts'
      AND policyname = 'signup_attempts_deny_all'
  ) THEN
    CREATE POLICY signup_attempts_deny_all
      ON public.signup_attempts
      FOR ALL
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

COMMIT;
