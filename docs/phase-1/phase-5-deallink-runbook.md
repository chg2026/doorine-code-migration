# Phase 5 Migration Runbook — Deal Link tables

**What this does:** Adds the three Deal Link domain tables (`deallink_profiles`, `deallink_deals`, `deallink_leads`) and their RLS policies behind the `deallink` product entitlement introduced in Phase 1.

**Blast radius:** Low. Three new tables, no changes to existing CHG tables. Tenant isolation enforced from the start.

**Estimated downtime:** None. Pure additive DDL, runs in under 5 seconds.

**Who runs it:** Nicole pastes SQL into Supabase SQL editor. Claude provides the SQL and watches output.

---

## Prerequisites

All must be TRUE before starting:

- [ ] `phase-1-product-migration.sql` applied to the target database (verify `products`, `account_products`, `has_product_access()` exist).
- [ ] `is_super_admin()`, `current_account_id()`, and `set_updated_at()` exist (created by `saas-migration.sql` and Phase 1).
- [ ] Phase 5 server code (`/api/deallink/*` routes + `requireProduct('deallink')` mount) merged or staged so the front-end can be smoke-tested after the migration.
- [ ] PITR enabled on prod — already confirmed.

---

## Phase A — Rehearse on staging

In **staging** (`cmlfnhzjfhuynzuleyxt`) SQL editor:

1. Paste full contents of [`apps/crm/scripts/phase-5-deallink-tables.sql`](../../apps/crm/scripts/phase-5-deallink-tables.sql) and run. Should return "Success. No rows returned." in <5s. Watch for errors — STOP if one appears.
2. Run the verification queries at the bottom of the migration file. Expected output:
   - `table_name` returns the three deallink tables.
   - `polname` returns two policies per table (tenant isolation, super-admin). The public read surface is server-mediated via the service-role key — there are intentionally NO anon SELECT/INSERT policies, so a leaked anon key cannot read raw profiles/deals or write leads directly.
3. Manually grant a staging account a Deal Link entitlement via the super-admin Entitlements panel (or insert a row in `account_products` with `product_id` = (select id from products where code='deallink')`).
4. Sign in to the staging Deal Link UI on port 3001 as a user attached to that account; confirm the dashboard loads, profile saves, and adding a deal persists across reload.

---

## Phase B — Prod deploy

1. **Backup snapshot** in the Supabase dashboard for prod.
2. Paste [`apps/crm/scripts/phase-5-deallink-tables.sql`](../../apps/crm/scripts/phase-5-deallink-tables.sql) into the prod SQL editor. Run.
3. Run the verification queries — confirm the table + policy counts match staging.
4. Decide which accounts get Deal Link access. For each, insert into `account_products` (product = `deallink`, plan = `starter` or `free`, status = `active`) via the Entitlements panel.
5. Deploy the Deal Link autoscale deployment (see "Deal Link deployment" in `replit.md`).
6. Smoke test: log in as a real user with the new entitlement, claim a handle, add a deal, hit `/p/<handle>` from incognito.

---

## Rollback

Use [`apps/crm/scripts/phase-5-deallink-tables-rollback.sql`](../../apps/crm/scripts/phase-5-deallink-tables-rollback.sql). It drops the three tables. Suspend or revoke `deallink` entitlements first via the Entitlements panel so the front-end stops calling `/api/deallink/*` during the window.

For deeper damage (mistaken edits to thousands of rows), use Supabase PITR — restoring to a point in time before the migration cleanly removes both the tables and any data inserted into them.
