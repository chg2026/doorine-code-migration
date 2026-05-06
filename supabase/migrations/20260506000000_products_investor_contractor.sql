-- Add investor-portal and contractor-portal to the products table.
-- These were missing from the original Phase 1 seed (which only added
-- 'chg' and 'deallink'). Without these rows, getProductByCode() returns
-- null and the Super Admin entitlement grant returns 400 "Unknown product".
-- ON CONFLICT makes this idempotent.

INSERT INTO public.products (code, name, brand_domain, icon, status)
VALUES
  ('investor-portal',   'Investor Portal',   NULL, 'IP', 'active'),
  ('contractor-portal', 'Contractor Portal', NULL, 'CP', 'active')
ON CONFLICT (code) DO NOTHING;
