-- ═══════════════════════════════════════════════════════════════════════════
-- Deal Link — documents on deals
-- ═══════════════════════════════════════════════════════════════════════════
-- Adds the storage backing + metadata table for the new Documents tab on the
-- property editor. Wholesalers can attach contracts, inspections, photos,
-- title docs, etc. to each deal.
--
-- Architecture:
--   • Private Supabase Storage bucket `deallink-documents`. All access goes
--     through the Express server via signed upload + signed download URLs
--     issued with the service role key — clients never read/write storage
--     objects directly. Storage RLS therefore stays closed to authenticated
--     users; the service-role client bypasses RLS for the actual transfer.
--   • New `public.deallink_documents` table. Row-level security mirrors
--     `deallink_deals` / `deallink_buyers` / `deallink_offers`: tenant
--     isolation by `account_id` plus the `deallink` product entitlement, plus
--     the standard super-admin escape hatch.
--   • Storage path convention: `<account_id>/<deal_id>/<uuid>-<filename>`.
--     The leading account_id segment is a defense-in-depth check; the
--     authoritative tenant boundary is the `account_id` column on the row.
--
-- Idempotent; safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. Storage bucket ────────────────────────────────────────────────────
-- Insert the bucket row directly. supabase-js's createBucket helper requires
-- service-role; doing it in SQL is portable across both Option A (pooler) and
-- Option B (dashboard) of the migrations runbook.

INSERT INTO storage.buckets (id, name, public)
VALUES ('deallink-documents', 'deallink-documents', false)
ON CONFLICT (id) DO NOTHING;

-- No `storage.objects` policies for authenticated users — the Express server
-- mediates every read/write with the service role, so RLS stays closed by
-- default. (storage.objects already has RLS enabled by Supabase.)

-- ─── 2. deallink_documents table ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.deallink_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES public.accounts(id)         ON DELETE CASCADE,
  deal_id         UUID NOT NULL REFERENCES public.deallink_deals(id)   ON DELETE CASCADE,
  name            TEXT NOT NULL,
  category        TEXT NOT NULL DEFAULT 'Other',
  storage_path    TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  mime_type       TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Constrain category to the documented vocabulary. Keep as a CHECK rather
-- than a Postgres ENUM so future categories can be added with an
-- ALTER … DROP CONSTRAINT / ADD CONSTRAINT in a follow-up migration.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deallink_documents_category_check'
  ) THEN
    ALTER TABLE public.deallink_documents
      ADD CONSTRAINT deallink_documents_category_check
      CHECK (category IN ('Contract', 'Inspection', 'Photos', 'Title', 'Other'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_deallink_documents_deal
  ON public.deallink_documents (deal_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_deallink_documents_account
  ON public.deallink_documents (account_id, created_at DESC);

-- ─── 3. RLS ───────────────────────────────────────────────────────────────

ALTER TABLE public.deallink_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation on deallink_documents"        ON public.deallink_documents;
DROP POLICY IF EXISTS "Super admin full access on deallink_documents" ON public.deallink_documents;

CREATE POLICY "Tenant isolation on deallink_documents"
  ON public.deallink_documents
  FOR ALL
  TO authenticated
  USING (account_id = public.current_account_id() AND public.has_product_access('deallink'))
  WITH CHECK (account_id = public.current_account_id() AND public.has_product_access('deallink'));

CREATE POLICY "Super admin full access on deallink_documents"
  ON public.deallink_documents
  FOR ALL
  TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

COMMIT;
