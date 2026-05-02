-- Migration: phone_auth_support
-- Run on: gold-bridge-dev ONLY (never on gold-bridge-staging / production)
-- Purpose: extend signup_attempts for OTP rate limiting + update user_profiles
--          for phone-only users and progressive profile completion.

-- 1. Extend signup_attempts for phone-based OTP rate limiting
ALTER TABLE public.signup_attempts
  ADD COLUMN IF NOT EXISTS attempt_type TEXT NOT NULL DEFAULT 'signup',
  ADD COLUMN IF NOT EXISTS phone TEXT;

-- Index for fast phone-based OTP lookups
CREATE INDEX IF NOT EXISTS idx_signup_attempts_phone
  ON public.signup_attempts(phone, attempted_at)
  WHERE attempt_type = 'otp_send';

-- 2. Allow phone-only users (no email yet)
ALTER TABLE public.user_profiles
  ALTER COLUMN email DROP NOT NULL;

-- 3. Progressive profile completion counters
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS unverified_feature_uses INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profile_score INTEGER NOT NULL DEFAULT 0;
