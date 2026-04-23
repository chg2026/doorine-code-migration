# Production Supabase schema snapshot — 2026-04-23

Captured from `kspwxeqtxmshdhmsnmng.supabase.co` (prod, Pro tier, PITR enabled).

This is the authoritative source of truth for what production looks like *today*, before Phase 1 migration runs. Any Phase 1 SQL is written against this shape.

## Query 1 — Column inventory (`information_schema.columns`)

Captured 42 tables in `public` schema. Full listing archived in `query-1-columns.md` below.

### Notable findings vs. dev SQL files

**Three "ghost" tables exist in prod but have zero references anywhere in the current monorepo code** (grepped `server/` and `apps/chg/`, no hits):

| Table | Columns | Risk |
|---|---|---|
| `users` | id, email, **password** (plaintext), name, role, created_at | 🚨 CRITICAL — plaintext passwords, no RLS |
| `maintenance_requests` | id, tenant_id, tier, description, status, created_at, resolved_at | No `account_id`, no RLS — cross-tenant leak |
| `utility_logs` | id, property_id, amount, month, year, status, created_at | No `account_id`, no RLS — cross-tenant leak |

**Row counts pending from Nicole.** If all zero, drop in Phase 1 cleanup. If `users` non-zero, rotate Supabase Auth passwords for affected accounts first.

**Column deltas vs. schema.sql (cosmetic, not blocking):**
- `tenants.current_late_fee` — in `schema.sql`, missing from prod
- `properties.monthly_rent` — in `schema.sql`, missing from prod
- `construction_phases` has both `material_budget` (singular) AND `materials_budget` (plural) — Phase 1 collapses to one

**All other tables match `saas-migration.sql` + `construction-migration.sql` + `fix-trigger.sql`.**

## Query 2 — RLS policies (`pg_policies`)

44 policies captured. **Structure matches dev SQL exactly** — same `is_super_admin()` / `current_account_id()` helper pattern on every business table.

### Issues confirmed

- `subscription_tiers` policy `"Anyone can read tiers"` uses `USING (true)` — any authenticated user reads pricing/features (audit §7 CRITICAL #3). Table is deprecated in Phase 1 anyway.
- `users`, `maintenance_requests`, `utility_logs` have **no RLS policies** (ghost tables).

## Query 3 — `handle_new_user()` function body

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
AS $function$
BEGIN
  IF NEW.raw_user_meta_data->>'account_id' IS NOT NULL THEN
    INSERT INTO user_profiles (id, email, full_name, account_id, role_id)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
      (NEW.raw_user_meta_data->>'account_id')::UUID,
      NULLIF(NEW.raw_user_meta_data->>'role_id', '')::UUID
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$
```

### Vulnerability confirmed — audit §7 CRITICAL #2

`account_id` and `role_id` are copied blindly from `raw_user_meta_data`.

**Attack path (confirmed live because Supabase public signup is enabled):**
1. Attacker POSTs to public `/auth/v1/signup` with their own email, password, and `options.data = { account_id: "<victim-uuid>", role_id: "<admin-role-in-that-account>" }`
2. Trigger fires, creates `user_profiles` row associating attacker's auth ID with victim's tenant and admin role
3. Attacker confirms email (arrives in their inbox)
4. Attacker logs in → full admin access to victim's tenant

**Mitigation:** Fix in `apps/chg/scripts/security-hotfix-handle-new-user.sql` (this PR).

**Immediate mitigation:** toggle "Allow new users to sign up" OFF in Supabase Auth settings until the trigger fix is deployed.

---

## Query 1 full output archived below (for reference)

*(The full 230-row output Nicole pasted on 2026-04-23 is preserved in git history. See commit message of this file's creation commit.)*
