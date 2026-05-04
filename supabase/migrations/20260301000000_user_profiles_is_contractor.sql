-- Migration: user_profiles.is_contractor
--
-- Adds a parallel role flag `is_contractor` to public.user_profiles for the
-- new apps/contractor-portal Next.js app (Task 23). Mirrors the
-- `is_investor` flag from 20260101000000_user_profiles_is_investor.sql.
--
-- Idempotent: safe to run multiple times.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS is_contractor boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_profiles.is_contractor IS
  'Task 23: routes the user to apps/contractor-portal. Layer-2/Layer-3 contractor accounts are separate from chg-rehab (operator) and investor-portal users.';
