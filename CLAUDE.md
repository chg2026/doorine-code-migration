# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start the Express API server (port 5000)
npm run dev:server

# Start CHG CRM frontend (React, port 5000)
npm run dev:crm

# Start Deal Link frontend (Vite, port 5000)
npm run dev:deallink

# Start CHG Rehab (Next.js, port 3000) — separate workflow, separate deployment
npm run dev:rehab

# ⚠ Do NOT run `dev:server` and `dev:crm` at the same time — both bind port 5000.
# The Server workflow already serves the built CRM SPA; only run `dev:crm` when
# iterating on the CRA dev server with the Express server stopped.

# Build all workspaces
npm run build

# Lint all workspaces
npm run lint

# CHG client tests (the only test suite in the repo)
cd apps/crm/client && npm test
# Run a single test file
cd apps/crm/client && npm test -- App.test.js

# CHG Rehab (Next.js workspace) tests
npm test --workspace=apps/chg-rehab
```

**Deployment (Gold Bridge — Replit autoscale):** `npm install && npm run build:prod --workspace=apps/crm` → `npm run start --workspace=server`

**Deployment (CHG Rehab — separate Replit autoscale):** `npm install && npm run build --workspace=apps/chg-rehab` → `npm run start --workspace=apps/chg-rehab`

## Environment Variables

Server requires:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (used in `requireAuth` middleware — never expose to client)
- `PORT` (default 5000)

Copy `apps/crm/.env.example` as a reference. No `.env` files are committed.

CHG Rehab (`apps/chg-rehab/`) has its own env surface (Prisma `DATABASE_URL`, iron-session `SESSION_SECRET`, Replit OIDC, Stripe, Resend, GCS object storage). See `apps/chg-rehab/.env.example` and `apps/chg-rehab/replit.md`.

## Architecture

**Gold Bridge** is an Atlassian-style multi-product SaaS for real estate companies. Two products share one Express server:

1. **CHG** (`apps/crm/client/`) — Paid enterprise CRM. Manages properties, units, construction projects, contractors, financials, tasks, and acquisitions. Multi-tenant, role-scoped. Served by the shared Express server on port 5000. (Workspace was renamed from `apps/chg` → `apps/crm` when CHG Rehab was added, to disambiguate the two CHG products.)
2. **Deal Link** (`apps/deallink/`) — Free Linktree-style wholesaler platform. Off-market deal listings and public profiles. Currently a local-state prototype (no server integration yet — all data persists to `localStorage` under key `deallink:state:v1`).
3. **CHG Rehab** (`apps/chg-rehab/`) — Standalone Next.js 15 + React 19 + Prisma 6 SaaS for rehab project management (pipeline, SOW, draws, warehouse, documents, admin). Runs on port 3000, deployed independently. Uses Replit OIDC + iron-session (NOT Supabase), the Replit Postgres module (NOT Supabase), Replit Object Storage, Stripe, and Resend. See `apps/chg-rehab/replit.md` for the full handoff doc.

### Request Flow

```
React (CHG axios / Deal Link fetch)
  → Express server/index.js (port 5000)
    → requireAuth (validates Supabase JWT, populates req.user)
    → scopeToAccount (appends .eq('account_id', ...) to every query)
    → requireDepartment('dept') (optional, per route)
    → server/routes/*.js (14 route files, ~CRUD per domain)
    → Supabase JS client (db.js) → PostgreSQL + RLS
```

### Multi-Tenancy

Every table has `account_id`. RLS policies enforce isolation at the database level via `current_account_id()`. The server middleware `scopeToAccount` adds a second layer. Super admins set `req.account_filter = null` to bypass scoping. **Never remove either layer independently.**

### Role & Permission Model

`user_profiles` → `roles` → `role_permissions` (per department + level).

Levels: `none` | `view` | `edit`  
Departments: `acquisitions`, `construction`, `property_management`, `contractors`, `finance`, `tasks`

`isSuperAdmin` and `isAccountAdmin` flags on `user_profiles` bypass department checks. Client-side gates via `useAuth()` (`hasDepartmentAccess`, `canEditDepartment`) are **cosmetic only** — enforcement is server-side.

### Server Route Conventions

- All routes mount under `/api/*` with `requireAuth` + `scopeToAccount` in the middleware chain.
- `stripAccountId()` removes client-supplied `account_id` from request bodies to prevent ownership forgery.
- `ALLOWED_FIELDS` whitelists control which columns are returned (see `contractors.js`, `projects.js`).
- `cleanProject()` / `cleanPhase()` coerce numeric/boolean fields from form strings before DB writes.
- 401 responses from any route auto-trigger signout + redirect to `/login` on the CHG client (axios interceptor in `src/lib/api.js`).

### CHG Client Patterns

- `ProtectedRoute` wraps authenticated pages; real enforcement is server-side.
- `AuthContext` (`src/context/AuthContext.jsx`) provides the `useAuth()` hook globally.
- Supabase client (`src/lib/supabase.js`) handles session storage; axios instance (`src/lib/api.js`) attaches Bearer tokens automatically.

### Monorepo

npm workspaces — no Turborepo or Nx. Workspaces: `apps/*`, `packages/*`, `server/`.

- `packages/ui/` and `packages/api-client/` are scaffolded stubs (empty, ready for shared code).
- `apps/crm/` has a nested `client/` subfolder (legacy structure from git subtree import).
- `apps/crm/` and `apps/deallink/` were merged in via `git subtree add` — full history is preserved.
- `apps/chg-rehab/` was merged in from a separate Replit project (manual extract from three zip archives, not git subtree — no history preserved).

## Key Data Model Notes

- `master_phases` are seeded per account at signup (19 standard construction phases).
- `project_activity` is append-only — UPDATE/DELETE are blocked by a DB trigger.
- `activity_log` has SELECT-only RLS; inserts are server-managed only.
- `deals` table is currently disconnected from `construction_projects` — avoid creating FK dependencies until the schema is reconciled.
- `addendums` use an atomic compare-and-swap pattern on review/approval — do not bypass with direct updates.

## Active Security Issues (Phase 0 Audit)

- `/api/users` route is missing `requireAuth` middleware — **do not add new endpoints to this file without adding auth first**.
- In-memory rate limiter (`express-rate-limit` default store) resets on deploy and doesn't share across instances — a Postgres-backed counter is planned for Phase 2.
- Supabase public signup must remain **OFF** in the dashboard (toggled off 2026-04-23).
- `verifyForeignKey()` skips FK ownership checks for super admins — be cautious with any cross-entity assignment logic.

## Commit Convention

Conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`. PRs are merged into `main`.
