-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 2.5 — Drop legacy plan columns from accounts
-- ═══════════════════════════════════════════════════════════════════════════
-- Purpose: remove the three columns that were superseded by the product
-- dimension in Phase 1. Since Phase 2 landed the API layer that reads/writes
-- `account_products` instead, the legacy columns are now unreferenced dead
-- weight on the schema.
--
-- Columns being dropped:
--   • accounts.plan_tier            → replaced by account_products.plan
--   • accounts.allowed_departments  → never enforced server-side; dead
--   • accounts.max_users            → never enforced; implied by plan
--
-- Pre-flight requirements (all must be TRUE before running this):
--   • Phase 2 PR A + PR B merged and deployed to prod
--   • Server middleware/auth.js no longer SELECTs the dropped columns
--   • /auth/me response derives plan_tier from the CHG entitlement
--   • Admin routes write plan changes via syncChgEntitlement, not plan_tier
--   • Signup no longer writes the 3 legacy fields into accounts
--
-- Blast radius: LOW. The columns have no remaining readers after the
-- accompanying code PR. Dropping them frees the schema for Phase 4.
--
-- Rollback: ADD COLUMN with the original types back, then re-populate from
-- account_products if needed. Defaults in the rollback script mirror the
-- original saas-migration.sql column definitions.
--
-- Estimated runtime: <1s (small table, no data dependencies).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.accounts DROP COLUMN IF EXISTS plan_tier;
ALTER TABLE public.accounts DROP COLUMN IF EXISTS allowed_departments;
ALTER TABLE public.accounts DROP COLUMN IF EXISTS max_users;

COMMIT;

-- ───────────────────────────── Verify ──────────────────────────────────────
-- Run separately to confirm the drop succeeded:
--
-- SELECT column_name
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name   = 'accounts'
--   AND column_name IN ('plan_tier','allowed_departments','max_users');
--
-- Expected: 0 rows.
