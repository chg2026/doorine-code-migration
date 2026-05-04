-- Phase 6: Investor Portal — user_profiles role flag
--
-- Adds a parallel role flag `is_investor` to user_profiles, alongside the
-- existing `is_super_admin` and `is_account_admin` flags. Investors are
-- routed to the dedicated `apps/investor-portal` Next.js app (port 3002)
-- and are rejected from the CHG Rehab admin app by middleware.
--
-- Idempotent: safe to run multiple times.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS is_investor boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_profiles.is_investor IS
  'Phase 6: routes the user to apps/investor-portal and blocks access to CHG Rehab.';
