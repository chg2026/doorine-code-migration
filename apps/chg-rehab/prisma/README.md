# chg-rehab database split

The chg-rehab app reads from **two different Postgres databases**. Knowing
which schema lives where is essential before changing anything — they are
not the same server, and Prisma is only authoritative for one of them.

## 1. Helium DB — Prisma-managed

- **Connection**: `DATABASE_URL` (Replit's built-in `postgresql-16` module).
- **Source of truth**: [`schema.prisma`](./schema.prisma).
- **Apply changes**:
  ```sh
  npm run rehab:db:push        # prisma db push --accept-data-loss
  npm run rehab:db:generate    # regenerate the Prisma client
  ```
- **Tables (chg-rehab domain)**: `Company`, `Investor`, `Offering`,
  `InvestorSubscription`, `Distribution`, `DistributionAllocation`,
  `DealUpdate`, `InvestorActivity`, plus the rehab/property/lease tables.

If a table is in `schema.prisma`, Prisma owns it — never write a hand SQL
migration for it. Edit the schema and run `prisma db push`.

## 2. Supabase — hand-managed via SQL migrations

- **Connection**: the Supabase project (Auth + RLS-protected app tables).
  Reached at runtime through `@supabase/supabase-js` using `SUPABASE_URL` /
  `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`. DDL is applied via the
  Supavisor pooler URL (`SUPABASE_DB_URL`) or copy-pasted into the
  Supabase SQL editor.
- **Source of truth**: [`/supabase/migrations/`](../../../supabase/migrations)
  at the repo root. See that directory's README for the runbook.
- **Apply changes**:
  ```sh
  npm run supabase:migrate      # uses SUPABASE_DB_URL (Supavisor pooler)
  ```
  or run the files by hand from the Supabase dashboard.
- **Tables (Supabase-owned)**: `auth.users` (managed by Supabase Auth),
  `public.user_profiles`, `public.accounts`, `public.roles`, and any RLS
  policies on those.

These tables must **not** be added to `schema.prisma`. Prisma's
`DATABASE_URL` points at Helium DB and has no visibility into the Supabase
project, so a Prisma migration for `user_profiles` would either be a no-op
(at best) or create a divergent shadow table in Helium DB (at worst).

## Why the split exists

- Supabase Auth needs to own `auth.users` and the trigger that mirrors new
  signups into `public.user_profiles`. Hosting that in Supabase keeps RLS,
  JWT claims, and the email/OTP flows working out of the box.
- The investor / offering / distribution domain is heavier relational data
  with its own foreign keys and is far easier to model with Prisma against
  Helium DB.
- The two are joined at the application layer: Supabase issues the auth
  user id (UUID), and Prisma's `Investor.id` reuses that same UUID as a
  foreign-key-by-convention into `auth.users` / `user_profiles`.

## Common gotchas

- **Don't ALTER Supabase tables from a Prisma seed.** Anything like
  `prisma.$executeRawUnsafe('ALTER TABLE public.user_profiles …')` runs
  against Helium DB and is a silent no-op for the real Supabase row.
  Put the DDL in `supabase/migrations/` instead.
- **`user_profiles.account_id` ≠ Prisma `Company.id`.** `account_id` is a
  UUID FK into Supabase's `accounts` table; `Company.id` is a string PK in
  Helium DB. They are deliberately different namespaces.
- **Two `db:seed` flows.** `npm run rehab:db:seed` seeds Helium DB via
  Prisma. `npm run rehab:db:seed-investor` additionally creates a demo
  Supabase Auth user via the service-role key and upserts the matching
  `user_profiles` row through the Supabase REST API.
