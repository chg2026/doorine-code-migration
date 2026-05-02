#!/bin/bash
# Post-merge setup for the Gold Bridge / rei-code monorepo.
# Idempotent. Stdin is closed by the runner — never use interactive flags.
# Runs after every task merge (see .replit [postMerge]) so newly merged
# workspaces and schema changes land cleanly in the dev environment.

set -e

echo "[post-merge] installing all workspace deps"
npm install --no-audit --no-fund --silent

# CHG Rehab (apps/chg-rehab) needs a Prisma client + the DB schema in sync
# with the live Replit Postgres. Both are no-ops when already up to date.
if [ -f apps/chg-rehab/prisma/schema.prisma ]; then
  echo "[post-merge] generating prisma client (chg-rehab)"
  ./node_modules/.bin/prisma generate --schema=apps/chg-rehab/prisma/schema.prisma

  if [ -n "${DATABASE_URL:-}" ]; then
    echo "[post-merge] pushing prisma schema to DATABASE_URL (chg-rehab)"
    ./node_modules/.bin/prisma db push \
      --schema=apps/chg-rehab/prisma/schema.prisma \
      --accept-data-loss \
      --skip-generate
  else
    echo "[post-merge] DATABASE_URL not set — skipping prisma db push"
  fi
fi

# Gold Bridge / CHG CRM (apps/crm) still ships a CRA build that the Express
# server serves as a SPA. Rebuild it so the dev preview reflects merged
# client-side changes without waiting for the Server workflow's next restart.
if [ -f apps/crm/client/package.json ]; then
  echo "[post-merge] rebuilding apps/crm client"
  npm run build:prod --workspace=apps/crm
fi

echo "[post-merge] done"
