# Phase 4 — Admin Console: end-to-end audit

**Date:** 2026-04-27
**Author:** Claude (engineering agent)
**Audience:** Nicole + Codex (cross-review)
**Scope:** Phase 4 PR A (DB), PR B (server), PR C (UI), PR D (hotfix), and the broader auth path that powers them.
**Status of phase:** code merged through PR C; PR D pushed but not yet merged. Smoke test on staging Replit blocked by an unrelated `/auth/me` regression on the same browser session. Investigation in §6.

---

> **⚠️ Historical audit — apps/crm is retired.**
>
> This audit was written against the live `apps/crm/` workspace in April 2026. That workspace has since been retired and moved to `archive/apps-crm/`. All file paths below referencing `apps/crm/...` (e.g. `apps/crm/scripts/phase-4-admin-entitlements.sql`, `apps/crm/client/src/pages/admin/`) now resolve under `archive/apps-crm/` rather than the working tree. The active monorepo today is `apps/chg-rehab`, `apps/crmdeallink`, and `apps/investor-portal`. Preserved for historical reference only.

---

## 1. What Phase 4 ships (recap)

Goal from blueprint §09: super admin can manage product entitlements per account.

- **PR A — DB migration** (`apps/crm/scripts/phase-4-admin-entitlements.sql`)
  - Adds `account_products.disabled_at TIMESTAMPTZ`
  - Adds `account_products.disabled_by UUID → auth.users(id) ON DELETE SET NULL`
  - Adds index `idx_account_products_account_status (account_id, status)`
  - Verified on staging + prod 2026-04-24. Purely additive.

- **PR B — Server endpoints** (`server/routes/admin.js`)
  - `GET /api/admin/accounts/:id/entitlements` — list per account
  - `POST /api/admin/accounts/:id/entitlements` — grant `{ product_code, plan }`
  - `PATCH /api/admin/accounts/:id/entitlements/:product_code` — change plan
  - `DELETE /api/admin/accounts/:id/entitlements/:product_code` — soft revoke
  - All four mounted under `requireAuth` + `requireSuperAdmin` (the entire `/api/admin` router applies `requireSuperAdmin`, line 5)
  - All four write `activity_log` rows with `entity_type='account_product'` and one of: `entitlement.grant`, `entitlement.regrant`, `entitlement.plan_change`, `entitlement.revoke`
  - Helpers: `syncEntitlement` (generic upsert; clears `disabled_at`/`disabled_by` on re-grant), `syncChgEntitlement` (back-compat wrapper), `logEntitlementActivity`

- **PR C — Admin UI** (`apps/crm/client/src/pages/admin/`)
  - New `EntitlementsPanel.jsx` — modal with list, grant, plan-change, revoke, re-grant
  - `AdminDashboard.jsx` AccountsTab gets:
    - New **Products** column showing pills for each *active* entitlement
    - New 🗝️ key icon as the **first** action (before pencil/edit)
    - Refreshes parent table on any entitlement change

- **PR D — Hotfix** (`fix/phase-4-entitlement-shape-alignment`, pushed, not yet merged)
  - Fix 1: `GET /api/admin/accounts` projected each entitlement with `code`/`name`. EntitlementsPanel and the new pills code expected `product_code`/`product_name`. Aligned the list endpoint to match the detail endpoint.
  - Fix 2: `PLANS_BY_PRODUCT.chg` was `['starter','pro','enterprise']`. Phase 1 seeded `account_products.plan` from the legacy `accounts.plan_tier` column, where the canonical CHG mid-tier is `'professional'`. The dropdown couldn't display existing values and `isValidPlan` rejected re-saves. Aligned both server + client to `['starter','professional','enterprise']`.

---

## 2. What's been verified correct (read end-to-end)

### 2.1 Field-name consistency between server and client

The codebase has TWO entitlement shapes by design:

| Endpoint | Field name | Consumer | Why |
|---|---|---|---|
| `GET /api/auth/me` (auth.js:217) | `code` | `AuthContext.hasProductAccess` (AuthContext.jsx:92), `AppSwitcher` (AppSwitcher.jsx:48) | User-facing — power App Switcher and product access checks |
| `GET /api/admin/accounts` (admin.js:142, post-PR-D) | `product_code` | `AdminDashboard` pills (AdminDashboard.jsx:167) | Admin-facing — keeps detail/list shapes identical |
| `GET /api/admin/accounts/:id/entitlements` (admin.js:188) | `product_code` | `EntitlementsPanel` (EntitlementsPanel.jsx:98) | Admin-facing detail |

Pre-PR-D, the list endpoint used `code` while the detail used `product_code`. PR D aligned them. **Today, both admin endpoints use `product_code` and the user-facing endpoint still uses `code` — this is intentional, not a bug.**

### 2.2 Auth middleware shape (`server/middleware/auth.js`)

`requireAuth` populates `req.user.entitlements[]` with `{ code, name, brand_domain, plan, status, seats, trial_ends_at, started_at }` (line 87–96). Only loads `status='active'` rows. Used by:
- `requireProduct(code)` (`server/middleware/permissions.js:16`) — `entitlements.find(e => e.code === code)`
- `auth.js:217` `/auth/me` projection — `entitlements.find(e => e.code === 'chg')`

Both use `e.code` and match the middleware's shape. ✅

### 2.3 Admin route gate

`server/routes/admin.js:5` does `router.use(requireSuperAdmin)` for the *entire* admin router. Combined with `app.use('/api/admin', requireAuth, ...)` in `server/index.js:25`, every admin endpoint requires authenticated + super admin. ✅

### 2.4 Soft-delete model

- Revoke (admin.js:317–326): sets `status='disabled'`, `disabled_at=now()`, `disabled_by=req.user?.id`. Idempotent — already-disabled rows return `{ ok: true, already_disabled: true }`.
- Re-grant (admin.js:47–67, `syncEntitlement` upsert with `onConflict: 'account_id,product_id'`): clears `disabled_at`/`disabled_by` to NULL.
- Audit trail: every grant/regrant/plan_change/revoke writes `activity_log` (admin.js:80–93). Failures logged but never block the underlying write.

### 2.5 Build pipeline + deploy

- `apps/crm/client/build/` is gitignored (commit 31de8b4)
- `.replit` workflow: `npm install` → `npm run build:client` → `npm run dev --workspace=server`
- `npm run build:client` → `npm run build:prod --workspace=apps/crm` → `cd client && npm install && npm run build`
- Local build verified successful for both PR C (232.99 kB gz) and PR D (232.66 kB gz)
- Static assets served immutable; `index.html` no-cache (`server/index.js:48–62`)
- `REACT_APP_SUPABASE_URL` baked into bundle on Replit confirmed via `grep` (Nicole's diagnostic 2026-04-27): build is connected to staging (`cmlfnhzjfhuynzuleyxt.supabase.co`)

### 2.6 401 axios redirect

`apps/crm/client/src/lib/api.js:17–26` — any 401 from any API call triggers `supabase.auth.signOut()` + `window.location.href = '/login'`. So a stale-token state cannot leave the user on `/` with a "logged in" appearance.

---

## 3. Known correct: PR C / PR D do NOT regress login

The login → AuthContext → `/auth/me` path is independent of Phase 4:

- AuthContext doesn't import from `pages/admin/*`
- `/api/auth/me` doesn't import from `routes/admin.js`
- The shared `account_products` table is only READ by middleware; PR C/D didn't change reads from middleware

PR D's diff is two files, six lines:
- `server/routes/admin.js`: rename `code` → `product_code`/`product_name` in the inner projection of `/admin/accounts` (only); change one element of `PLANS_BY_PRODUCT.chg` from `'pro'` → `'professional'`.
- `apps/crm/client/src/pages/admin/EntitlementsPanel.jsx`: change one element of `PLANS_BY_PRODUCT.chg` from `'pro'` → `'professional'`.

Neither file is part of the auth path. **The current `/auth/me` failure on staging (§6) is not caused by Phase 4.**

---

## 4. Smoke-test progress (2026-04-27)

| Step | Description | Result |
|---|---|---|
| 4a | "Products" column appears in Accounts table | ✅ visible (em-dashes pre-PR-D, pills will show post-PR-D) |
| 4b | Click 🗝️ key → Entitlements modal opens with account name | ✅ confirmed |
| 4c | Inline plan dropdown changes plan, toasts success | ⚠️ Nicole clicked the pencil (Edit Account) instead of the inline dropdown. Inline plan-change not yet exercised. Pre-PR-D the dropdown showed empty because `'professional'` wasn't in `PLANS_BY_PRODUCT`. PR D fixes this. |
| 4d | "+ Grant Entitlement" — add Deal Link to a CHG-only account | ❌ Not exercised yet |
| 4e | Revoke — flips status to disabled with revoke date | ❌ Not exercised yet |
| 4f | Re-grant restores | ❌ Not exercised yet |
| 4g | Closing panel refreshes Products pills on parent table | ❌ Not exercised yet |

Steps 4c–4g need PR D merged first (or 4c will display incorrectly on existing `'professional'` rows).

---

## 5. Known operational risks

### 5.1 Staging Supabase is on free tier

- Staging project: `cmlfnhzjfhuynzuleyxt.supabase.co` (free tier, "goldbridge")
- Free-tier projects auto-pause after 7 days of zero activity
- An auto-pause would cause `requireAuth` middleware's profile lookup to time out, which would surface as an unexpected 401/500 from `/auth/me`
- Mitigation: log into Supabase dashboard occasionally; if paused, click resume

### 5.2 Replit Run-button workflow flakiness

- Nicole has hit the spinner-of-death twice in the same week, caused by Replit's idle-kill or workflow misbehavior
- Reliable fallback: `Shell` → `npm run build:client && npm run dev --workspace=server`
- This is a hosting-platform issue, not an app bug. Phase 7 cutover can move us to a stable Replit Deployment (autoscale) and resolve it.

### 5.3 Plan-name canonicalization

- DB has `'professional'` for CHG mid-tier (Phase 1 seed inherited from legacy `accounts.plan_tier`)
- Pre-PR-D, the new admin code used `'pro'` — caused dropdown mismatch. PR D resolves.
- Future risk: if Deal Link uses `'pro'` (per current `PLANS_BY_PRODUCT.deallink = ['free','pro']`), then `'pro'` and `'professional'` coexist in the DB across products. Always look up plans via `PLANS_BY_PRODUCT[productCode]`, never globally.

### 5.4 `/auth/me` silent-fail UX

- `AuthContext.fetchProfile`'s `catch` block sets `profile=null` without surfacing any error to the user
- Combined with `Sidebar.jsx`'s `profile?.full_name || 'User'` fallback, a failed `/auth/me` produces a confusing "logged-in shell with no permissions" state instead of a clear error
- **Recommendation (post-Phase-4):** show an error banner on `/auth/me` failure and offer a "retry / sign out" CTA. Out of scope for this audit.

---

## 6. Open issue: `/auth/me` regression observed on staging Replit

### 6.1 Symptom

Nicole logs in successfully (Supabase session is established — the page is `/`, not `/login`, so `ProtectedRoute` admitted her) but the sidebar shows ONLY:
- "CHG Platform / Operations" header (account_name fallback when `profile` is null)
- Dashboard nav item only (the only `alwaysShow: true` entry in `Sidebar.jsx`)
- Bottom-left "User" / "?" avatar (`profile?.full_name || 'User'` fallback)

This means `profile === null` in AuthContext, which means `/auth/me` either threw or returned an error and the AuthContext catch swallowed it.

Earlier the same day, Nicole successfully logged in and saw "Nicole (staging) / support+21@goldbridgerei.com" with a full sidebar including the Admin section. Same code, same Replit, same browser. **Something between then and now flipped `/auth/me` from succeeding to failing.**

### 6.2 What could cause this — ranked by likelihood

| # | Hypothesis | Why ranked here | Disproof / next check |
|---|---|---|---|
| 1 | Staging Supabase project auto-paused (free tier) | Free tier inactivity timeout fits the "worked, then suddenly didn't, no code change" pattern | Open Supabase dashboard → check if project status is "Paused"; if so, click resume |
| 2 | `/auth/me` returns 5xx; AuthContext catch swallows it | Matches symptom exactly; would explain no `/login` redirect (which only fires on 401) | Capture `/auth/me` Network response (see §6.3) |
| 3 | `/auth/me` returns 401, but the axios interceptor's `signOut` + redirect race-conditions with React rendering and the Dashboard renders one frame before navigation completes | Possible but transient; would self-correct on next navigation | If symptom persists after a manual route change, this is ruled out |
| 4 | A change to user_profiles row on staging (e.g., `is_super_admin` flipped to false, or `accounts.status='suspended'`) | Would surface as 403 in middleware, caught by AuthContext catch, profile=null | Inspect `user_profiles` row in Supabase for `support+21@goldbridgerei.com`; check joined `accounts.status` |
| 5 | Stale build still being served | Disproved — Nicole already grepped the bundle and confirmed staging Supabase URL is baked in, plus Replit console shows recent build | n/a |

### 6.3 Diagnostic Nicole needs to run (one shot)

While reproducing the symptom in the browser:

1. F12 → **Network** tab → enable "Preserve log"
2. Hard-refresh (`Cmd+Shift+R`)
3. After login → on the Dashboard with the broken sidebar, find the request to `/api/auth/me`
4. Click it → screenshot or copy:
   - **Status code** (200/401/403/500/other)
   - **Response body** (the JSON)
5. Also: in **Replit's Console** tab (server logs), copy any line that starts with `[auth/me]` or `[auth]`

The status code immediately disambiguates hypotheses 1–4:
- **5xx** → look at the server log for the throw
- **403** → `accounts.status='suspended'` or org check failing → §6.2 #4
- **401** → token validation failing → check Supabase auth token freshness
- **200** but malformed body → bug in `/auth/me` handler we missed
- **(failed) / pending forever** → Supabase auto-paused → §6.2 #1

### 6.4 Why this audit cannot answer §6 without that capture

The server is running, the build is correct, the code paths are traced. The remaining unknown is the actual response body of `/auth/me` against staging right now. Guessing further without it would just be more firefighting.

---

## 7. PR / commit summary

| PR | Branch | State | Commits |
|---|---|---|---|
| Phase 4 PR A | `chore/phase-4-admin-entitlements-sql` | merged → main (`c2db1a3`) | `1fe3488` |
| Phase 4 PR B | `feat/phase-4-admin-entitlements-api` | merged → main (`2b871aa`) | `631b354` |
| Phase 4 PR C | `feat/phase-4-admin-entitlements-ui` | merged → main (`a2030ac`) | `f56ba70` |
| Phase 4 PR D | `fix/phase-4-entitlement-shape-alignment` | pushed, **not yet merged** | `099b33b` |

PR D URL: https://github.com/chg2026/rei-code/pull/new/fix/phase-4-entitlement-shape-alignment

---

## 8. Next concrete steps (for Nicole)

1. **Resolve §6** by capturing the `/auth/me` response. This is the only blocker for closing Phase 4.
2. **If staging Supabase is paused**, resume it from the dashboard.
3. **Merge PR D** after §6 is resolved (it doesn't depend on §6 — but smoke-testing 4c–4g needs login working first).
4. **Re-run smoke test 4a–4g** with PR D applied.
5. **Close Phase 4** by running `/review` + `/security-review` skills (Rule 3).

## 9. Things this audit explicitly did NOT change

- No code edits during this audit pass — read-only investigation
- PR D was already pushed before the audit started; not modified
- No SQL changes; PR A migration is final
- `/auth/me` is not modified — diagnosis must come before any fix attempt
