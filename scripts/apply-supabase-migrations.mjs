#!/usr/bin/env node
/**
 * Apply every SQL file in supabase/migrations/ to the Supabase project,
 * in lexical (timestamp) order, each inside its own transaction.
 *
 * Connection: requires SUPABASE_DB_URL — use the **Supavisor pooler** URI
 * from the Supabase dashboard (Project Settings → Database → Connection
 * string → "Connection pooling"). The direct (db.<ref>.supabase.co) URI is
 * IPv6-only and will not work from Replit.
 *
 * All migrations in this repo are written to be idempotent, so re-running
 * this script is safe.
 *
 * Usage:
 *   SUPABASE_DB_URL="postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:6543/postgres" \
 *     npm run supabase:migrate
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "supabase", "migrations");

function fail(msg) {
  console.error(`[supabase:migrate] ${msg}`);
  process.exit(1);
}

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  fail(
    "SUPABASE_DB_URL is not set.\n" +
      "  Set it to your Supabase Supavisor pooler URI (Project Settings →\n" +
      "  Database → Connection string → Connection pooling), or apply the\n" +
      "  files in supabase/migrations/ by hand via the SQL editor (see\n" +
      "  supabase/migrations/README.md, Option B)."
  );
}

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  console.log("[supabase:migrate] no .sql files in supabase/migrations/");
  process.exit(0);
}

const client = new Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
} catch (err) {
  fail(`failed to connect: ${err.message}`);
}

let applied = 0;
try {
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    process.stdout.write(`[supabase:migrate] applying ${file} ... `);
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("COMMIT");
      console.log("ok");
      applied += 1;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.log("FAILED");
      fail(`${file}: ${err.message}`);
    }
  }
} finally {
  await client.end().catch(() => {});
}

console.log(`[supabase:migrate] done — ${applied}/${files.length} migration(s) applied.`);
