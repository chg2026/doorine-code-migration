-- ═══════════════════════════════════════════════════════════════════════════
-- Deal Link — Investment Memorandum config blob
-- ═══════════════════════════════════════════════════════════════════════════
-- Adds a single JSONB column on `deallink_deals` that holds the entire
-- "Memo builder" state for a deal: which saved analysis feeds the IM, which
-- sections appear, which value-level fields appear, and the privacy
-- toggles (street number visibility, etc.).
--
-- We use one JSONB column instead of new typed columns so the IM section
-- list can grow without a migration each time. The pre-existing
-- `im_show_*` columns (im_show_arv / im_show_asking / im_show_repair /
-- im_show_mao / im_show_contact / im_show_street_number) stay in place
-- for backwards compatibility with the current public IM read path; the
-- next sub-task ("Live preview" + public IM rebuild) will read directly
-- from `im_config`.
--
-- Idempotent; safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.deallink_deals
  ADD COLUMN IF NOT EXISTS im_config JSONB;

COMMIT;
