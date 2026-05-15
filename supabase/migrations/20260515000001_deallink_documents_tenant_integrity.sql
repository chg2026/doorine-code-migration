-- ═══════════════════════════════════════════════════════════════════════════
-- Deal Link — DB-level tenant integrity for deallink_documents
-- ═══════════════════════════════════════════════════════════════════════════
-- Mirrors the pattern from 20260514000000_deallink_offers_tenant_integrity:
-- the base 20260515000000 migration created `deallink_documents` with a
-- simple FK to `deallink_deals(id)`. RLS enforces that the document's own
-- `account_id` matches the caller, and the Express route verifies that the
-- referenced deal shares the account — but authenticated direct Supabase
-- access could bypass that route check.
--
-- This migration replaces the single-column FK with a composite one:
--   documents (deal_id, account_id) → deallink_deals (id, account_id)
--
-- The parent composite UNIQUE on `deallink_deals (id, account_id)` was
-- already added by the offers integrity migration (see file referenced
-- above); we re-check defensively here.
--
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Parent composite UNIQUE (already added by offers migration; safety net) ──

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

-- ─── 2. Drop the single-column deal_id FK on deallink_documents ──────────

ALTER TABLE public.deallink_documents
  DROP CONSTRAINT IF EXISTS deallink_documents_deal_id_fkey;

-- ─── 3. Add composite FK with ON DELETE CASCADE ──────────────────────────
-- Documents are owned by a single deal — when the parent deal is deleted,
-- the metadata rows go with it (the original migration intent). The
-- Express delete handler removes the underlying storage objects first
-- so the bucket isn't orphaned (see server/routes/deallink.js).

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'deallink_documents_deal_account_fkey'
      AND conrelid = 'public.deallink_documents'::regclass
  ) THEN
    ALTER TABLE public.deallink_documents
      ADD CONSTRAINT deallink_documents_deal_account_fkey
      FOREIGN KEY (deal_id, account_id)
      REFERENCES public.deallink_deals (id, account_id)
      ON DELETE CASCADE
      DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END $$;

COMMIT;
