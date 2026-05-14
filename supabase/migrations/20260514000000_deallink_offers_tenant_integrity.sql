-- ═══════════════════════════════════════════════════════════════════════════
-- Deal Link — DB-level tenant integrity for deallink_offers
-- ═══════════════════════════════════════════════════════════════════════════
-- The base v2 migration created `deallink_offers` with simple FKs to
-- `deallink_deals(id)` and `deallink_buyers(id)`. RLS enforces that the
-- offer's own `account_id` matches the caller, and the Express route
-- validates that the referenced deal/buyer share the account — but
-- authenticated direct Supabase access can bypass the route check.
--
-- This migration enforces the cross-row tenant invariant at the DB layer
-- using composite foreign keys:
--   offers (deal_id, account_id)  → deallink_deals  (id, account_id)
--   offers (buyer_id, account_id) → deallink_buyers (id, account_id)
--
-- Both pre-require composite UNIQUE constraints on the parent tables.
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Parent composite UNIQUEs (required for composite FKs) ─────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'deallink_deals_id_account_uniq'
      AND conrelid = 'public.deallink_deals'::regclass
  ) THEN
    ALTER TABLE public.deallink_deals
      ADD CONSTRAINT deallink_deals_id_account_uniq UNIQUE (id, account_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'deallink_buyers_id_account_uniq'
      AND conrelid = 'public.deallink_buyers'::regclass
  ) THEN
    ALTER TABLE public.deallink_buyers
      ADD CONSTRAINT deallink_buyers_id_account_uniq UNIQUE (id, account_id);
  END IF;
END $$;

-- ─── 2. Drop the old single-column FKs on deallink_offers ─────────────────
-- Postgres auto-names FKs as <table>_<col>_fkey; drop those if present.

ALTER TABLE public.deallink_offers
  DROP CONSTRAINT IF EXISTS deallink_offers_deal_id_fkey;
ALTER TABLE public.deallink_offers
  DROP CONSTRAINT IF EXISTS deallink_offers_buyer_id_fkey;

-- ─── 3. Add composite FKs that pin (deal/buyer, account) together ────────
-- Use ON DELETE SET NULL to match prior behaviour. NOTE: a composite FK
-- with SET NULL would null BOTH columns — but account_id is NOT NULL on
-- offers, so we cannot use SET NULL on the composite. Use NO ACTION and
-- rely on the existing ON DELETE CASCADE from offers.account_id →
-- accounts.id (when an account is deleted the offer rows go with it),
-- and on app-level cleanup for individual deal/buyer deletes.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'deallink_offers_deal_account_fkey'
      AND conrelid = 'public.deallink_offers'::regclass
  ) THEN
    ALTER TABLE public.deallink_offers
      ADD CONSTRAINT deallink_offers_deal_account_fkey
      FOREIGN KEY (deal_id, account_id)
      REFERENCES public.deallink_deals (id, account_id)
      ON DELETE CASCADE
      DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'deallink_offers_buyer_account_fkey'
      AND conrelid = 'public.deallink_offers'::regclass
  ) THEN
    ALTER TABLE public.deallink_offers
      ADD CONSTRAINT deallink_offers_buyer_account_fkey
      FOREIGN KEY (buyer_id, account_id)
      REFERENCES public.deallink_buyers (id, account_id)
      ON DELETE CASCADE
      DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END $$;

COMMIT;
