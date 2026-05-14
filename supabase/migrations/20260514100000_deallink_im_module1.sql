-- ═══════════════════════════════════════════════════════════════════════════
-- Deal Link — Investment Memorandum (IM) Module 1
-- ═══════════════════════════════════════════════════════════════════════════
-- Module 1 of the IM viral-sharing feature: wholesaler-side IM creation.
-- Adds the columns the wholesaler needs to (a) generate a public slug for
-- a deal and (b) control which fields show on the buyer-facing IM page.
--
-- Per the handoff PDF (DealLink_IM_Replit_Handoff_1778801686472.pdf §3.4):
--   im_slug                 — URL-safe slug, NULL until first share click
--   im_show_arv             — visibility toggle (default true)
--   im_show_asking          — visibility toggle (default true)
--   im_show_repair          — visibility toggle (default true)
--   im_show_mao             — visibility toggle (default FALSE — sensitive)
--   im_show_contact         — visibility toggle (default true)
--   im_show_street_number   — visibility toggle (default true) — referenced
--                             in §5.1 hero spec; keep it explicit so it
--                             can be wired the same way as the rest
--
-- This is the ONLY change to the existing deallink_deals table for IM v1.
-- Buyer accounts, SMS codes, and shared-deals log are separate modules.
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.deallink_deals
  ADD COLUMN IF NOT EXISTS im_slug              TEXT,
  ADD COLUMN IF NOT EXISTS im_show_arv          BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS im_show_asking       BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS im_show_repair       BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS im_show_mao          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS im_show_contact      BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS im_show_street_number BOOLEAN NOT NULL DEFAULT TRUE;

-- Slug must be globally unique across all wholesalers (the public URL
-- /deal/<slug> has no namespace). Partial unique so NULLs don't collide.
CREATE UNIQUE INDEX IF NOT EXISTS deallink_deals_im_slug_uniq
  ON public.deallink_deals (im_slug)
  WHERE im_slug IS NOT NULL;

COMMIT;
