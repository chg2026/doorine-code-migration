# Rei-Code Monorepo — Handoff to Claude Code

**Date created:** 2026-04-23
**Handoff from:** Claude Cowork mode (planning + interactive Shell guidance)
**Handoff to:** Claude Code (execution — full-stack engineering)
**User:** Nicole (non-developer, founder of Gold Bridge)

---

> **⚠️ Historical document — apps/crm is retired.**
>
> This handoff was written when `apps/crm/` was the live CHG CRM workspace. That workspace has since been retired and moved to `archive/apps-crm/`. References below to `apps/crm/` (file paths, schema scripts, audit Tasks, Phase 0–7 roadmap, etc.) describe a state of the codebase that no longer exists in the working tree.
>
> The active monorepo today is `apps/chg-rehab`, `apps/crmdeallink`, and `apps/investor-portal`. Consult those workspaces (and current docs in `docs/`) for the live picture. This file is preserved for historical context only.

---

## Context for Claude Code — Read First

You are picking up a mid-flight monorepo consolidation. Nicole is non-technical and is moving the project from Cowork mode to Claude Code because Claude Code is the right tool for deep engineering work (code edits, refactors, tests, analysis, debugging).

**Your role:** full-stack engineer, backend, DevOps, QA, code analyst, security reviewer.

**Do not guess — analyze.** Read the existing code in `apps/crm/` and `apps/deallink/` before proposing changes. Nicole's explicit project instruction:

> Claude can't try to guess solutions. Claude analyzes the folders and conversations and always come up with solutions.

**Communicate in plain English.** Nicole is non-technical. Explain what code changes do and why, not just what they are.

---

## Project Mission

Gold Bridge is a parent holding company with two products, architected on the Atlassian model:

| Entity | What it is |
|---|---|
| **Gold Bridge** | Parent brand / corporate site (goldbridge.io) |
| **CHG** | Paid enterprise real-estate CRM — currently deployed on Replit |
| **Deal Link** | Free Linktree-style wholesaler app — wireframes complete, CRUD started |

The architecture mirrors Atlassian: one Supabase Auth account per user; a user can have access to one or both products; product-scoped roles; a single shared backend serves both frontends.

**Authoritative plan:** `/Users/nicolegomez18/Documents/Claude/Projects/CHG CRM - Replit/gold-bridge-blueprint.html`

This file is a comprehensive 14-section wireframe covering the Atlassian mirror, entity hierarchy, schema diff, domain strategy, 4-level admin hierarchy, app switcher, admin console, lead magnet flow, roadmap, and risk register. Read it before doing any engineering work.

---

## Where Work Stopped

**Replit:** `rei-code.replit.app` at `/home/runner/workspace`
**GitHub monorepo:** `https://github.com/chg2026/rei-code.git`
**Source repos (to be pulled in):**
- `https://github.com/chg2026/chg-crm.git` (branch `main`)
- `https://github.com/chg2026/deal-link.git` (branch `main`)

**Branch:** `main`

**Commits at handoff:**
```
8dcf550 chore: add monorepo root package.json with npm workspaces
8fd1c3e Initial commit
```

**Working tree:** clean. No uncommitted changes.

**Files at workspace root:**
- `package.json` — monorepo root, npm workspaces declared (`apps/*`, `packages/*`, `server`)
- `.replit` — minimal Replit config (`expertMode = true`)
- `.gitignore`, `README.md` — from Initial commit
- Replit system folders: `.cache/`, `.local/`, `.upm/`, `.git/`

---

## Immediate Next Tasks (start here)

**Task 1 — Complete the monorepo consolidation via `git subtree add`.**

Run these in order. Do NOT use `--squash` — full history from both source repos must be preserved so `git blame` works going forward.

```bash
# Pull CHG into apps/crm/ with full history
# (originally pulled into apps/crm/; renamed to apps/crm/ when CHG Rehab joined the monorepo)
git subtree add --prefix=apps/crm https://github.com/chg2026/chg-crm.git main

# Verify
ls -la apps/crm/
git log --oneline -10

# Pull Deal Link into apps/deallink/ with full history
git subtree add --prefix=apps/deallink https://github.com/chg2026/deal-link.git main

# Verify
ls -la apps/deallink/
git log --oneline -10

# Push the consolidated monorepo
git push origin main
```

**Task 2 — Extract the Express server.**

Today, the CHG Express server lives at `apps/crm/server/`. For the shared-backend architecture (one server, multiple product frontends routed by hostname), we move it to `/server/` at the monorepo root. The `workspaces` array in the root `package.json` already includes `"server"`, so npm workspaces will find it once the folder exists.

**Task 3 — Scaffold shared packages.**

Create empty workspace folders `packages/ui/` and `packages/api-client/` with minimal `package.json` files. These will later hold the shared wireframe primitives (`WK colors, Btn, Stripe, Avatar` from `apps/deallink/wire-kit.jsx`) and a typed client for the shared API.

**Task 4 — Update `.replit` for the monorepo entry point.**

The current `.replit` is minimal (`[agent] expertMode = true`). It needs a run command, entry point, and port config for the new server. Coordinate with Nicole before touching this — it controls what Replit actually starts.

**Task 5 — Phase 0 audit (start after Task 4 verified working).**

Read the entire `apps/crm/` codebase and produce a document that answers:
- What does the current CHG Supabase schema look like in production? (Compare to `apps/crm/scripts/schema.sql` and `apps/crm/scripts/saas-migration.sql`)
- What's the delta between dev schema and production schema?
- Where does the auth layer live? (`apps/crm/client/src/components/ProtectedRoute.jsx` has `requireSuperAdmin`, `requireAdmin`, `department`, `requireEdit` — document how each gate works)
- Which API routes exist and what do they do?
- What tests exist? (Likely very few.)
- What's the in-memory rate limiter implementation and where is it? (Needs replacement in Phase 2 with Postgres-backed counter.)

Output this as `phase-0-audit.md` at the monorepo root.

---

## Decisions Made (9 total — 5 resolved, 4 deferred)

| # | Decision | Status |
|---|---|---|
| 1 | Domain strategy (deallink.io, app.chg.io, admin.goldbridge.io, goldbridge.io) | Deferred |
| 2 | Product SKU names | Deferred |
| 3 | Stripe webhook strategy | Deferred |
| 4 | Monorepo vs multi-repo | **MONOREPO** (npm workspaces) |
| 5 | Supabase tier | **PRO** (PITR enabled) |
| 6 | Billing provider | **STRIPE** |
| 7 | Reputation on user vs account | Deferred to v2/post-MVP |
| 8 | Reputation read/write split | Deferred to v2/post-MVP |
| 9 | `gstack/` folder | **DELETED** from GitHub |

---

## 7-Phase Roadmap

Reputation feature deferred to v2/post-MVP — shortens Phase 1–7 compared to the original 8-phase plan.

**Phase 0 — Prep & Audit** *(current)*
- Monorepo consolidation (Tasks 1–4 above)
- Codebase audit (Task 5 above)
- Supabase PITR confirmed enabled ✓

**Phase 1 — Schema foundation**
- New tables: `accounts`, `products`, `account_products`, `product_roles`, `account_users`
- Migrate existing CHG data to account-scoped model
- Run migration against PITR-protected Supabase instance
- No reputation tables (v2)

**Phase 2 — API layer**
- Move Express server from `apps/crm/server/` to `/server/` at root
- Hostname-based routing (deallink.io → Deal Link API surface, app.chg.io → CHG API surface)
- Product-scoped middleware (validates user has access to requested product via `account_products`)
- Replace in-memory rate limiter with Postgres-backed counter (the Map-based limiter resets on deploy and doesn't share across autoscale instances)

**Phase 3 — App Switcher**
- Atlassian-style widget showing which products the current user has access to
- Data source: `account_products` joined to `products`

**Phase 4 — Admin Console (goldbridge.io/admin)**
- Four-level hierarchy: Platform Super Admin → Organization Admin → Product Admin → User
- Replaces current two-level (`isSuperAdmin` / `isAccountAdmin` in `apps/crm/client/src/components/ProtectedRoute.jsx`)

**Phase 5 — Deal Link Client (deallink.io)**
- Finish CRUD platform from commit `0b4c94d Add a real estate wholesaling platform with full CRUD functionality` (now in `apps/deallink/` after Task 1)
- Public profile pages, deal listings, lead capture forms

**Phase 6 — Lead Magnet Flow**
- Deal Link free tier → upgrade path to CHG paid tier
- Stripe integration for CHG subscription billing

**Phase 7 — Launch Prep**
- DNS, domain wiring
- E2E tests
- Security review
- Load tests

---

## Risk Register — 8 risks

**HIGH**
- **RLS policy correctness** — one bad Row-Level Security policy leaks cross-account data. Every policy needs a test.
- **CHG production schema migration** — CHG is serving customers. A bad migration is unrecoverable without PITR. Always test on a branch DB first.
- **Stripe webhook idempotency** — duplicate webhook events on retry can cause duplicate charges. Store `stripe_event_id` and reject dupes.

**MEDIUM**
- **In-memory rate limiter** — current CHG implementation uses an in-process `Map`. Resets on every deploy, doesn't share state across autoscale instances. Replace in Phase 2.
- **Session tokens across subdomains** — login on `app.chg.io` needs to be recognized on `deallink.io` if the user has both products. Cookie scope = `.goldbridge.io`.
- **Blue-green deployment gaps** — the old CHG Replit must keep running until the new `rei-code` Replit is verified. DNS flip only after smoke tests pass.
- **npm workspaces dep hoisting** — version conflicts between `apps/crm/package.json` and `apps/deallink/package.json` can hoist the wrong version to root. Pin critical packages.

**LOW**
- **Monorepo build times** — mitigate with workspace-specific `build` scripts, not a monolithic build.

---

## Hard Constraints

- **Nicole is non-technical.** Narrate decisions in plain English. Show code, but always explain the why.
- **Never guess — analyze.** Read files before proposing changes.
- **Editorial aesthetic is preserved.** Deal Link uses Tiempos Text serif, SF Mono labels, cream `#FAF8F4` background, `#E5E3DE` hairlines. The wire-kit is the house style. See `apps/deallink/wire-kit.jsx` after Task 1.
- **Don't break production.** CHG is live. Schema changes through PITR-protected Supabase and reversible migrations only.
- **No speculative features.** Build the MVP. Reputation, advanced analytics, AI agents are v2.
- **Don't click Replit Agent prompts.** Replit's AI Agent auto-scaffolded unwanted files earlier (commit `84c0af2 Add a placeholder webpage and setup script for the agent environment`, since discarded). Keep it disabled.

---

## Key Files to Read First

In order of importance:

1. `/Users/nicolegomez18/Documents/Claude/Projects/CHG CRM - Replit/gold-bridge-blueprint.html` — authoritative plan
2. `apps/crm/scripts/schema.sql` *(after Task 1)* — current CHG schema
3. `apps/crm/scripts/saas-migration.sql` *(after Task 1)* — prior migration work toward multi-tenant
4. `apps/crm/client/src/components/ProtectedRoute.jsx` *(after Task 1)* — auth gate patterns
5. `apps/crm/client/src/components/Sidebar.jsx` *(after Task 1)* — department-scoped navigation
6. `apps/deallink/wire-kit.jsx` *(after Task 1)* — editorial design primitives
7. `apps/deallink/deal-data.jsx` *(after Task 1)* — sample deal structure

---

## Session Transition Notes

- The handoff is clean: monorepo root `package.json` and `.replit` are committed on both Replit and GitHub `origin/main`.
- Deal Link Replit was pushed to its GitHub origin earlier in this session — all three previously-local commits (wholesaling platform CRUD, replit-git-workflow skill, Published your App) are now in `origin/main` of the `deal-link` repo and will come in via `git subtree add`.
- Old CHG Replit and old Deal Link Replit are still running independently. Do not touch them until `rei-code` is verified working. Blue-green handoff happens at Phase 7.
- `gitsafe-backup/main` is a Replit-local safety ref and can be ignored (not a remote).
