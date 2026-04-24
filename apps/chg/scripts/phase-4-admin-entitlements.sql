-- Phase 4 — Admin Console: entitlement management
--
-- Adds the columns the admin grant/revoke flow needs to keep an audit trail
-- on the entitlement row itself (separate from activity_log, which is the
-- general append-only event log).
--
-- Purely additive. Safe to run on the live prod DB even before the Phase 7
-- cutover — nothing in the old chg-crm code reads these columns, and the
-- new rei-code server only writes to them.
--
-- Run order: staging first, verify with the SELECT at the bottom, then prod.

BEGIN;

-- 1. Track WHO disabled an entitlement and WHEN.
--    Soft-disable preserves the row + plan/started_at, so we can restore
--    later or audit the lifecycle without losing data.
ALTER TABLE public.account_products
  ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disabled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.account_products.disabled_at IS
  'Timestamp set when a super admin revokes this entitlement via the admin console. NULL while active.';
COMMENT ON COLUMN public.account_products.disabled_by IS
  'auth.users.id of the super admin who revoked this entitlement. NULL while active.';

-- 2. Index for the admin list query: "show me all entitlements for account X,
--    optionally filtered by status". Without this, the GET /admin/accounts
--    endpoint does a full scan once we have many accounts.
CREATE INDEX IF NOT EXISTS idx_account_products_account_status
  ON public.account_products (account_id, status);

COMMIT;

-- ─── Verify (run as separate query after the migration) ─────────────────────
--
-- Expected: two new columns, one new index, no data lost.
--
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'account_products'
--   AND column_name IN ('disabled_at', 'disabled_by');
--
-- SELECT indexname FROM pg_indexes
-- WHERE schemaname = 'public'
--   AND tablename = 'account_products'
--   AND indexname = 'idx_account_products_account_status';
--
-- SELECT account_id, product_id, plan, status, disabled_at, disabled_by
-- FROM public.account_products
-- LIMIT 5;
