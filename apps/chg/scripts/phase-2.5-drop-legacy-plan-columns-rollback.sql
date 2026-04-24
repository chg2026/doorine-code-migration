-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 2.5 — Rollback: restore legacy plan columns on accounts
-- ═══════════════════════════════════════════════════════════════════════════
-- Use only if the Phase 2.5 code PR needs to be reverted and the schema
-- must go back. Restores the columns with their original types + defaults
-- (matching saas-migration.sql), then backfills plan_tier from each
-- account's active CHG entitlement so existing code paths see sensible
-- values instead of NULL.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS plan_tier TEXT DEFAULT 'starter';

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS allowed_departments TEXT[] DEFAULT ARRAY[
    'acquisitions','construction','property_management','contractors','finance','tasks'
  ];

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS max_users INTEGER DEFAULT 5;

-- Backfill plan_tier from the current CHG entitlement.
UPDATE public.accounts a
SET plan_tier = COALESCE(ap.plan, 'starter')
FROM public.account_products ap
JOIN public.products p ON p.id = ap.product_id
WHERE ap.account_id = a.id
  AND p.code = 'chg'
  AND ap.status = 'active';

COMMIT;
