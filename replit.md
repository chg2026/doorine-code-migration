# rei-code — Gold Bridge platform monorepo

Atlassian-style real-estate SaaS, four product workspaces, multiple
independent deployments, one dev environment.

## Workspaces

| Path                | Tech                                          | Port (dev) | Notes                                                                                                                |
| ------------------- | --------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------- |
| `server/`           | Express 5 + Supabase JS + node-cron           | 5000       | Shared API for chg-rehab and Deal Link (`/api/admin/*`, `/api/auth/*`, `/api/deallink/*`, etc.). No longer serves a CRA SPA — apps/crm has been retired (CHG Phase 5).                          |
| `apps/deallink/`    | React 18 + Vite + Supabase                    | 3001       | Linktree-style wholesaler app. Live as the second Gold Bridge product. Persists to Supabase via `/api/deallink/*` on the shared Express server. |
| `apps/chg-rehab/`   | Next.js 15 + React 19 + Prisma 6 + Supabase auth + Stripe | 3000 | The CHG Platform. Supabase auth (CHG Phase 1) + tabbed `/account` Profile (Phase 2) + `/super-admin` (Phase 3, proxies to Express `/api/admin/*`) + **Investor Portal** first-class operator module at `/investor-portal` (Overview · Investors · Deals · Fundraising · Finance tabs) surfaced in TopNav alongside Contractor Portal. Replit Postgres. Replit Object Storage. |
| `apps/investor-portal/` | Next.js 15 + React 19 (shares chg-rehab Prisma client) + Supabase auth | 3002 | Investor-facing portal. Shares the chg-rehab Prisma schema (`InvestorSubscription`, `Offering`, `Distribution`, etc.) and Supabase auth users (`is_investor=true` on `user_profiles`). Pages: `/login`, `/signup` (invite-token only), `/(portal)/{dashboard,investments,distributions,documents,updates,activity,analytics}`. Investor data is scoped per-user via `lib/portfolio.ts`. |
| `apps/contractor-portal/` | Next.js 15 + React 19 (shares chg-rehab Prisma client) + Supabase auth | 3003 | Contractor-facing portal (Task #23). Three-tier model: L1 = chg-rehab `Company` (operator), L2 = `CpAccount` (contractor signing in here), L3 = `CpAccount` invited by an L2. Roles derived from `CpOperatorEdge` graph. `is_contractor=true` on `user_profiles`. Pages: `/login`, `/signup?token=…`, `/(portal)/{dashboard,jobs,bids,quotes,quotes/new,photos,invoices,docs,messages,operator/*}`. Free tier = 3 external quotes/month tracked via `CpQuotaUsage`. |
| `archive/apps-crm/` | (retired)                                     | —          | Legacy React 19 (CRA) CHG CRM. Archived 2026-05 after the chg-rehab cutover; retained read-only for reference, not built or served. |
| `packages/ui/`      | (stub)                                        | —          | Reserved for shared UI primitives.                                                                                   |
| `packages/api-client/` | (stub)                                     | —          | Reserved for typed shared API client.                                                                                |

`apps/*` and `packages/*` and `server` are all npm workspaces declared in
the root `package.json`. The repo currently keeps **one root lockfile plus
one legacy nested lockfile** (`apps/deallink/package-lock.json`) that
pre-dates the workspace conversion. Treat the root lockfile as
authoritative — do not introduce any **new** nested lockfiles in
workspaces that don't already have one.

## Deployments, one repo

The Replit project hosts independent autoscale deployments wired to the
same git repo:

1. **Gold Bridge** (the "main" deployment) — declared in `.replit` under
   `[deployment]`. Build = `npm install`. Run = `npm run start --workspace=server`.
   Exposes the shared Express API (`/api/auth/*`, `/api/admin/*`, `/api/deallink/*`,
   `/api/dashboard`, etc.) consumed by chg-rehab and Deal Link. No longer
   serves a SPA — the CHG CRM front-end has been retired (CHG Phase 5).
2. **CHG Rehab** — a second autoscale deployment the user creates and
   maintains separately. Build = `npm install && npm run build --workspace=apps/chg-rehab`.
   Run = `npm run start --workspace=apps/chg-rehab`. Listens on port 3000.
   This is the live "CHG Platform" target after Phase 4 cutover.
3. **Deal Link** — a third autoscale deployment for the wholesaler app.
   Build = `npm install && npm run build --workspace=apps/deallink`.
   Run = `npm run start --workspace=apps/deallink` (Vite preview on port 3001).
4. **Investor Portal** — a fourth autoscale deployment.
   Build = `npm install && npm run db:generate --workspace=apps/chg-rehab && npm run build --workspace=apps/investor-portal`.
   Run = `npm run start --workspace=apps/investor-portal`. Listens on port 3002.
   Shares `DATABASE_URL` (chg-rehab Prisma schema) and Supabase auth
   secrets with chg-rehab.
5. **Contractor Portal** — a fifth autoscale deployment (Task #23).
   Build = `npm install && npm run db:generate --workspace=apps/chg-rehab && npm run build --workspace=apps/contractor-portal`.
   Run = `npm run start --workspace=apps/contractor-portal`. Listens on port 3003.
   Shares `DATABASE_URL`, Supabase auth secrets, and the Prisma client
   with chg-rehab. Requires the `is_contractor` column on
   `public.user_profiles` (see `supabase/migrations/20260301000000_user_profiles_is_contractor.sql`).

The user creates secondary deployments from the Deployments pane (the
agent cannot create them). Deal Link's `/api/deallink/*` calls and the
chg-rehab Super Admin's `/api/super-admin/*` proxy both hit the Gold
Bridge Express server — set `VITE_SUPABASE_URL` /
`VITE_SUPABASE_ANON_KEY` (Deal Link) and `LEGACY_API_BASE_URL`
(chg-rehab) accordingly, and ensure the Express server's `SUPABASE_*`
env vars point at the same project.

Each deployment has its own secrets pane. CHG Rehab needs the secrets listed
in `apps/chg-rehab/.env.example`; Gold Bridge needs the Supabase secrets
listed in `CLAUDE.md`; Deal Link needs the front-end Supabase env vars in
`apps/deallink/.env.example`.

## Dev workflows

`.replit` defines four product workflows plus the system-managed parent
(managed via the workflows skill — never edit `.replit` by hand):

- **Server** — Gold Bridge dev server (port 5000, webview output). Hosts
  all `/api/*` routes (including `/api/admin/*` consumed by chg-rehab and
  `/api/deallink/*` consumed by the Deal Link Vite proxy). No longer
  serves a SPA — the CHG CRM front-end has been retired (CHG Phase 5).
- **CHG Rehab** — `next dev -H 0.0.0.0 -p 3000` (console output). Boots in
  ~2 s.
- **Deal Link** — `vite` on port 3001 (console output). Vite proxies
  `/api → http://localhost:5000`. Front-end auth uses Supabase directly.
- **Investor Portal** — runs `npm run db:generate --workspace=apps/chg-rehab`
  first to ensure the shared Prisma client is up to date, then
  `next dev -H 0.0.0.0 -p 3002`.
- **Project** — parallel parent the platform auto-creates whenever there
  is more than one workflow. System-managed; cannot be edited.

Four ports are forwarded to the public dev domain: `5000 → 80`
(Server/Gold Bridge API — the default Replit preview/webview; the Replit
platform requires the webview workflow to use port 5000), `3000 → 3000`
(CHG Rehab — select port 3000 in the preview panel to use), `3001 → 3001`
(Deal Link), and `3002 → 3002` (Investor Portal). The chg-rehab AppSwitcher
uses `devBareHost` for the CHG tile (served at the bare host — the same
replit.dev domain that CHG Rehab itself is running on) and `devPort` for
cross-port tiles (Deal Link uses `devPort: 3001`).

## Databases

- **Gold Bridge + Deal Link** share **Supabase** (Postgres + RLS + Auth).
  Connection details live in `SUPABASE_URL` / `SUPABASE_ANON_KEY` /
  `SUPABASE_SERVICE_ROLE_KEY`. Cross-product entitlements live in
  `account_products` and are checked server-side via `requireProduct(code)`.
  The Deal Link domain tables (`deallink_profiles`, `deallink_deals`,
  `deallink_leads`) are created by the SQL archived under
  `archive/apps-crm/scripts/phase-5-deallink-tables.sql` — see
  `docs/phase-1/phase-5-deallink-runbook.md`.
- **CHG Rehab + Investor Portal** share the **Replit Postgres** module
  declared in `.replit` (`postgresql-16`). The `DATABASE_URL` env var is
  auto-provided by Replit. Schema is owned by Prisma at
  `apps/chg-rehab/prisma/schema.prisma` and includes both the CHG Rehab
  domain (Stripe `Subscription`, projects, warehouse, etc.) and the
  investor-portal domain (`Investor`, `Offering`, `InvestorSubscription`,
  `CapitalCall`, `Distribution`, `InvestorDocument`, `DealUpdate`,
  `InvestorActivity`, `InvestorCommunication`, `InvestorNote`,
  `InvestorNotificationPreference`, `InvestorInvite`). Apply schema changes
  with:
  `./node_modules/.bin/prisma db push --schema=apps/chg-rehab/prisma/schema.prisma --accept-data-loss`.
  The post-merge script does this automatically.
- **Supabase-managed tables** (`auth.users`, `public.user_profiles`,
  `public.accounts`, `public.roles`) are **never** in the Prisma schema.
  DDL changes against them go in `supabase/migrations/*.sql` (lexical
  order, idempotent) and are applied with `npm run supabase:migrate`,
  which uses `SUPABASE_DB_URL` (Supavisor pooler URI). See
  `supabase/migrations/README.md` for the runbook — direct Replit access
  to the Supabase IPv6 host doesn't work. The investor-portal extension
  added `is_investor boolean NOT NULL DEFAULT false` to
  `public.user_profiles`; cross-app role rejection in chg-rehab middleware
  bounces investors to the investor portal `/login`.

## Post-merge setup

`scripts/post-merge.sh` runs after every task merge. It:

1. Runs `npm install` at the root (picks up new workspace deps).
2. Generates the Prisma client for `apps/chg-rehab/`.
3. Pushes the Prisma schema to `DATABASE_URL` (no-op when already in sync).

Configured timeout: 5 minutes (`[postMerge]` in `.replit`).

## Per-company seed scripts

CHG Rehab's main `prisma/seed.ts` operates on a single hard-coded demo
company (`seed-company-chg` / "Cleveland Holding Group"). Real users sign
up via OIDC and get their own `Company` row, which starts with **no**
warehouse departments, subcategories, items, or templates — so `/warehouse`
renders empty until seeded.

To seed the warehouse for an arbitrary company:

```bash
node_modules/.bin/tsx apps/chg-rehab/scripts/seed-warehouse-for-company.ts <companyId>
```

Idempotent and non-destructive — upserts 8 departments and 24 subcategories
by code, seeds the ~195 prototype items **only into subcategories that are
currently empty** (so user-added items are never wiped), and adds 3 system
templates if missing. Pass `--reset` to force a wipe + re-insert of items
across all subcategories (matches the original `prisma/seed.ts` behaviour).

## Conventions and constraints

- **Plain `npm`** — no Turborepo, no Nx, no pnpm.
- **Use `./node_modules/.bin/prisma`**, not `npx prisma` (faster + reproducible).
- **Stripe webhook path** (`/api/stripe/webhook`) is in CHG Rehab's
  middleware allow-list (`apps/chg-rehab/middleware.ts → PUBLIC_PATHS`) and
  must remain there.
- **Never modify `.replit` by hand** — direct edits are blocked. Use the
  workflows skill (`configureWorkflow`), the deployment skill
  (`deployConfig`), and the post-merge skill (`setPostMergeConfig`).
- **CHG Platform = chg-rehab.** As of CHG Phase 5, the CHG Platform lives
  exclusively in `apps/chg-rehab`. The legacy `apps/crm` CRA front-end has
  been archived under `archive/apps-crm/` and is no longer built or served.
  The shared Express server (`server/`) is still required because chg-rehab
  uses its `/api/admin/*` and other endpoints.
- **CHG Rehab source is no longer verbatim** from the upstream Replit
  project — it now hosts Supabase auth, the Super Admin proxy, the
  Investor Portal back-office tabs, and shared Prisma models. The
  upstream-style handoff at `apps/chg-rehab/replit.md` is historical.
- **Investor Portal shares chg-rehab's Prisma client.** Do not declare a
  second Prisma schema. Models live in `apps/chg-rehab/prisma/schema.prisma`
  (the investor block currently runs ~lines 757–1113). Investor-portal
  imports the generated client via `apps/investor-portal/lib/prisma.ts`
  which re-exports `@prisma/client` from the shared `node_modules`.
- **Two distinct `Subscription` concepts** — Stripe billing
  (`model Subscription`) and investor commitments (`model InvestorSubscription`).
  Don't confuse them. The investor model is the renamed one specifically
  to avoid that collision.
- **Investor signup is invite-only.** `POST /api/auth/signup` on the
  investor portal requires a valid `InvestorInvite.token` issued by an
  Admin from chg-rehab `/admin?tab=investors`. Without a token the
  endpoint returns 403.

## Key files

- `CLAUDE.md` — engineering guide for Gold Bridge (CRM + Deal Link).
- `apps/chg-rehab/replit.md` — 587-line CHG Rehab handoff (modules, schema,
  notification scheduler, billing, OIDC, object storage).
- `phase-0-audit.md` — historical CHG CRM security + schema audit (Apr 2026).
- `rei-code-handoff.md` — original Cowork → Claude Code handoff doc.
- `docs/phase-1/` — schema-migration runbooks for Gold Bridge.
- `.local/tasks/merge-chg-rehab-workspace.md` — full plan for the merge that
  produced this layout.

## Scope Rule — IMPORTANT
Only edit files inside `apps/chg-rehab/`.
Never modify files in `apps/deallink/`, `apps/investor-portal/`, `apps/contractor-portal/`, `server/`, `packages/`, or any root-level config files.
If a change requires touching shared code, stop and ask the user first.
