# Deal Link — second-product deployment notes

Deal Link is the third autoscale deployment in the project (after Gold Bridge
and CHG Rehab). The agent cannot create secondary deployments — the user
needs to set this up once from the Replit Deployments pane.

## One-time setup

1. **Apply the migration** in the prod Supabase SQL editor:
   `apps/crm/scripts/phase-5-deallink-tables.sql` (runbook:
   `docs/phase-1/phase-5-deallink-runbook.md`).
2. **Grant Deal Link access** to the accounts that should see the tile.
   Insert a row into `account_products` with `product_id = (select id from
   products where code='deallink')`, `plan='starter'`, `status='active'`
   via the super-admin Entitlements panel.
3. **Set deployment secrets first** (Deal Link deployment → Secrets) —
   Vite bakes `VITE_*` values in at build time, so these must exist
   before the deploy build runs:
   - `VITE_SUPABASE_URL` — same Supabase project as Gold Bridge
   - `VITE_SUPABASE_ANON_KEY` — same project
   - `VITE_API_BASE_URL` — origin of the Gold Bridge deployment that
     serves the Express API (e.g. `https://app.goldbridge.dev`). The CRM
     Express server has permissive CORS + uses Bearer-token auth, so
     cross-origin works without cookie plumbing.
   - See `apps/deallink/.env.example` for the canonical list.
4. **Create the deployment** in the Deployments pane:
   - **Type:** Autoscale
   - **Build:** `npm install && npm run build --workspace=apps/deallink`
   - **Run:** `npm run start --workspace=apps/deallink`
   - **Port:** 3001
5. **Custom domain (optional):** point a CNAME (e.g. `app.deallink.io`) at
   the deployment's primary host.

## What the deployment serves

`vite preview` on port 3001 serves the static SPA build of `apps/deallink/`.
All `/api/*` calls go to `${VITE_API_BASE_URL}/api/...` — the Deal Link
deployment itself does NOT run an Express process. The Gold Bridge
deployment is the single home for `/api/auth/*`, `/api/deallink/*`, and
`/api/deallink/public/*`. If you ever want to host both behind one
domain, front them with a single proxy and leave `VITE_API_BASE_URL`
blank so the SPA uses relative `/api/...` URLs.

## Troubleshooting

- **`@rollup/rollup-linux-x64-gnu` missing** — run
  `npm install -w apps/deallink @rollup/rollup-linux-x64-gnu --save-optional`.
  This is a known npm bug with optional native deps.
- **Sign-in fails with 401 on `/auth/me`** — confirm the Supabase project
  ref in `VITE_SUPABASE_URL` matches `SUPABASE_URL` on the Express server.
- **AccessDenied keeps rendering for a real beta user** — confirm the
  user's `account_id` has an active row in `account_products` with
  `code='deallink'`.
