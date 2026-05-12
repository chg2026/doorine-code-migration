-- Add the missing UNIQUE constraint on account_products(account_id, product_id).
--
-- The original Phase 1 migration declared this constraint inline inside
-- CREATE TABLE IF NOT EXISTS. Because the table already existed at migration
-- time, PostgreSQL skipped the entire CREATE TABLE statement (including the
-- UNIQUE clause), so the constraint was never applied to the live database.
--
-- Without this constraint the PostgREST upsert with
-- onConflict: 'account_id,product_id' fails with:
--   "there is no unique or exclusion constraint matching the ON CONFLICT specification"
--
-- Postgres does not support `ADD CONSTRAINT IF NOT EXISTS`, so we wrap the
-- ALTER in a DO block that swallows the duplicate-object error to keep the
-- migration idempotent.

DO $$
BEGIN
  ALTER TABLE public.account_products
    ADD CONSTRAINT account_products_account_id_product_id_key
    UNIQUE (account_id, product_id);
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END
$$;
