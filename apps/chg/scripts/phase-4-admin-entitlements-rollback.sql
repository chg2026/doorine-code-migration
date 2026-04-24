-- Phase 4 rollback — drop the admin-console audit columns + index.
--
-- This is reversible because the columns are only written by new server code.
-- The live chg-crm Replit never touches them. As long as you roll back the
-- rei-code server code FIRST (or make sure no admin grant/revoke is in flight),
-- dropping these columns loses only the disabled_at/disabled_by audit fields —
-- the entitlement rows themselves and their status are untouched.

BEGIN;

DROP INDEX IF EXISTS public.idx_account_products_account_status;

ALTER TABLE public.account_products
  DROP COLUMN IF EXISTS disabled_by,
  DROP COLUMN IF EXISTS disabled_at;

COMMIT;
