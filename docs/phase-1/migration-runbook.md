# Phase 1 Migration Runbook

**What this does:** Adds the product dimension to the CHG Supabase schema, so the same database can host CHG and Deal Link under one account system (blueprint §05 + §12).

**Blast radius:** Medium. Additive for live columns; drops four unused tables. Rollback scripted, PITR as safety net.

**Estimated downtime:** None required. Migration is additive and takes < 10 seconds. Recommended to run during a low-traffic window anyway for safety.

**Who runs it:** Nicole pastes SQL into Supabase SQL editor. Claude provides the SQL and monitors output.

---

## Prerequisites

All must be TRUE before starting:

- [ ] `fix/security-hotfix-p0` PR merged to main
- [ ] `security-hotfix-handle-new-user.sql` applied to prod (verified via `pg_get_functiondef`)
- [ ] "Allow new users to sign up" still OFF in Supabase Auth (confirmed 2026-04-23)
- [ ] `feat/phase-1-product-migration` PR reviewed and merged to main
- [ ] PITR enabled on prod (`kspwxeqtxmshdhmsnmng`) — already confirmed
- [ ] Staging project exists (`cmlfnhzjfhuynzuleyxt`) — already confirmed
- [ ] Nicole and Claude both available during the window

---

## Phase A — Rehearse on staging (no prod risk)

### Step A1 — Clone prod schema + data into staging

**In the Supabase dashboard** for prod (`kspwxeqtxmshdhmsnmng`):

1. Database → Backups → **Create a new backup** (labeled `pre-phase-1-rehearsal`)
2. Wait for the backup to complete (usually ~1 min)

**Nicole, ask Claude at this point** to guide you through the prod → staging clone. Options:
- **Option 1 (easiest):** use `pg_dump` / `pg_restore` via Supabase's database URL (Claude provides commands)
- **Option 2:** use Supabase's "Database Restore" if they support cross-project restore (they may not on all tiers)
- **Option 3 (acceptable fallback):** run the CHG `schema.sql`, `saas-migration.sql`, `construction-migration.sql`, `fix-trigger.sql` on staging in order to simulate pre-Phase-1 state. Then seed one or two fake accounts so we can see backfill work. Use this option if Options 1/2 are blocked.

### Step A2 — Apply the migration on staging

In **staging** (`cmlfnhzjfhuynzuleyxt`) SQL editor:

1. Paste full contents of [`apps/chg/scripts/security-hotfix-handle-new-user.sql`](../../apps/chg/scripts/security-hotfix-handle-new-user.sql) and run. Should return "Success. No rows returned." in <1s.
2. Paste full contents of [`apps/chg/scripts/phase-1-product-migration.sql`](../../apps/chg/scripts/phase-1-product-migration.sql) and run. Should return "Success. No rows returned." in <10s. Watch for any error — if you see one, STOP and paste the error to Claude.

### Step A3 — Verify on staging

Paste each query from [`apps/chg/scripts/phase-1-product-migration-verify.sql`](../../apps/chg/scripts/phase-1-product-migration-verify.sql) one at a time. Each is labeled with the PASS criteria. If any query returns unexpected results, STOP.

If all checks pass, staging rehearsal is a success.

### Step A4 — (Optional) test rollback on staging

To verify the rollback script works: paste [`apps/chg/scripts/phase-1-product-migration-rollback.sql`](../../apps/chg/scripts/phase-1-product-migration-rollback.sql) and run. Re-run the forward migration afterwards to restore the staging state.

---

## Phase B — Prod deploy

### Step B1 — Take a fresh backup snapshot

**In the Supabase dashboard for prod:**

1. Database → Backups → **Create a new backup** (label: `pre-phase-1-prod`)
2. Wait for completion
3. Note the backup timestamp — this is your PITR restore target if anything goes wrong

### Step B2 — Deploy the security hotfix trigger (if not already)

If the trigger fix hasn't been applied to prod yet:

1. **Prod** SQL editor
2. Paste [`security-hotfix-handle-new-user.sql`](../../apps/chg/scripts/security-hotfix-handle-new-user.sql)
3. Run. Expect <1s.
4. Verify with: `SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'handle_new_user';` — body should match the new version.

### Step B3 — Deploy the product migration

1. **Prod** SQL editor
2. Paste [`phase-1-product-migration.sql`](../../apps/chg/scripts/phase-1-product-migration.sql)
3. Run. Expect <10s.
4. If ANY error appears: **DO NOT re-run**. Paste the error to Claude. Claude will decide whether to retry, rollback, or PITR.

### Step B4 — Verify prod

Run each query from [`phase-1-product-migration-verify.sql`](../../apps/chg/scripts/phase-1-product-migration-verify.sql). Every check should PASS.

### Step B5 — Smoke test the live app

1. Open the OLD CHG Replit (`chg-crm.replit.app`) and log in as an existing user
2. Check: dashboard loads, properties list loads, construction list loads
3. Check: nothing is visibly broken

Phase 1 kept all old columns intact, so the running app should be completely unaffected. This smoke test is a sanity check that RLS didn't accidentally tighten.

### Step B6 — Re-enable new signups

Go to Supabase Auth → Sign In / Providers → toggle **"Allow new users to sign up" back ON**.

Why it's safe now: the `handle_new_user()` trigger is fixed (step B2) — new signups via the public endpoint create bare profiles with no account/role, which `requireAuth` rejects. The server's own `/api/auth/signup` path continues to work exactly as before.

---

## Rollback decision tree

**If something goes wrong after Step B3 (prod migration)**, the rollback path depends on what broke.

| Symptom | Root cause likely | Action |
|---|---|---|
| Migration SQL errored mid-run | DDL conflict, transient Supabase issue | Transaction rolled back automatically. State unchanged. Report error to Claude, retry after fix. |
| Migration succeeded but verify queries fail | Logic bug in migration or backfill | Run `phase-1-product-migration-rollback.sql`. Report which verify query failed to Claude. |
| Live CHG app breaks (5xx errors, data missing) | RLS policy regression or column drop | **STOP. Immediately PITR restore to `pre-phase-1-prod` backup.** Do NOT try to patch forward. |
| Customer reports data showing across accounts | Tenant isolation broke | **STOP. PITR immediately.** This is the handoff's HIGH risk scenario. |

**PITR restore path** (only if serious issue):
1. Supabase dashboard for prod → Database → Backups
2. Find `pre-phase-1-prod` backup from Step B1
3. Click "Restore" — this creates a parallel database; Supabase guides the cutover
4. Notify CHG customers of brief outage
5. Claude + Nicole regroup before retrying

---

## Post-migration cleanup (Phase 2 territory)

After Phase 1 is stable and Phase 2 middleware updates land, a later SQL pass will:
- Drop `accounts.plan_tier`, `accounts.allowed_departments`, `accounts.max_users`
- Collapse `construction_phases.material_budget` ↔ `materials_budget` to one column
- Add missing columns from schema.sql (`tenants.current_late_fee`, `properties.monthly_rent`) IF actually used in client code

These are explicitly OUT OF SCOPE for Phase 1 to keep blast radius minimal.
