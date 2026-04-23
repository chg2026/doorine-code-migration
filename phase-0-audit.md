# Phase 0 Audit — CHG CRM Codebase

**Date:** 2026-04-23
**Scope:** `apps/chg/` at commit `058f7de` on `main`
**Auditor:** Claude Code (engineering role for Gold Bridge)
**Method:** Parallel analysis of schema SQL, server middleware, route handlers, React auth components, rate-limit code, test files, and a security sweep for hardcoded secrets, dangerous patterns, and dependency CVEs.

---

## Executive summary (plain English)

**The good news.** CHG has a surprisingly well-designed multi-tenant foundation. Every data table is wired to `account_id`, RLS policies are on almost every table, the role system has real department-level permissions, and there's a proper `is_super_admin()` + `current_account_id()` RLS helper pattern that matches how Supabase recommends doing things.

**The bad news.** There are **three critical security issues** that need fixing before CHG goes into Phase 1 migrations, **two high-severity issues** around rate limiting and cascade deletes that will bite us under real load, and **effectively zero automated tests**. No CI either. Every deploy today is hand-tested.

**The medium news.** Deal Link does not exist as code yet beyond wireframes and the CRUD starter in `apps/deallink/`. The audit scope here is CHG only — Deal Link gets audited when Phase 5 begins.

The ten highest-priority action items are listed at the end of this document.

---

## 1. Database schema inventory

### 1.1 Tables (grouped by domain)

**Identity & tenancy**
| Table | Purpose | Scoped to account |
|---|---|---|
| `accounts` | Customer org (multi-tenant root) | (is the tenant) |
| `user_profiles` | Identity tied to `auth.users`, stores `is_super_admin` / `is_account_admin` flags, links to `role_id` | ✓ |
| `roles` | Named roles per account | ✓ |
| `role_permissions` | Department-scoped permission matrix (acquisitions, construction, property_management, contractors, finance, tasks) with `edit` / `view` / `none` levels | via `role_id → roles.account_id` |
| `subscription_tiers` | 3 seeded SKUs (starter, professional, enterprise); ⚠ deprecated in Phase 1 (blueprint §05 schema diff) | — |

**Property management**
| Table | Purpose |
|---|---|
| `properties` | Real estate assets |
| `units` | Units per property (auto-backfilled to ≥1) |
| `tenants` | Occupants, rent, late fees |

**Construction**
| Table | Purpose |
|---|---|
| `construction_projects` | Project charter; dual-budget (labor/materials), spend tracking |
| `construction_phases` | Phase breakdown; approval workflows |
| `master_phases` | Customizable phase library per tenant; 19 standard phases seeded on account creation |
| `addendums` | Change requests (scope/budget/delivery), approval workflow |
| `contractors` | Vendor registry; W9 status, insurance tracking, performance score |

**Finance / activity**
| Table | Purpose |
|---|---|
| `invoices` | Expense tracking; links to project + phase |
| `recurring_tasks` | Reminders, standing obligations |
| `deals` | Pre-acquisition pipeline (disconnected from projects — orphan risk noted) |
| `activity_log` | Generic audit trail (account-scoped SELECT, no INSERT policy — see §7) |
| `project_activity` | Per-project append-only audit log; UPDATE/DELETE blocked by trigger |
| `project_notes` | Rich-text feed inside projects (5 types, visibility-scoped) |

### 1.2 RLS helper functions

Both `SECURITY DEFINER`:
- [`is_super_admin()`](apps/chg/scripts/saas-migration.sql:140) — returns true if `user_profiles.is_super_admin` for `auth.uid()`
- [`current_account_id()`](apps/chg/scripts/saas-migration.sql:149) — returns the caller's `account_id`

Every RLS policy on every data table uses one or both. The pattern is clean.

### 1.3 Triggers

- `handle_new_user()` (`SECURITY DEFINER`, on `auth.users` INSERT) — creates `user_profiles` row from `raw_user_meta_data`. **See §7 critical #3.**
- `handle_new_account_master_phases()` (`SECURITY DEFINER`, on `accounts` INSERT) — seeds 19 standard construction phases for the new tenant. Clean.
- `block_project_activity_mutation()` — raises exception on UPDATE/DELETE of `project_activity`. Enforces append-only.
- `set_updated_at()` — standard timestamp trigger on 7 tables.

### 1.4 `fix-trigger.sql` — what was broken

The file replaces `handle_new_user()` with a version that adds NULL-safety: `COALESCE(NEW.raw_user_meta_data->>'full_name', '')` and `NULLIF(NEW.raw_user_meta_data->>'role_id', '')::UUID`. The original crashed on signup when metadata keys were missing or empty strings. **Needs confirmation this was applied to production** — see §2.

---

## 2. Dev schema vs. production — REQUIRES INPUT FROM NICOLE

**We cannot compare dev schema against production without access to the live Supabase.** This is deliberate — the audit does not request or use service role credentials.

**What Nicole should paste here to close this section:**

Run this in the Supabase SQL editor (production project) and paste the output back into this file under section 2.1:

```sql
-- Capture the production schema delta
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;
```

Also run:

```sql
-- List every RLS policy actually enforced in production
SELECT
  schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Confirm fix-trigger.sql was applied
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'handle_new_user';
```

Once results are pasted, I will diff against `schema.sql` + `saas-migration.sql` + `construction-migration.sql` + `fix-trigger.sql` and report the exact delta. **This is the single biggest unknown blocking Phase 1.**

### 2.1 Production schema snapshot
*(awaiting Nicole's paste)*

---

## 3. Auth layer

### 3.1 Server-side middleware

**[`requireAuth`](apps/chg/server/middleware/auth.js:17)** — validates Bearer token via `supabaseAdmin.auth.getUser(token)`, loads the `user_profiles` row with role + account, checks suspension status, builds a `permissions` object keyed by department from `role_permissions`. Attaches `req.user = { id, email, profile, account_id, is_super_admin, is_account_admin, permissions }`.

| Failure | Response |
|---|---|
| Missing/malformed Authorization header | 401 |
| Supabase env not configured | 503 |
| Invalid/expired token | 401 |
| No `user_profiles` row | 401 |
| User or account suspended | 403 |

**[`requireSuperAdmin`](apps/chg/server/middleware/auth.js:70)** — fails 403 unless `req.user.is_super_admin === true`.

**[`requireAccountAdmin`](apps/chg/server/middleware/auth.js:77)** — fails 403 unless super admin OR account admin.

**[`requireDepartment(dept, level='view')`](apps/chg/server/middleware/permissions.js:1)** — super admin bypass; reads `req.user.permissions[dept]`; if `level='edit'`, requires `edit` (rejects `view`). Returns 403 with department-specific error message.

**[`requireEditPermission(dept)`](apps/chg/server/middleware/permissions.js:16)** — same pattern, edit-only.

**[`scopeToAccount`](apps/chg/server/middleware/permissions.js:27)** — super admins get `req.account_filter = null` (see all accounts); others get `req.account_filter = req.user.account_id`. **Every list-style query appends `.eq('account_id', req.account_filter)` to enforce tenant isolation at the query layer.**

**[`verifyForeignKey(supabase, table, id, accountId)`](apps/chg/server/middleware/permissions.js:45)** — looks up row by both `id` AND `account_id`; returns boolean. Used on cross-table writes to prevent cross-tenant FK assignment. ⚠ **Skipped when `req.account_filter` is null** (i.e. super admin bypasses FK ownership checks) — see §7 high #7.

### 3.2 Client-side gate — [`ProtectedRoute.jsx`](apps/chg/client/src/components/ProtectedRoute.jsx)

Four mutually-compatible props:

| Prop | Check | Fail behavior |
|---|---|---|
| *(none)* | `user` exists | redirect to `/login` |
| `requireSuperAdmin` | `isSuperAdmin` | redirect to `/` |
| `requireAdmin` | super admin OR account admin | redirect to `/` |
| `department` | `hasDepartmentAccess(department)` | redirect to `/` |
| `requireEdit` + `department` | `canEditDepartment(department)` | redirect to `/` |

Also surfaces a suspension banner if `profile.status === 'suspended'` (blocks render without redirect).

**Assessment.** The client gate is cosmetic — real enforcement happens server-side via `requireAuth` + `scopeToAccount`. That's the correct pattern. A malicious client bypassing `ProtectedRoute` still hits the server's auth wall.

---

## 4. API route inventory

### 4.1 Mount map (from [server/index.js](apps/chg/server/index.js))

| Base path | Middleware chain | File | Notes |
|---|---|---|---|
| `/api/auth` | *(none at mount)* | [`auth.js`](apps/chg/server/routes/auth.js) | Signup has in-route rate limit; other endpoints internal-auth |
| `/api/health` | *(none)* | inline | Public health check |
| `/api/admin` | `requireAuth` | [`admin.js`](apps/chg/server/routes/admin.js) | Then `requireSuperAdmin` applied inside |
| `/api/users` | *(none at mount)* ⚠ | [`users.js`](apps/chg/server/routes/users.js) | See §7 critical #1 |
| `/api/dashboard` | `requireAuth` | [`dashboard.js`](apps/chg/server/routes/dashboard.js) | |
| `/api/properties` | `requireAuth`, `scopeToAccount`, `requireDepartment('property_management')` | [`properties.js`](apps/chg/server/routes/properties.js) | Cascade delete — see §7 critical #4 |
| `/api/units` | same, property_management | [`units.js`](apps/chg/server/routes/units.js) | |
| `/api/contractors` | same, `contractors` | [`contractors.js`](apps/chg/server/routes/contractors.js) | Uses `ALLOWED_FIELDS` whitelist — good |
| `/api/projects` | same, `construction` | [`projects.js`](apps/chg/server/routes/projects.js) | Largest surface; invoices, phases, notes, activity, atomic addendum review |
| `/api/master-phases` | same, `construction` | [`master-phases.js`](apps/chg/server/routes/master-phases.js) | Mutations gated on admin |
| `/api/addendums` | same, `construction` | [`addendums.js`](apps/chg/server/routes/addendums.js) | Atomic CAS on review — good pattern |
| `/api/tenants` | same, `property_management` | [`tenants.js`](apps/chg/server/routes/tenants.js) | |
| `/api/deals` | same, `acquisitions` | [`deals.js`](apps/chg/server/routes/deals.js) | No DELETE endpoint |
| `/api/tasks` | same, `tasks` | [`tasks.js`](apps/chg/server/routes/tasks.js) | |
| `/api/invoices` | same, `finance` | [`invoices.js`](apps/chg/server/routes/invoices.js) | Mirrors events to projects router |

### 4.2 Good patterns worth keeping

- `scopeToAccount` is consistently applied; tenant isolation is enforced at both the query layer (app) and the row-security layer (DB).
- `verifyForeignKey` prevents attaching child records to parents in other accounts.
- Atomic compare-and-swap on `addendums` review prevents concurrent reviewer conflicts.
- Field-whitelisting on `contractors` prevents mass-assignment attacks.
- All queries use the Supabase JS client — **no raw SQL string interpolation found**, no SQL injection vectors.

---

## 5. Rate limiter

**Location:** [`apps/chg/server/routes/auth.js:6–21`](apps/chg/server/routes/auth.js)

**Implementation:** In-memory JavaScript `Map<ip, timestamp[]>`.

**Config:**
- Window: 15 minutes (`SIGNUP_WINDOW_MS`)
- Max: 5 signups per IP per window (`MAX_SIGNUPS_PER_IP`)
- Applied only to `POST /api/auth/signup`

**Problems:**

1. **Resets on every deploy** (per-process memory). Already flagged in handoff risk register.
2. **Doesn't share state across autoscale instances** (Replit autoscale = multiple Node processes).
3. **Memory leak risk:** no TTL eviction of stale IP keys. The `.filter()` on line 14 prunes timestamps *within* an existing IP entry but never removes empty entries from the `Map`. A sustained attack with varied IPs grows memory unbounded.
4. **Only signup is rate-limited.** No login throttle, no password reset throttle (both TBD as features anyway).

**Phase 2 replacement** (per blueprint §12): Postgres-backed counter table keyed by IP + endpoint + window, with a cleanup cron. Reasoning: Postgres is already in our stack; adding Redis just for this is overkill; Supabase Pro includes PITR so counters survive crashes anyway.

---

## 6. Test coverage

**Verdict: effectively zero coverage. Untested production code.**

| What | State |
|---|---|
| Test framework (client) | Jest via `react-scripts` / `@testing-library/react` |
| Test framework (server) | None configured |
| Test files found | 1: [`apps/chg/client/src/App.test.js`](apps/chg/client/src/App.test.js) — boilerplate placeholder checking for a "learn react" link that doesn't exist in the app |
| Server test files | 0 |
| `test` script in server `package.json` | Absent |
| CI workflows | None. No `.github/workflows/` |

**Implication.** Every schema migration, every route change, every RLS policy update has been hand-tested. For Phase 1 (the schema migration) this is **unacceptable risk** — one bad RLS policy leaks cross-account data (handoff risk register, HIGH).

**Recommended Phase 0.5 mini-task** (before Phase 1 begins):
- Stand up Vitest for the server (lightweight, matches the Vite tooling already in `apps/deallink/`).
- Write smoke tests for every `requireAuth` + `scopeToAccount` guard.
- Add GitHub Actions CI running `npm test --workspaces` on every PR.

Not part of Task 5 itself; flagged here for Nicole's decision on whether to add it to Phase 0 or fold into Phase 2.

---

## 7. Security red flags (consolidated, prioritized)

### 🚨 Critical (fix before Phase 1 migration)

**#1 — `/api/users` is mounted without `requireAuth`**
- [`server/index.js:22`](apps/chg/server/index.js) mounts the router without middleware. The only handler is `PUT /profile` which calls `requireAuth` internally, so it's currently safe, **but the mount pattern breaks the invariant** — any future route added to this file inherits no auth.
- **Fix:** `app.use('/api/users', requireAuth, require('./routes/users'))`

**#2 — Role self-promotion via signup metadata**
- [`handle_new_user()`](apps/chg/scripts/saas-migration.sql:308) reads `raw_user_meta_data->>'role_id'` and writes it directly to `user_profiles.role_id`.
- If the signup endpoint allows user-supplied metadata (Supabase Auth API lets clients pass arbitrary `user_metadata` unless the app strips it), **a signup can assign themselves any role including a superadmin-equivalent role**.
- **Fix:** Validate the role_id server-side inside `handle_new_user()` (check it belongs to the account's roles and isn't a system role), OR remove `role_id` from metadata handling entirely and assign roles only via `/api/admin`.

**#3 — `subscription_tiers` RLS policy is `USING (true)`**
- [`saas-migration.sql:248`](apps/chg/scripts/saas-migration.sql) grants SELECT to any authenticated user. Exposes pricing and full feature matrix to every customer.
- **Fix:** Restrict SELECT to super admins + a lookup for the caller's own tier (join on `accounts.plan_tier`).
- **Note:** This table is deprecated in Phase 1 (moves to `account_products`), but until Phase 1 ships, the leak is live.

**#4 — Cascade deletes with no audit trail, no soft-delete**
- [`properties.js:111–141`](apps/chg/server/routes/properties.js) `DELETE /:id` cascades to construction_projects, invoices, tenants, recurring_tasks. Irreversible. No `deleted_at` column, no `activity_log` entry captures the deletion.
- **Fix:** Add `deleted_at TIMESTAMPTZ` to affected tables, filter `WHERE deleted_at IS NULL` in list queries, log the delete event. This is also cheap insurance for Phase 1 migration rollback scenarios.

### ⚠ High

**#5 — CORS fully open**
- [`server/index.js:10`](apps/chg/server/index.js): `app.use(cors())` with no config. Any origin can request with credentials.
- **Fix:** `app.use(cors({ origin: process.env.FRONTEND_URLS?.split(',') ?? 'http://localhost:3000', credentials: true }))`

**#6 — Rate limiter memory leak**
- See §5. Stale IP entries never evicted.
- **Fix:** Phase 2 Postgres-backed replacement. Short term: add `setInterval(cleanup, 15 * 60 * 1000)` to evict empty entries.

**#7 — Super admins bypass `verifyForeignKey`**
- [`permissions.js:45`](apps/chg/server/middleware/permissions.js) returns `true` when `accountId` is null (super admin case). A super admin could attach an invoice to a phase from a different account, corrupting cross-tenant data.
- **Fix:** Always verify FK exists, even for super admins; the account-match check can be skipped but the existence check should not be.

**#8 — `activity_log` has no INSERT RLS policy**
- RLS enabled but only SELECT policies exist ([`saas-migration.sql:277`](apps/chg/scripts/saas-migration.sql)). App writes silently fail unless using the service role key.
- **Fix:** Either add `CREATE POLICY "Users insert own account" ON activity_log FOR INSERT WITH CHECK (account_id = current_account_id())` OR document that writes go through service role and remove RLS-enabled-but-unprotected ambiguity.

### ℹ Medium

**#9 — Weak password policy**
- [`auth.js`](apps/chg/server/routes/auth.js) enforces min 6 chars. Industry floor is 12.
- `email_confirm: true` is set at signup (line 86), meaning no email verification step — accounts are immediately usable. Combined with #2 above, this is a fast path to account takeover.
- **Fix:** Enforce min 12, add password complexity check, flip to email verification on signup.

**#10 — Sensitive data stored in plaintext**
- Contractor phone, email, notes; user_profiles phone; invoice vendor + notes (may contain bank details).
- Supabase Pro has at-rest encryption, but no field-level encryption and no masking.
- **Fix:** Long-term, use Supabase Vault for the most sensitive fields. Short term, document what counts as sensitive and restrict SELECT to role-gated paths.

**#11 — `bcryptjs` and `multer` are listed as deps but unused**
- Dead code. Multer 1.x has known CVEs — if anyone adds a file upload route without checking, path traversal risk.
- **Fix:** Remove both from `/server/package.json` (the extracted monorepo server). When file uploads are needed, re-add `multer@^2` with explicit MIME + path checks.

**#12 — No logout / token revocation endpoint**
- Client-side token deletion only. Server cannot revoke a session on suspension.
- **Fix:** Phase 2 — add `/api/auth/logout` with Supabase `auth.admin.signOut(user_id)`.

### ℹ Low

**#13 — Project `contractor_id` FK not account-validated**
- [`construction-migration.sql:91`](apps/chg/scripts/construction-migration.sql) allows `contractor_id` FK without a CHECK that contractor's `account_id` matches the project's.
- **Fix:** Trigger-based CHECK or require write path to use `verifyForeignKey`.

**#14 — Seed scripts hardcode test passwords**
- [`seed-test-users.js`](apps/chg/scripts/seed-test-users.js) and [`seed.js`](apps/chg/scripts/seed.js). Dev-only, not deployed.
- **Fix:** Read from env or prompt interactively.

---

## 8. Top 10 action items (prioritized)

Ordered by what blocks Phase 1 first, then by severity.

| # | Item | Priority | Phase to fix |
|---|---|---|---|
| 1 | **Get production schema snapshot from Nicole** (§2) to close the dev-vs-prod delta question | BLOCKER | Phase 0 |
| 2 | Fix [`subscription_tiers`](apps/chg/scripts/saas-migration.sql:248) RLS `USING (true)` (§7 #3) | CRITICAL | Phase 0 or rolled into Phase 1 migration |
| 3 | Validate role_id in [`handle_new_user()`](apps/chg/scripts/saas-migration.sql:305) to block self-promotion (§7 #2) | CRITICAL | Phase 0 hotfix |
| 4 | Add `requireAuth` to [`/api/users`](apps/chg/server/index.js:22) mount (§7 #1) | CRITICAL | Phase 0 hotfix |
| 5 | Stand up Vitest + basic CI before Phase 1 migration (§6) | HIGH | Phase 0.5 |
| 6 | Soft-delete for properties cascade (§7 #4) | HIGH | Phase 1 |
| 7 | Replace CORS wildcard with an allow-list (§7 #5) | HIGH | Phase 2 |
| 8 | Postgres-backed rate limiter to replace in-memory Map (§5, §7 #6) | HIGH | Phase 2 |
| 9 | Always-verify-FK for super admins (§7 #7) | MEDIUM | Phase 2 |
| 10 | Remove unused `bcryptjs` + `multer@1.x` (§7 #11) | MEDIUM | Phase 0 cleanup |

---

## 9. Status of Phase 0 subtasks (snapshot at time of audit — 2026-04-23)

| Task | Status |
|---|---|
| Task 1 — Monorepo consolidation via git subtree | ✅ merged to main |
| Task 2 — Extract server to `/server/` | ⏳ PR open (`feat/extract-server`) |
| Task 3 — Scaffold `packages/ui` + `packages/api-client` | ⏳ PR open (`feat/scaffold-packages`) |
| Task 4 — Root `.replit` entry point | ⏳ PR open (`feat/replit-entrypoint`) |
| Task 5 — This audit | ⏳ PR open (`feat/phase-0-audit`) |

---

*End of Phase 0 audit. Phase 1 — Schema foundation — begins once the four Phase 0 PRs merge, section 2 is filled in from production, and the four CRITICAL items (§7 #1–4) are either fixed or explicitly deferred with Nicole's sign-off.*
