-- Migration: user_profiles.is_investor
--
-- Adds a parallel role flag `is_investor` to public.user_profiles, alongside
-- the existing `is_super_admin` and `is_account_admin` flags. Investors are
-- routed to the dedicated `apps/investor-portal` Next.js app and are
-- rejected from the CHG Rehab admin app by middleware.
--
-- This file is the canonical source for the Phase 6 schema change. It
-- supersedes archive/apps-crm/scripts/phase-6-investor-portal.sql, which is kept
-- only for historical reference.
--
-- Idempotent: safe to run multiple times.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS is_investor boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_profiles.is_investor IS
  'Phase 6: routes the user to apps/investor-portal and blocks access to CHG Rehab.';
