-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 1 — Product dimension migration (ROLLBACK)
-- ═══════════════════════════════════════════════════════════════════════════
-- Reverts the ADDITIVE parts of phase-1-product-migration.sql.
--
-- WHAT THIS ROLLBACK DOES
--   • Drops the new tables (account_products, products)
--   • Drops product_id columns from roles and role_permissions
--   • Drops has_product_access() helper
--   • Drops the new updated_at triggers
--
-- WHAT THIS ROLLBACK DOES NOT DO
--   ⚠ Does NOT restore subscription_tiers (was dropped by the forward script;
--     had zero rows in prod as of 2026-04-23, so nothing is lost — but if you
--     for any reason need the three default SKU rows back, re-run the
--     INSERT block from saas-migration.sql lines 76–81)
--   ⚠ Does NOT restore the three ghost tables (users, maintenance_requests,
--     utility_logs). They were empty. If truly needed, use Supabase PITR
--     (≤7 days) to restore from a point before the migration.
--
-- WHEN TO USE THIS SCRIPT
--   • Rehearsing the migration on staging and wanting to re-run cleanly
--   • Prod migration succeeded structurally but Phase 2 code is delayed and
--     you want to return to pre-Phase-1 posture for a few days
--
-- WHEN *NOT* TO USE THIS SCRIPT
--   • A prod migration that corrupted data — use PITR instead. PITR is
--     atomic and restores every side effect including rows inserted during
--     the bad migration. This script cannot do that.
--
-- ORDER OF OPERATIONS (reverses the forward script)
--   1. Drop triggers
--   2. Drop RLS policies
--   3. Drop has_product_access()
--   4. Drop product_id columns (roles, role_permissions) — data loss: each
--      role/permission loses its product association. Since we only ever
--      backfilled to 'chg', reversing this just means "every role is
--      implicitly CHG again", which is the pre-Phase-1 state.
--   5. Drop tables (account_products first, then products — FK order)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. DROP NEW TRIGGERS ──────────────────────────────────────────────────

DROP TRIGGER IF EXISTS set_products_updated_at         ON public.products;
DROP TRIGGER IF EXISTS set_account_products_updated_at ON public.account_products;

-- ─── 2. DROP NEW RLS POLICIES ──────────────────────────────────────────────

DROP POLICY IF EXISTS "Anyone reads products"             ON public.products;
DROP POLICY IF EXISTS "Super admin manages products"      ON public.products;
DROP POLICY IF EXISTS "Super admin full access on account_products" ON public.account_products;
DROP POLICY IF EXISTS "Tenant isolation on account_products"        ON public.account_products;

-- ─── 3. DROP RLS HELPER ────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.has_product_access(TEXT);

-- ─── 4. DROP product_id COLUMNS ON EXISTING TABLES ─────────────────────────
-- roles and role_permissions lose their product scoping. Because the forward
-- script only ever backfilled product_id to 'chg', reversing this returns
-- them to their pre-Phase-1 (implicitly-CHG) state.

ALTER TABLE public.role_permissions DROP COLUMN IF EXISTS product_id;
ALTER TABLE public.roles            DROP COLUMN IF EXISTS product_id;

-- ─── 5. DROP NEW TABLES ────────────────────────────────────────────────────
-- account_products first (has FK to products), then products.

DROP INDEX IF EXISTS public.idx_account_products_account;
DROP INDEX IF EXISTS public.idx_account_products_product;
DROP INDEX IF EXISTS public.idx_roles_product;
DROP INDEX IF EXISTS public.idx_role_permissions_product;

DROP TABLE IF EXISTS public.account_products;
DROP TABLE IF EXISTS public.products;

COMMIT;

-- After running this, run phase-1-product-migration-verify.sql section
-- "rollback verification" to confirm clean state.
