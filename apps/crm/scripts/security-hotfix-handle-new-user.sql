-- ═══════════════════════════════════════════════════════════════════════════
-- Security hotfix: rewrite handle_new_user() to not trust signup metadata
-- ═══════════════════════════════════════════════════════════════════════════
-- Related: phase-0-audit.md §7 CRITICAL #2
-- Tracking: PR fix/security-hotfix-p0
-- Date: 2026-04-23
--
-- VULNERABILITY (in the old trigger):
--   The trigger read account_id and role_id straight from raw_user_meta_data
--   and inserted them into user_profiles. A public signup call (which is
--   exposed by Supabase's /auth/v1/signup endpoint when public signups are
--   enabled) could pass ANY account_id and role_id in metadata. The attacker
--   would end up as a member of any victim tenant with any role they chose.
--
-- FIX:
--   The trigger now ONLY creates a bare stub profile (id, email, status).
--   No account_id, no role_id, no privilege fields are written from metadata.
--
--   Legitimate signup flow is unchanged:
--     1. Client calls server /api/auth/signup
--     2. Server validates company name, creates new account + role + perms
--     3. Server calls supabaseAdmin.auth.admin.createUser (service role)
--     4. This trigger fires and creates the bare stub
--     5. Server's explicit upsert into user_profiles fills in account_id,
--        role_id, and is_account_admin=true
--
--   Attacker signup via public /auth/v1/signup:
--     1. Attacker POSTs with whatever metadata they want
--     2. Trigger creates bare stub with NO account_id, NO role_id
--     3. Attacker confirms email, logs in — but req.user.account_id is null
--     4. requireAuth middleware rejects them (401 "User profile not found
--        or missing account") before any business logic runs
--
-- DEPLOYMENT:
--   This file is idempotent (CREATE OR REPLACE). Safe to run on staging,
--   then prod. No data migration; only changes the trigger function body.
--   The trigger binding on auth.users itself is untouched.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- Create a bare profile stub only. Privilege fields (account_id, role_id,
  -- is_super_admin, is_account_admin) are NEVER trusted from signup metadata.
  -- The server-side signup API assigns them via service role after validation.
  INSERT INTO public.user_profiles (id, email, status)
  VALUES (NEW.id, NEW.email, 'active')
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- Verification: after running this, confirm the trigger body no longer
-- references raw_user_meta_data:
--
--   SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'handle_new_user';
--
-- Expected: the new body above, no references to account_id or role_id from
-- metadata.
