# CHG Contractor Portal (`apps/contractor-portal`)

Next.js 15 app served on **port 3003** that ports the static
`chg-contractor-portal` prototype into a real product backed by
Supabase auth + Prisma/Postgres. Modelled on `apps/investor-portal`.

## Three-tier model

| Tier | Who it is                              | How they appear in data |
| ---- | -------------------------------------- | ----------------------- |
| L1   | A CHG Rehab operator company           | `Company` in chg-rehab; surfaces the "Operator Lens" inside chg-rehab at `/contractor-portal` |
| L2   | A contractor invited by an L1 operator | `CpAccount` with an `CpOperatorEdge` whose `layer1CompanyId` is set |
| L3   | A sub invited by an L2 operator        | `CpAccount` with an `CpOperatorEdge` whose `inviterAccountId` is set |

Each contractor is **one** `CpAccount`; their tier is **derived** from
the `CpOperatorEdge` graph at request time (`lib/scope.ts`).

## Demo logins

The shared seed (`apps/chg-rehab/prisma/seed.ts` → calls
`scripts/seed-contractor.ts`) provisions:

| Email                          | Password      | Role  | Notes                                      |
| ------------------------------ | ------------- | ----- | ------------------------------------------ |
| `mike@torresdrywall.com`       | `password123` | L2    | Invited by Vestry; has invited Southwest Wall as an L3 |
| `james.wilson@vestry-demo.com` | `password123` | L1 op | Vestry — chg-rehab operator (also seeded for the investor portal demo) |
| `d.howell@swwallco.com`        | `password123` | L3    | Southwest Wall Co — sub of Mike Torres      |

The super-admin lens at `chg-rehab → /super-admin → Contractor Portal`
exposes platform-wide read-out (accounts, OperatorEdges, quotes,
invoices, jobs).

## Operator-lens pages

Available to any account with at least one downstream invitee. The
sidebar exposes them under "Operator lens":

`/operator/dashboard` · `/operator/quotes` · `/operator/contractors` ·
`/operator/jobs` · `/operator/bids` · `/operator/compliance` ·
`/operator/invoices` · `/operator/onboarding` · `/operator/messages` ·
`/operator/reporting` · `/operator/settings`.

## Free-tier quota

Free-tier accounts can send **3 external quotes / month** (a quote to a
recipient that is *not* in their OperatorEdge graph). In-network
quotes are unlimited. Enforced server-side in `lib/quota.ts` via
`CpQuotaUsage`.

## Magic-link onboarding

`/api/invites` and `/api/quotes` (when `isExternal`) mint a
`CpOnboardingInvite`, log a `CpSentMessage`, and embed the magic
link `/signup?token=…`. `/api/auth/signup` consumes the token, mints
the Supabase user, creates the `CpAccount`, and wires the
`CpOperatorEdge` back to the inviter via the
`wireOperatorEdge` helper (no `upsert` on a NULL-bearing composite
unique).

## Known tech debt

- The CHG Rehab "Contractor Portal" module
  (`apps/chg-rehab/app/contractor-portal/Client.tsx`) currently renders
  its own bespoke client component with inline styles rather than
  importing from a shared UI package alongside the contractor-portal
  operator-lens pages. The two surfaces deliberately mirror the same
  data model (Cp* tables) but the UI is not yet extracted into a
  cross-app component package — folding both into a shared workspace
  package is tracked as follow-up work and was deferred to keep the
  initial Task #23 scope contained.

## Database schema

Models live in `apps/chg-rehab/prisma/schema.prisma` (shared with
chg-rehab). Migration SQL for the new tables is at
`apps/chg-rehab/prisma/migrations/20260301000000_contractor_portal/migration.sql`.
The `is_contractor` flag on `user_profiles` is at
`supabase/migrations/20260301000000_user_profiles_is_contractor.sql`
and must be applied via the Supabase dashboard / CLI on the platform
side.
