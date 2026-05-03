-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 1 — Product dimension migration (VERIFICATION)
-- ═══════════════════════════════════════════════════════════════════════════
-- Run this after phase-1-product-migration.sql on staging (and later prod).
-- Each query is labeled with what PASS looks like. If any query returns
-- unexpected results, STOP — do not proceed to next environment.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. NEW TABLES EXIST ───────────────────────────────────────────────────
-- PASS: returns 2 rows — 'products' and 'account_products'

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('products', 'account_products')
ORDER BY table_name;


-- ─── 2. PRODUCTS CATALOG SEEDED ────────────────────────────────────────────
-- PASS: returns 2 rows — one 'chg' + one 'deallink', both status='active'

SELECT code, name, brand_domain, status
FROM public.products
ORDER BY code;


-- ─── 3. EVERY EXISTING ACCOUNT HAS AN ENTITLEMENT FOR CHG ──────────────────
-- PASS: returns 0 rows (no orphaned accounts)

SELECT a.id AS account_id, a.name
FROM public.accounts a
LEFT JOIN public.account_products ap
  ON ap.account_id = a.id
 AND ap.product_id = (SELECT id FROM public.products WHERE code = 'chg')
WHERE ap.id IS NULL;


-- ─── 4. account_products BACKFILL SANITY — PLAN MIRRORS accounts.plan_tier ─
-- PASS: returns 0 rows (no mismatches)

SELECT a.id AS account_id, a.name, a.plan_tier AS old_plan_tier, ap.plan AS new_plan
FROM public.accounts a
JOIN public.account_products ap ON ap.account_id = a.id
WHERE ap.product_id = (SELECT id FROM public.products WHERE code = 'chg')
  AND COALESCE(a.plan_tier, 'starter') <> ap.plan;


-- ─── 5. ROLES ALL HAVE product_id = CHG ────────────────────────────────────
-- PASS: returns 0 rows (no NULLs, no other products assigned by mistake)

SELECT id, name, account_id, product_id
FROM public.roles
WHERE product_id IS NULL
   OR product_id <> (SELECT id FROM public.products WHERE code = 'chg');


-- ─── 6. ROLE_PERMISSIONS ALL HAVE product_id = CHG ─────────────────────────
-- PASS: returns 0 rows

SELECT id, role_id, department, product_id
FROM public.role_permissions
WHERE product_id IS NULL
   OR product_id <> (SELECT id FROM public.products WHERE code = 'chg');


-- ─── 7. RLS HELPER EXISTS AND IS SECURITY DEFINER ──────────────────────────
-- PASS: returns 1 row with prosecdef=true (SECURITY DEFINER)

SELECT proname, prosecdef, pg_get_function_result(oid) AS returns
FROM pg_proc
WHERE proname = 'has_product_access';


-- ─── 8. RLS POLICIES IN PLACE ──────────────────────────────────────────────
-- PASS: returns 4 rows
--   products          · "Anyone reads products"                        · SELECT
--   products          · "Super admin manages products"                 · ALL
--   account_products  · "Super admin full access on account_products"  · ALL
--   account_products  · "Tenant isolation on account_products"         · ALL

SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('products', 'account_products')
ORDER BY tablename, policyname;


-- ─── 9. RLS ENABLED ON NEW TABLES ──────────────────────────────────────────
-- PASS: both rows show rowsecurity = true

SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('products', 'account_products')
ORDER BY tablename;


-- ─── 10. DROPPED TABLES ARE GONE ───────────────────────────────────────────
-- PASS: returns 0 rows (all four legacy tables dropped)

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('subscription_tiers', 'users', 'maintenance_requests', 'utility_logs');


-- ─── 11. LIVE-COLUMN PRESERVATION — accounts.plan_tier STILL EXISTS ────────
-- PASS: returns 1 row. This column is actively read by server code.
--       Phase 1 keeps it; Phase 2 will drop it after middleware update.

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'accounts'
  AND column_name IN ('plan_tier', 'allowed_departments', 'max_users');


-- ─── 12. has_product_access() SMOKE TEST ──────────────────────────────────
-- Run this logged in AS an actual user (not service role) to confirm
-- the helper returns true for CHG. For service role you'll get NULL
-- because current_account_id() returns NULL.
--
-- Expected when run as an authenticated CHG user: t (true)
-- Expected when run as service role: null
--
-- SELECT public.has_product_access('chg');
