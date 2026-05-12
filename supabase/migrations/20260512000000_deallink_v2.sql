-- ═══════════════════════════════════════════════════════════════════════════
-- Deal Link v2 — DealFlowPro UI rebuild
-- ═══════════════════════════════════════════════════════════════════════════
-- Adds the schema needed to back the new Deal Link v2 pages on top of the
-- existing v1 tables (deallink_profiles, deallink_deals, deallink_leads):
--
--   • Expanded deal status vocabulary: 'New' | 'Marketed' | 'Under Contract'
--     | 'Closed' | 'Dead' (was: 'active' | 'pending' | 'sold').
--   • New deal fields: description, photo_url, state, tags[].
--   • marketplace_opt_in flag on profiles — gates the cross-wholesaler
--     marketplace endpoint (/api/deallink/marketplace).
--   • New deallink_buyers table — first-class buyer entity (separate from
--     leads inbox), used by the Buyers page + Offers + GodMode etc.
--   • New deallink_offers table — buyer offers on deals.
--
-- All blocks are idempotent; safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. deallink_deals: expand status + new fields ────────────────────────

ALTER TABLE public.deallink_deals
  ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS photo_url   TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS state       TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tags        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Migrate legacy status values to the new vocabulary. Idempotent — already
-- migrated rows match no UPDATE here.
UPDATE public.deallink_deals SET status = 'Marketed'        WHERE status = 'active';
UPDATE public.deallink_deals SET status = 'Under Contract'  WHERE status = 'pending';
UPDATE public.deallink_deals SET status = 'Closed'          WHERE status = 'sold';

-- Default for new rows is now 'New' (matches Pipeline kanban first column).
ALTER TABLE public.deallink_deals
  ALTER COLUMN status SET DEFAULT 'New';

-- ─── 2. deallink_profiles: marketplace opt-in ─────────────────────────────

ALTER TABLE public.deallink_profiles
  ADD COLUMN IF NOT EXISTS marketplace_opt_in BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── 3. deallink_buyers ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.deallink_buyers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name          TEXT NOT NULL DEFAULT '',
  email         TEXT NOT NULL DEFAULT '',
  phone         TEXT NOT NULL DEFAULT '',
  buyer_type    TEXT NOT NULL DEFAULT 'Cash Buyer',  -- Cash Buyer|Wholesaler|Flipper|Landlord|Developer
  status        TEXT NOT NULL DEFAULT 'Active',      -- Active|Inactive
  markets       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  property_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  min_price     INTEGER NOT NULL DEFAULT 0,
  max_price     INTEGER NOT NULL DEFAULT 0,
  notes         TEXT NOT NULL DEFAULT '',
  source        TEXT NOT NULL DEFAULT 'manual',      -- manual|lead-import|godmode
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deallink_buyers_account
  ON public.deallink_buyers (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_deallink_buyers_email
  ON public.deallink_buyers (account_id, email);

-- ─── 4. deallink_offers ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.deallink_offers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  deal_id       UUID REFERENCES public.deallink_deals(id) ON DELETE SET NULL,
  buyer_id      UUID REFERENCES public.deallink_buyers(id) ON DELETE SET NULL,
  buyer_name    TEXT NOT NULL DEFAULT '',  -- denormalized for display when buyer_id is null
  amount        INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'Pending', -- Pending|Accepted|Rejected|Countered
  notes         TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deallink_offers_account
  ON public.deallink_offers (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_deallink_offers_deal
  ON public.deallink_offers (deal_id);

-- ─── 5. RLS on new tables ─────────────────────────────────────────────────

ALTER TABLE public.deallink_buyers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deallink_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation on deallink_buyers"        ON public.deallink_buyers;
DROP POLICY IF EXISTS "Super admin full access on deallink_buyers" ON public.deallink_buyers;
DROP POLICY IF EXISTS "Tenant isolation on deallink_offers"        ON public.deallink_offers;
DROP POLICY IF EXISTS "Super admin full access on deallink_offers" ON public.deallink_offers;

CREATE POLICY "Tenant isolation on deallink_buyers"
  ON public.deallink_buyers
  FOR ALL
  TO authenticated
  USING (account_id = public.current_account_id() AND public.has_product_access('deallink'))
  WITH CHECK (account_id = public.current_account_id() AND public.has_product_access('deallink'));

CREATE POLICY "Super admin full access on deallink_buyers"
  ON public.deallink_buyers
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Tenant isolation on deallink_offers"
  ON public.deallink_offers
  FOR ALL
  TO authenticated
  USING (account_id = public.current_account_id() AND public.has_product_access('deallink'))
  WITH CHECK (account_id = public.current_account_id() AND public.has_product_access('deallink'));

CREATE POLICY "Super admin full access on deallink_offers"
  ON public.deallink_offers
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ─── 6. updated_at TRIGGERS ───────────────────────────────────────────────

DROP TRIGGER IF EXISTS set_deallink_buyers_updated_at ON public.deallink_buyers;
DROP TRIGGER IF EXISTS set_deallink_offers_updated_at ON public.deallink_offers;

CREATE TRIGGER set_deallink_buyers_updated_at
  BEFORE UPDATE ON public.deallink_buyers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_deallink_offers_updated_at
  BEFORE UPDATE ON public.deallink_offers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;
