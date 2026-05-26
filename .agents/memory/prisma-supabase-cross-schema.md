---
name: Prisma vs Supabase cross-schema FK
description: chg-rehab DATABASE_URL points at Supabase; prisma db push errors on a pre-existing cross-schema FK from public.account_products to auth.users.
---

When adding new Prisma models to `apps/chg-rehab/prisma/schema.prisma`, do not rely on `prisma db push`. The CHG Rehab DATABASE_URL points at Supabase Postgres (contradicting `replit.md`, which describes it as Replit Postgres). Push fails with:

> P4002 — public.account_products points to auth.users in constraint account_products_disabled_by_fkey. Please add `auth` to your `schemas` property and run this command again.

Adding `schemas = ["public","auth"]` plus `previewFeatures = ["multiSchema"]` to the datasource would require annotating every model with `@@schema("public")` — too invasive for a feature task.

**How to apply:** for new tables, write an idempotent SQL file under `apps/chg-rehab/prisma/sql/<feature>-tables.sql` using `CREATE TABLE IF NOT EXISTS` + a guarded `DO $$ ... pg_constraint NOT EXISTS ... $$` block for FKs, apply with `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f <file>`, then run only `prisma generate` (no push). The generated client works against the manually-created tables because the schema.prisma still defines them. The post-merge script will harmlessly retry `prisma db push` and log the same P4002, but the tables already exist so nothing breaks.

**Why:** save the next agent from re-discovering this. The "obvious" path (`prisma db push` per `replit.md`) errors out, and the natural workaround (multiSchema + @@schema) is a much bigger schema change than most feature tasks warrant.
