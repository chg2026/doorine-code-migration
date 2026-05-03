/**
 * Idempotent DDL: ensure `user_profiles.is_investor` exists in Supabase.
 *
 * Phase 1 of the investor portal adds a parallel role flag to
 * `user_profiles` (alongside `is_super_admin` / `is_account_admin`).
 *
 * The Supabase Postgres database is NOT the same database Prisma points at
 * (Prisma uses DATABASE_URL → Replit's Helium DB). To apply DDL to Supabase
 * we need a direct Postgres connection string for the Supabase project,
 * stored as `SUPABASE_DB_URL` (Settings → Database → Connection string →
 * URI, with the password filled in).
 *
 * Run:
 *   npm run rehab:db:investor-column
 * or:
 *   tsx apps/chg-rehab/scripts/ensure-investor-column.ts
 */
import { Client } from "pg";

async function main() {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) {
    console.error(
      "[ensure-investor-column] SUPABASE_DB_URL is not set.\n" +
        "Either:\n" +
        "  1. Set SUPABASE_DB_URL to your Supabase project's Postgres URI and re-run, or\n" +
        "  2. Run archive/apps-crm/scripts/phase-6-investor-portal.sql in the Supabase SQL editor."
    );
    process.exit(1);
  }

  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(
      `ALTER TABLE public.user_profiles
       ADD COLUMN IF NOT EXISTS is_investor boolean NOT NULL DEFAULT false`
    );
    console.log(
      "[ensure-investor-column] user_profiles.is_investor present."
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[ensure-investor-column] failed:", err);
  process.exit(1);
});
