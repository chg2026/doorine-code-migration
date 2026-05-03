-- ════════════════════════════════════════════════════════════════════════════
-- PHASE 5 DEAL LINK — ALL-IN-ONE BUNDLE
-- ────────────────────────────────────────────────────────────────────────────
-- Paste the ENTIRE contents of this file into the Supabase SQL Editor and
-- click Run. It is safe to re-run (every statement is CREATE OR REPLACE /
-- IF NOT EXISTS / idempotent).
--
-- WHAT THIS DOES (in order):
--   1. Creates 3 RLS helper functions the rest of the app already assumes
--      exist:  current_account_id(), is_super_admin(), has_product_access()
--   2. Creates the 3 Deal Link tables: deallink_profiles, deallink_deals,
--      deallink_leads — with tenant-isolated RLS + super-admin full-access
--      policies, and an updated_at trigger.
--
-- PRE-REQUISITE TABLES (must already exist in your Supabase — they do):
--   user_profiles, accounts, account_products, products
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. HELPER: current_account_id() ───────────────────────────────────────
-- Returns the account_id of the currently-logged-in user. Used by every
-- tenant-isolated RLS policy.
CREATE OR REPLACE FUNCTION public.current_account_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT account_id FROM public.user_profiles WHERE id = auth.uid();
$$;

-- ─── 2. HELPER: is_super_admin() ───────────────────────────────────────────
-- Returns true iff the calling user has the platform-wide super-admin flag.
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_super_admin FROM public.user_profiles WHERE id = auth.uid()),
    false
  );
$$;

-- ─── 3. HELPER: set_updated_at() ───────────────────────────────────────────
-- Trigger function that bumps the updated_at column on every UPDATE.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ─── 4. HELPER: has_product_access(product_code) ───────────────────────────
-- Returns true iff the caller's account has an active entitlement to the
-- named product (e.g. 'deallink', 'chg', 'chg-rehab').
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

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. DEAL LINK TABLES + RLS  (verbatim from phase-5-deallink-tables.sql)
-- ════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 5 — Deal Link tables (forward)
-- ═══════════════════════════════════════════════════════════════════════════
-- Adds the three Deal Link domain tables behind the product entitlement
-- introduced in phase-1-product-migration.sql:
--
--   • deallink_profiles — one public-profile row per account (handle, bio,
--                         featured deal). UNIQUE(handle) so /p/:handle is
--                         globally addressable.
--   • deallink_deals    — wholesaler inventory.
--   • deallink_leads    — buyer interest captured from the public profile.
--
-- Tracking: blueprint §05 + Phase 5 in phase-0-audit.md.
-- Runbook: docs/phase-1/phase-5-deallink-runbook.md
--
-- DESIGN PRINCIPLES
--   • Tenant isolation via account_id + RLS, mirrors the pattern used by
--     every existing CHG table (saas-migration.sql).
--   • Public read path (anon role) on profiles + non-sold deals only, so
--     the unauthenticated /p/:handle page can render. Server-side route
--     additionally enforces hide_street masking before returning.
--   • Idempotent. CREATE TABLE IF NOT EXISTS, DROP POLICY IF EXISTS, etc.
--   • Wrapped in BEGIN/COMMIT so a failure reverts everything.
--
-- PRE-DEPLOY CHECKLIST
--   ☐ phase-1-product-migration.sql already applied (products, account_products,
--     has_product_access(), current_account_id(), is_super_admin() exist)
--   ☐ Staging rehearsal complete; verify-script returns expected counts
--   ☐ Account that will host Deal Link has an active row in account_products
--     for the 'deallink' product (insert one via the super-admin Entitlements
--     panel before flipping the AppSwitcher tile)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. deallink_profiles ─────────────────────────────────────────────────
-- One row per account. The handle is globally unique because public URLs
-- look like /p/<handle>.

CREATE TABLE IF NOT EXISTS public.deallink_profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  handle        TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  initials      TEXT NOT NULL DEFAULT '',
  bio           TEXT NOT NULL DEFAULT '',
  city          TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL DEFAULT '',
  featured_id   UUID,                                        -- FK added below
  onboarding    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (account_id),
  UNIQUE (handle)
);

CREATE INDEX IF NOT EXISTS idx_deallink_profiles_handle ON public.deallink_profiles (handle);

-- ─── 2. deallink_deals ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.deallink_deals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  addr          TEXT NOT NULL DEFAULT '',
  city          TEXT NOT NULL DEFAULT '',
  zip           TEXT NOT NULL DEFAULT '',
  type          TEXT NOT NULL DEFAULT 'SFR',
  units         INTEGER NOT NULL DEFAULT 1,
  beds          INTEGER NOT NULL DEFAULT 0,
  baths         NUMERIC(4,1) NOT NULL DEFAULT 0,
  sqft          INTEGER NOT NULL DEFAULT 0,
  ask           INTEGER NOT NULL DEFAULT 0,                  -- in $k
  arv           INTEGER NOT NULL DEFAULT 0,                  -- in $k
  occ           TEXT NOT NULL DEFAULT 'Vacant',
  access        TEXT NOT NULL DEFAULT 'Lockbox',
  status        TEXT NOT NULL DEFAULT 'active',              -- active | pending | sold
  notes         TEXT NOT NULL DEFAULT '',
  hide_street   BOOLEAN NOT NULL DEFAULT FALSE,
  is_new        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deallink_deals_account ON public.deallink_deals (account_id);
CREATE INDEX IF NOT EXISTS idx_deallink_deals_status  ON public.deallink_deals (account_id, status);

-- featured_id FK — added now that deallink_deals exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deallink_profiles_featured_fk'
  ) THEN
    ALTER TABLE public.deallink_profiles
      ADD CONSTRAINT deallink_profiles_featured_fk
      FOREIGN KEY (featured_id) REFERENCES public.deallink_deals(id) ON DELETE SET NULL;
  END IF;
END$$;

-- ─── 3. deallink_leads ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.deallink_leads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  deal_id       UUID REFERENCES public.deallink_deals(id) ON DELETE SET NULL,
  kind          TEXT NOT NULL DEFAULT 'deal-interest',       -- deal-interest | buyer-list
  first_name    TEXT NOT NULL DEFAULT '',
  last_name     TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  buyer_type    TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deallink_leads_account ON public.deallink_leads (account_id, created_at DESC);

-- ─── 4. RLS ───────────────────────────────────────────────────────────────
-- Mirrors phase-1's pattern: tenant isolation for authenticated users +
-- super-admin-bypass + a permissive read for the anon role on the public
-- read surface (profiles + non-sold deals).

ALTER TABLE public.deallink_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deallink_deals    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deallink_leads    ENABLE ROW LEVEL SECURITY;

-- IMPORTANT: NO anon SELECT/INSERT policies on these tables. The public
-- read surface (/api/deallink/public/*) goes through the Express server
-- using the service-role client, which lets the server enforce:
--   • status='active' filtering (we never expose pending/sold inventory)
--   • hide_street masking on addr
--   • field whitelisting on the response (no email/account_id/onboarding)
--   • IDOR validation on lead POST (deal_id must belong to the profile's account)
--
-- Exposing these tables directly to the anon role would bypass all of the
-- above (anyone with the public anon key could query the raw rows from the
-- browser). Keep this surface server-mediated.

-- profiles ------------------------------------------------------------------
DROP POLICY IF EXISTS "Tenant isolation on deallink_profiles"        ON public.deallink_profiles;
DROP POLICY IF EXISTS "Super admin full access on deallink_profiles" ON public.deallink_profiles;
DROP POLICY IF EXISTS "Anon reads deallink_profiles"                 ON public.deallink_profiles;

-- Tenant isolation policies REQUIRE has_product_access('deallink') in
-- addition to account match. Without this, an authenticated CRM-only
-- user (no Deal Link entitlement) could ship the public anon key from
-- their browser, sign in via Supabase, and CRUD their account's Deal
-- Link rows directly — bypassing the Express requireProduct gate. The
-- entitlement check makes Supabase + Express agree on who can touch
-- these tables.

CREATE POLICY "Tenant isolation on deallink_profiles"
  ON public.deallink_profiles
  FOR ALL
  TO authenticated
  USING (account_id = public.current_account_id() AND public.has_product_access('deallink'))
  WITH CHECK (account_id = public.current_account_id() AND public.has_product_access('deallink'));

CREATE POLICY "Super admin full access on deallink_profiles"
  ON public.deallink_profiles
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- deals ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Tenant isolation on deallink_deals"        ON public.deallink_deals;
DROP POLICY IF EXISTS "Super admin full access on deallink_deals" ON public.deallink_deals;
DROP POLICY IF EXISTS "Anon reads non-sold deallink_deals"        ON public.deallink_deals;
DROP POLICY IF EXISTS "Anon reads active deallink_deals"          ON public.deallink_deals;

CREATE POLICY "Tenant isolation on deallink_deals"
  ON public.deallink_deals
  FOR ALL
  TO authenticated
  USING (account_id = public.current_account_id() AND public.has_product_access('deallink'))
  WITH CHECK (account_id = public.current_account_id() AND public.has_product_access('deallink'));

CREATE POLICY "Super admin full access on deallink_deals"
  ON public.deallink_deals
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- leads ---------------------------------------------------------------------
-- Leads are inserted by the public POST route (server, service-role) after
-- it has validated the handle and any deal_id. RLS does NOT expose insert
-- to the anon role — going through the server lets us enforce IDOR and
-- field validation that RLS alone can't.

DROP POLICY IF EXISTS "Tenant isolation on deallink_leads"        ON public.deallink_leads;
DROP POLICY IF EXISTS "Super admin full access on deallink_leads" ON public.deallink_leads;
DROP POLICY IF EXISTS "Anon inserts deallink_leads"               ON public.deallink_leads;

CREATE POLICY "Tenant isolation on deallink_leads"
  ON public.deallink_leads
  FOR ALL
  TO authenticated
  USING (account_id = public.current_account_id() AND public.has_product_access('deallink'))
  WITH CHECK (account_id = public.current_account_id() AND public.has_product_access('deallink'));

CREATE POLICY "Super admin full access on deallink_leads"
  ON public.deallink_leads
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ─── 5. updated_at TRIGGERS ───────────────────────────────────────────────

DROP TRIGGER IF EXISTS set_deallink_profiles_updated_at ON public.deallink_profiles;
DROP TRIGGER IF EXISTS set_deallink_deals_updated_at    ON public.deallink_deals;

CREATE TRIGGER set_deallink_profiles_updated_at
  BEFORE UPDATE ON public.deallink_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_deallink_deals_updated_at
  BEFORE UPDATE ON public.deallink_deals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;

-- Verification (run in SQL editor after migration):
--
--   SELECT table_name FROM information_schema.tables
--    WHERE table_schema='public' AND table_name LIKE 'deallink_%';
--   -- expect: deallink_profiles, deallink_deals, deallink_leads
--
--   SELECT polname, polrelid::regclass FROM pg_policy
--    WHERE polrelid::regclass::text LIKE 'public.deallink_%';
--   -- expect: 3 policies on each table
