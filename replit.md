# rei-code — Gold Bridge platform monorepo

Atlassian-style real-estate SaaS, three workspaces, two independent
deployments, one dev environment.

## Workspaces

| Path                | Tech                                          | Port (dev) | Notes                                                                                                                |
| ------------------- | --------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------- |
| `server/`           | Express 5 + Supabase JS + node-cron           | 5000       | Shared API for CHG CRM and Deal Link. Serves `apps/crm/client/build` as a SPA when present.                          |
| `apps/crm/`         | React 19 (CRA) + Supabase                     | 5000 (via server) | The CHG CRM front-end. Workspace was previously `apps/chg/` — renamed to `apps/crm` when CHG Rehab joined the repo. |
| `apps/deallink/`    | React 18 + Vite + Supabase                    | 3001       | Linktree-style wholesaler app. Live as the second Gold Bridge product (Phase 5). Persists to Supabase via `/api/deallink/*` on the shared Express server. |
| `apps/chg-rehab/`   | Next.js 15 + React 19 + Prisma 6 + iron-session + Stripe | 3000 | Standalone CHG Rehab SaaS. Replit OIDC login. Replit Postgres. Replit Object Storage.                                |
| `packages/ui/`      | (stub)                                        | —          | Reserved for shared UI primitives.                                                                                   |
| `packages/api-client/` | (stub)                                     | —          | Reserved for typed shared API client.                                                                                |

`apps/*` and `packages/*` and `server` are all npm workspaces declared in
the root `package.json`. The repo currently keeps **one root lockfile plus
two legacy nested lockfiles** (`apps/deallink/package-lock.json` and
`apps/crm/client/package-lock.json`) that pre-date the workspace conversion.
Treat the root lockfile as authoritative — do not introduce any **new**
nested lockfiles in workspaces that don't already have one. The two legacy
ones can be removed when their workspaces are next refactored.

## Three deployments, one repo

The Replit project hosts three independent autoscale deployments wired to
the same git repo:

1. **Gold Bridge** (the "main" deployment) — declared in `.replit` under
   `[deployment]`. Build = `npm install && npm run build:prod --workspace=apps/crm`.
   Run = `npm run start --workspace=server`. Serves the CHG CRM at port 5000
   and exposes the shared Express API (`/api/auth/*`, `/api/deallink/*`,
   `/api/dashboard`, etc.) consumed by the other product front-ends.
2. **CHG Rehab** — a second autoscale deployment the user creates and
   maintains separately. Build = `npm install && npm run build --workspace=apps/chg-rehab`.
   Run = `npm run start --workspace=apps/chg-rehab`. Listens on port 3000.
3. **Deal Link** — a third autoscale deployment for the wholesaler app.
   Build = `npm install && npm run build --workspace=apps/deallink`.
   Run = `npm run start --workspace=apps/deallink` (Vite preview on port 3001).
   The user creates this from the Deployments pane (the agent cannot create
   secondary deployments). Deal Link's `/api/deallink/*` calls hit the
   Gold Bridge Express server — set `VITE_SUPABASE_URL` /
   `VITE_SUPABASE_ANON_KEY` in this deployment's secrets pane (see
   `apps/deallink/.env.example`) and ensure the Express server's
   `SUPABASE_*` env vars point at the same project.

Each deployment has its own secrets pane. CHG Rehab needs the secrets listed
in `apps/chg-rehab/.env.example`; Gold Bridge needs the Supabase secrets
listed in `CLAUDE.md` and `apps/crm/.env.example`; Deal Link needs the
front-end Supabase env vars in `apps/deallink/.env.example`.

## Dev workflows

`.replit` defines four workflows (managed via the workflows skill — never
edit `.replit` by hand):

- **Server** — Gold Bridge dev server (port 5000, webview output). Built
  from `apps/crm/client/`, served by `server/index.js`. Also serves all
  `/api/*` routes including `/api/deallink/*` consumed by the Deal Link
  workflow via the Vite proxy.
- **CHG Rehab** — `next dev -H 0.0.0.0 -p 3000` (console output). Boots in
  ~2 s and is reachable at the dev domain on port 3000.
- **Deal Link** — `vite` on port 3001 (console output). Vite proxies
  `/api → http://localhost:5000` so the Deal Link UI hits the same
  Express server as the CRM in dev. Front-end auth uses Supabase directly
  via `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
- **Project** — parallel parent that runs Server, CHG Rehab, and Deal Link.
  The Replit platform auto-creates this wrapper (and points the Run button
  at it) whenever a project has more than one workflow. It is system-
  managed and cannot be removed or edited via the workflows skill — that is
  normal and expected for a multi-service monorepo. To run only one
  product, click the workflow name in the Workflows pane instead.

Three ports are forwarded to the public dev domain: `5000 → 80`
(Gold Bridge), `3000 → 3000` (CHG Rehab), and `3001 → 3001` (Deal Link).
The CRM AppSwitcher uses `devPort` on each product entry to build the
correct dev URL when running in the Replit dev domain.

## Databases

- **Gold Bridge + Deal Link** share **Supabase** (Postgres + RLS + Auth).
  Connection details live in `SUPABASE_URL` / `SUPABASE_ANON_KEY` /
  `SUPABASE_SERVICE_ROLE_KEY`. Cross-product entitlements live in
  `account_products` and are checked server-side via `requireProduct(code)`.
  The Deal Link domain tables (`deallink_profiles`, `deallink_deals`,
  `deallink_leads`) are created by
  `apps/crm/scripts/phase-5-deallink-tables.sql` — see
  `docs/phase-1/phase-5-deallink-runbook.md`.
- **CHG Rehab** uses the **Replit Postgres** module declared in `.replit`
  (`postgresql-16`). The `DATABASE_URL` env var is auto-provided by Replit.
  Schema is owned by Prisma at `apps/chg-rehab/prisma/schema.prisma`. Apply
  schema changes with:
  `./node_modules/.bin/prisma db push --schema=apps/chg-rehab/prisma/schema.prisma --accept-data-loss`.
  The post-merge script does this automatically — see below.

The two databases are intentionally separate. Cross-product user identity
will be reconciled when the platform-level Atlassian-style admin is built
(see the `gold-bridge-blueprint.html` plan and Phase 4 in `phase-0-audit.md`).

## Post-merge setup

`scripts/post-merge.sh` runs after every task merge. It:

1. Runs `npm install` at the root (picks up new workspace deps).
2. Generates the Prisma client for `apps/chg-rehab/`.
3. Pushes the Prisma schema to `DATABASE_URL` (no-op when already in sync).
4. Rebuilds `apps/crm/client/` so the Express dev server serves the latest
   bundle without waiting for the next Server-workflow restart.

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
- **Don't move CHG CRM business logic.** The rename `apps/chg → apps/crm`
  is path-only; the Express server, Supabase RLS, and React routes are
  unchanged.
- **CHG Rehab source is verbatim** from the upstream Replit project. The
  only changes the merge made were (a) port 5000 → 3000 in
  `apps/chg-rehab/package.json`, and (b) adding `apps/chg-rehab/.env.example`.
  The full handoff doc from the source project is `apps/chg-rehab/replit.md`.

## Key files

- `CLAUDE.md` — engineering guide for Gold Bridge (CRM + Deal Link).
- `apps/chg-rehab/replit.md` — 587-line CHG Rehab handoff (modules, schema,
  notification scheduler, billing, OIDC, object storage).
- `phase-0-audit.md` — historical CHG CRM security + schema audit (Apr 2026).
- `rei-code-handoff.md` — original Cowork → Claude Code handoff doc.
- `docs/phase-1/` — schema-migration runbooks for Gold Bridge.
- `.local/tasks/merge-chg-rehab-workspace.md` — full plan for the merge that
  produced this layout.
