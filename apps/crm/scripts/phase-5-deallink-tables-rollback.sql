-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 5 — Deal Link tables (rollback)
-- ═══════════════════════════════════════════════════════════════════════════
-- Drops the three Deal Link tables and their policies/triggers. Safe to
-- re-run. Does NOT touch account_products entitlements — disable Deal Link
-- access via the super-admin Entitlements panel first if you want to
-- prevent the front-end from attempting calls during the window.

BEGIN;

DROP TRIGGER IF EXISTS set_deallink_profiles_updated_at ON public.deallink_profiles;
DROP TRIGGER IF EXISTS set_deallink_deals_updated_at    ON public.deallink_deals;

DROP TABLE IF EXISTS public.deallink_leads    CASCADE;
DROP TABLE IF EXISTS public.deallink_deals    CASCADE;
DROP TABLE IF EXISTS public.deallink_profiles CASCADE;

COMMIT;
