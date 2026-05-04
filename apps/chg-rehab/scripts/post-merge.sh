#!/bin/bash
# DEPRECATED in the rei-code monorepo.
#
# The active post-merge hook for the whole repo is `scripts/post-merge.sh`
# at the project root, registered with Replit via the `[postMerge]` block in
# `.replit`. It already runs `prisma generate` + `prisma db push` for this
# workspace using the root Prisma binary (`./node_modules/.bin/prisma`),
# which is the project-wide convention.
#
# This file is kept only as a manual fallback. Use the root script instead
# of running this one. If you do invoke it, it must be run from this
# directory and uses the relative path to the root `node_modules`.

set -e
echo "[chg-rehab/post-merge] (deprecated) installing deps"
npm install --no-audit --no-fund --silent
echo "[chg-rehab/post-merge] (deprecated) generating prisma client"
../../node_modules/.bin/prisma generate
echo "[chg-rehab/post-merge] (deprecated) applying schema (db push)"
../../node_modules/.bin/prisma db push --accept-data-loss --skip-generate
echo "[chg-rehab/post-merge] (deprecated) done — prefer scripts/post-merge.sh at the repo root"
