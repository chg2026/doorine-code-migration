#!/bin/bash
set -e
echo "[post-merge] installing deps"
npm install --no-audit --no-fund --silent
echo "[post-merge] generating prisma client"
npx prisma generate
echo "[post-merge] applying schema (db push)"
npx prisma db push --accept-data-loss --skip-generate
echo "[post-merge] running lint"
npm run lint
echo "[post-merge] running tests"
npm test
echo "[post-merge] done"
