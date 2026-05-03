# Supabase migrations

This directory holds **version-controlled SQL migrations for the Supabase
project** (the database backing Supabase Auth + the `public.user_profiles`,
`public.accounts`, and role tables).

> Anything that lives in Helium DB (the Replit-managed Postgres that Prisma
> talks to via `DATABASE_URL`) belongs in `apps/chg-rehab/prisma/schema.prisma`,
> not here. See `apps/chg-rehab/prisma/README.md` for the split.

## File layout

```
supabase/migrations/
  <UTC-timestamp>_<short_name>.sql
```

Naming convention matches the Supabase CLI: `YYYYMMDDHHMMSS_description.sql`.
Migrations are applied in lexical (timestamp) order. Every migration must be
**idempotent** (`IF NOT EXISTS`, `IF EXISTS`, `ON CONFLICT DO NOTHING`, etc.)
so that re-running the directory is always safe.

Current migrations:

| File | Purpose |
| ---- | ------- |
| `20260101000000_user_profiles_is_investor.sql` | Adds `user_profiles.is_investor` for the investor portal (Phase 6). Replaces the previous one-off `archive/apps-crm/scripts/phase-6-investor-portal.sql`. |

## Applying migrations

There are two supported one-command paths. Use whichever your environment
permits.

### Option A — Pooler URL + script (preferred)

Replit cannot reach Supabase's IPv6-only direct database. To apply migrations
from the Repl, you must use the **Supavisor pooler** connection string, which
is IPv4-reachable:

1. In the Supabase dashboard, open **Project Settings → Database → Connection
   string → URI** and switch the toggle to **"Connection pooling"**
   (Supavisor). Copy the URI — it looks like:

   ```
   postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
   ```

2. Store it as a secret named `SUPABASE_DB_URL` in the Repl
   (use the secrets pane — never commit it).

3. Run:

   ```sh
   npm run supabase:migrate
   ```

   The script (`scripts/apply-supabase-migrations.mjs`) connects with
   `SUPABASE_DB_URL`, reads every `*.sql` file in this directory in
   alphabetical order, and runs each one inside a transaction. Because the
   migrations are idempotent, applying the directory repeatedly is safe.

### Option B — Copy-paste runbook (fallback)

If you can't get a pooler URL (or you're explicitly rolling out from the
dashboard), the same files work as a copy-paste runbook:

1. Open **Supabase dashboard → SQL editor → New query**.
2. For each `*.sql` file in this directory, in lexical order, paste its full
   contents into the editor and click **Run**.
3. Confirm success in the result pane. The migrations are idempotent, so
   re-running an already-applied file is a no-op.

## Adding a new migration

1. Pick a UTC timestamp greater than the latest existing file:
   `date -u +%Y%m%d%H%M%S`.
2. Create `supabase/migrations/<timestamp>_<short_snake_name>.sql`.
3. Write idempotent DDL/DML. Prefer `ALTER TABLE … ADD COLUMN IF NOT EXISTS`,
   `CREATE TABLE IF NOT EXISTS`, `CREATE POLICY … IF NOT EXISTS` (or
   `DROP POLICY IF EXISTS` followed by `CREATE POLICY`).
4. Apply it via Option A or Option B and commit the file.
