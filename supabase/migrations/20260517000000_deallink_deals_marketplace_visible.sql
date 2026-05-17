-- ═══════════════════════════════════════════════════════════════════════════
-- Deal Link — per-deal marketplace visibility
-- ═══════════════════════════════════════════════════════════════════════════
-- The DealEditor exposes a "Show on marketplace" toggle that maps to
-- `marketplace_visible` on a deal. This column was missing from the
-- schema, so the toggle had no effect. This migration adds it and
-- backfills existing rows to TRUE (the UI default).
--
-- Account-level opt-in (`deallink_profiles.marketplace_opt_in`) still
-- controls whether the wholesaler participates in the cross-feed at all;
-- this per-deal flag is an additional filter applied on top.
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.deallink_deals
  ADD COLUMN IF NOT EXISTS marketplace_visible BOOLEAN NOT NULL DEFAULT TRUE;

COMMIT;
