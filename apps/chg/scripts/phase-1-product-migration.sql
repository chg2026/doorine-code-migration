-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 1 — Product dimension migration (forward)
-- ═══════════════════════════════════════════════════════════════════════════
-- Adds the Atlassian-style product layer to the CHG multi-tenant schema.
-- Tracking: blueprint §05 (schema diff) + Phase 1 per blueprint §12.
-- Runbook: docs/phase-1/migration-runbook.md
-- Rollback: phase-1-product-migration-rollback.sql
-- Verify: phase-1-product-migration-verify.sql
--
-- DESIGN PRINCIPLES
--   • Additive for live columns. accounts.plan_tier, allowed_departments,
--     max_users are STILL read by the server (auth.js, admin.js). We MIRROR
--     their values into account_products but do NOT drop them here. Phase 2
--     updates middleware to read from account_products, then a later phase
--     drops the old columns once no code references remain.
--
--   • Idempotent. All DDL uses IF NOT EXISTS / IF EXISTS. All backfill uses
--     ON CONFLICT DO NOTHING. Safe to re-run on the same database.
--
--   • RLS-safe. New tables ship with proper policies from the start.
--     No window where tenant isolation is disabled.
--
--   • Transactional. Wraps DDL + backfill in a single transaction so a
--     failure reverts everything. (Note: PG does not let CREATE INDEX
--     CONCURRENTLY inside a txn; we use non-concurrent indexes since this
--     runs during a maintenance window.)
--
-- PRE-DEPLOY CHECKLIST (see runbook for full steps)
--   ☐ Staging: clone prod data, run this script, run verify.sql, confirm OK
--   ☐ Prod: PITR confirmed enabled (take a fresh backup snapshot anyway)
--   ☐ Security hotfix deployed first (fix/security-hotfix-p0)
--   ☐ "Allow new user sign-ups" toggled OFF in Supabase Auth during window
--   ☐ Maintenance window scheduled; CHG customers notified
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. PRODUCTS CATALOG ───────────────────────────────────────────────────
-- The list of distinct products in the Gold Bridge platform.
-- Seeded with 2 rows. New products (e.g., a future analytics add-on) would
-- be inserted here by super admins.

CREATE TABLE IF NOT EXISTS public.products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT NOT NULL UNIQUE,          -- 'chg', 'deallink' — stable machine id
  name          TEXT NOT NULL,                 -- 'CHG', 'Deal Link' — display name
  brand_domain  TEXT,                          -- 'app.chg.io', 'deallink.io' — future use
  icon          TEXT,                          -- icon hint for app-switcher UI
  status        TEXT NOT NULL DEFAULT 'active', -- 'active', 'deprecated', 'coming_soon'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the two known products. ON CONFLICT makes this idempotent.
INSERT INTO public.products (code, name, brand_domain, icon, status)
VALUES
  ('chg',      'CHG',       'app.chg.io',  'CHG', 'active'),
  ('deallink', 'Deal Link', 'deallink.io', 'DL',  'active')
ON CONFLICT (code) DO NOTHING;

-- ─── 2. ACCOUNT ↔ PRODUCT ENTITLEMENTS ─────────────────────────────────────
-- One row per (account, product) pair. Replaces the flat accounts.plan_tier
-- with a per-product plan. A single account can have CHG on Professional
-- while having Deal Link on Free.

CREATE TABLE IF NOT EXISTS public.account_products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  plan            TEXT NOT NULL DEFAULT 'starter',  -- 'free', 'starter', 'professional', 'enterprise', 'trial'
  status          TEXT NOT NULL DEFAULT 'active',   -- 'active', 'suspended', 'cancelled', 'trial'
  seats           INTEGER,                          -- null = unlimited (e.g., free deallink)
  trial_ends_at   TIMESTAMPTZ,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_account_products_account ON public.account_products (account_id);
CREATE INDEX IF NOT EXISTS idx_account_products_product ON public.account_products (product_id);

-- ─── 3. ADD product_id TO roles AND role_permissions ───────────────────────
-- Nullable initially to allow the backfill to run. We set NOT NULL after
-- backfill succeeds.

ALTER TABLE public.roles
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE public.role_permissions
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_roles_product ON public.roles (product_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_product ON public.role_permissions (product_id);

-- ─── 4. RLS HELPER: has_product_access(product_code) ───────────────────────
-- Used by future product-aware RLS policies (Phase 2). Returns true if the
-- calling user's account has an active entitlement to the named product.

CREATE OR REPLACE FUNCTION public.has_product_access(product_code TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.account_products ap
    JOIN public.products p ON p.id = ap.product_id
    WHERE ap.account_id = public.current_account_id()
      AND p.code = product_code
      AND ap.status = 'active'
  );
$$;

-- ─── 5. RLS ON NEW TABLES ──────────────────────────────────────────────────
-- products: readable by any authenticated user (it's a catalog).
--           writable only by super admins.
-- account_products: tenant-isolated + super-admin-full-access, matching the
--           pattern already used on every other data table in prod.

ALTER TABLE public.products          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_products  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone reads products"             ON public.products;
DROP POLICY IF EXISTS "Super admin manages products"      ON public.products;
DROP POLICY IF EXISTS "Super admin full access on account_products" ON public.account_products;
DROP POLICY IF EXISTS "Tenant isolation on account_products"        ON public.account_products;

CREATE POLICY "Anyone reads products"
  ON public.products
  FOR SELECT
  TO authenticated
  USING (status = 'active');

CREATE POLICY "Super admin manages products"
  ON public.products
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Super admin full access on account_products"
  ON public.account_products
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Tenant isolation on account_products"
  ON public.account_products
  FOR ALL
  TO authenticated
  USING (account_id = public.current_account_id())
  WITH CHECK (account_id = public.current_account_id());

-- ─── 6. BACKFILL — EXISTING ACCOUNTS GET CHG ENTITLEMENT ───────────────────
-- Every account today is a CHG customer. Create the corresponding
-- account_products row with plan mirroring accounts.plan_tier.

INSERT INTO public.account_products (account_id, product_id, plan, status, seats, started_at)
SELECT
  a.id,
  (SELECT id FROM public.products WHERE code = 'chg'),
  COALESCE(a.plan_tier, 'starter'),
  COALESCE(a.status, 'active'),
  a.max_users,
  COALESCE(a.created_at, NOW())
FROM public.accounts a
ON CONFLICT (account_id, product_id) DO NOTHING;

-- ─── 7. BACKFILL — EXISTING ROLES POINT AT CHG PRODUCT ─────────────────────
-- Every role today is implicitly a CHG role. Set product_id accordingly.

UPDATE public.roles
SET product_id = (SELECT id FROM public.products WHERE code = 'chg')
WHERE product_id IS NULL;

UPDATE public.role_permissions
SET product_id = (SELECT id FROM public.products WHERE code = 'chg')
WHERE product_id IS NULL;

-- ─── 8. NOT NULL NOW THAT BACKFILL IS COMPLETE ─────────────────────────────
-- After the UPDATEs above, every row has product_id. Safe to require it.

ALTER TABLE public.roles            ALTER COLUMN product_id SET NOT NULL;
ALTER TABLE public.role_permissions ALTER COLUMN product_id SET NOT NULL;

-- ─── 9. UNIQUE-WITHIN-ACCOUNT-AND-PRODUCT FOR role_permissions ─────────────
-- Existing UNIQUE (role_id, department) stays valid because role_id already
-- ties to a single product. No change needed.

-- ─── 10. updated_at TRIGGERS FOR NEW TABLES ────────────────────────────────
-- set_updated_at() already exists (saas-migration.sql line 288).

DROP TRIGGER IF EXISTS set_products_updated_at         ON public.products;
DROP TRIGGER IF EXISTS set_account_products_updated_at ON public.account_products;

CREATE TRIGGER set_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_account_products_updated_at
  BEFORE UPDATE ON public.account_products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 11. DROP UNUSED TABLES (zero code refs, zero rows per verify 2026-04-23) ─
-- Confirmed safe to drop:
--   • subscription_tiers — zero code references in server/; blueprint §05
--     marked it deprecated in Phase 1.
--   • users              — ghost table from before Supabase Auth; stored
--                          passwords in plaintext; zero rows; zero code refs.
--   • maintenance_requests — zero rows; zero code refs.
--   • utility_logs         — zero rows; zero code refs.
--
-- If you later find you need these, PITR (≤7 days) restores them.

DROP TABLE IF EXISTS public.subscription_tiers;
DROP TABLE IF EXISTS public.users;
DROP TABLE IF EXISTS public.maintenance_requests;
DROP TABLE IF EXISTS public.utility_logs;

-- ─── 12. DONE ──────────────────────────────────────────────────────────────

COMMIT;

-- Verification: run phase-1-product-migration-verify.sql and confirm all
-- checks return expected counts. Full runbook in
-- docs/phase-1/migration-runbook.md.
