-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 1 — Staging seed (fake data for migration rehearsal)
-- ═══════════════════════════════════════════════════════════════════════════
-- Purpose: populate a fresh staging Supabase with enough realistic-shape
-- data to make the Phase 1 migration's backfill logic exercise real code
-- paths. This seed NEVER runs on prod.
--
-- What it creates:
--   • 3 accounts with varied plan_tiers (starter, professional, enterprise)
--   • 5 roles total across those accounts (some accounts have multiple roles)
--   • 18 role_permissions (variety of edit/view/none per department)
--   • 4 properties, 2 contractors, 2 construction_projects — just enough
--     to confirm that adding product_id to roles/role_permissions doesn't
--     break existing relationships via RLS
--
-- What it does NOT create:
--   • auth.users rows (can't INSERT into auth schema from SQL editor without
--     Supabase Auth's internal hooks). The backfill logic doesn't touch
--     user_profiles, so this is fine. If you want to test the handle_new_user
--     trigger fix, create a test user via Supabase dashboard → Auth → Users
--     → Add user, then query user_profiles to confirm account_id is NULL.
--
-- Safety:
--   • Idempotent (ON CONFLICT DO NOTHING on everything)
--   • Uses fixed fake UUIDs with a '11111111-...' pattern so they're obvious
--     at a glance and easy to delete if you ever want to wipe
--   • Safe to re-run; safe to follow up with a DELETE WHERE pattern
--
-- Run order on staging (cmlfnhzjfhuynzuleyxt):
--   1. schema.sql
--   2. saas-migration.sql
--   3. construction-migration.sql
--   4. fix-trigger.sql
--   5. THIS FILE (phase-1-staging-seed.sql)
--   6. security-hotfix-handle-new-user.sql
--   7. phase-1-product-migration.sql
--   8. phase-1-product-migration-verify.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── ACCOUNTS ──────────────────────────────────────────────────────────────
-- Three accounts with different plan tiers so the backfill has variety.

INSERT INTO public.accounts (id, name, plan_tier, status, billing_email, max_users, allowed_departments)
VALUES
  ('11111111-1111-1111-1111-000000000001', 'Jane''s Flips LLC',
    'professional', 'active', 'jane@example.test', 20,
    ARRAY['acquisitions','construction','property_management','contractors']),

  ('11111111-1111-1111-1111-000000000002', 'Starter Studios',
    'starter', 'active', 'starter@example.test', 5,
    ARRAY['acquisitions','construction']),

  ('11111111-1111-1111-1111-000000000003', 'Big Enterprise Co',
    'enterprise', 'active', 'enterprise@example.test', 9999,
    ARRAY['acquisitions','construction','property_management','contractors','finance','tasks'])
ON CONFLICT (id) DO NOTHING;

-- ─── ROLES ────────────────────────────────────────────────────────────────
-- Mix of single-role accounts and multi-role accounts to exercise the
-- roles.product_id backfill.

INSERT INTO public.roles (id, name, account_id, is_system)
VALUES
  -- Jane's Flips — single admin role
  ('11111111-2222-2222-2222-000000000001', 'Admin',
    '11111111-1111-1111-1111-000000000001', false),

  -- Starter Studios — single admin role
  ('11111111-2222-2222-2222-000000000002', 'Admin',
    '11111111-1111-1111-1111-000000000002', false),

  -- Big Enterprise Co — three roles (admin, acquisitions manager, finance viewer)
  ('11111111-2222-2222-2222-000000000003', 'Admin',
    '11111111-1111-1111-1111-000000000003', false),
  ('11111111-2222-2222-2222-000000000004', 'Acquisitions Manager',
    '11111111-1111-1111-1111-000000000003', false),
  ('11111111-2222-2222-2222-000000000005', 'Finance Viewer',
    '11111111-1111-1111-1111-000000000003', false)
ON CONFLICT (id) DO NOTHING;

-- ─── ROLE PERMISSIONS ─────────────────────────────────────────────────────

-- Jane's Flips Admin: edit on all 6 departments
INSERT INTO public.role_permissions (role_id, department, permission_level)
VALUES
  ('11111111-2222-2222-2222-000000000001', 'acquisitions', 'edit'),
  ('11111111-2222-2222-2222-000000000001', 'construction', 'edit'),
  ('11111111-2222-2222-2222-000000000001', 'property_management', 'edit'),
  ('11111111-2222-2222-2222-000000000001', 'contractors', 'edit'),
  ('11111111-2222-2222-2222-000000000001', 'finance', 'edit'),
  ('11111111-2222-2222-2222-000000000001', 'tasks', 'edit')
ON CONFLICT (role_id, department) DO NOTHING;

-- Starter Studios Admin: edit on construction + acquisitions only
INSERT INTO public.role_permissions (role_id, department, permission_level)
VALUES
  ('11111111-2222-2222-2222-000000000002', 'acquisitions', 'edit'),
  ('11111111-2222-2222-2222-000000000002', 'construction', 'edit')
ON CONFLICT (role_id, department) DO NOTHING;

-- Big Enterprise Admin: edit on all 6 (same as Jane's)
INSERT INTO public.role_permissions (role_id, department, permission_level)
VALUES
  ('11111111-2222-2222-2222-000000000003', 'acquisitions', 'edit'),
  ('11111111-2222-2222-2222-000000000003', 'construction', 'edit'),
  ('11111111-2222-2222-2222-000000000003', 'property_management', 'edit'),
  ('11111111-2222-2222-2222-000000000003', 'contractors', 'edit'),
  ('11111111-2222-2222-2222-000000000003', 'finance', 'edit'),
  ('11111111-2222-2222-2222-000000000003', 'tasks', 'edit')
ON CONFLICT (role_id, department) DO NOTHING;

-- Big Enterprise Acquisitions Manager: edit acquisitions, view construction
INSERT INTO public.role_permissions (role_id, department, permission_level)
VALUES
  ('11111111-2222-2222-2222-000000000004', 'acquisitions', 'edit'),
  ('11111111-2222-2222-2222-000000000004', 'construction', 'view'),
  ('11111111-2222-2222-2222-000000000004', 'property_management', 'none')
ON CONFLICT (role_id, department) DO NOTHING;

-- Big Enterprise Finance Viewer: view finance only
INSERT INTO public.role_permissions (role_id, department, permission_level)
VALUES
  ('11111111-2222-2222-2222-000000000005', 'finance', 'view'),
  ('11111111-2222-2222-2222-000000000005', 'tasks', 'none')
ON CONFLICT (role_id, department) DO NOTHING;

-- ─── PROPERTIES ───────────────────────────────────────────────────────────
-- Realistic rows so the RLS tenant-isolation policy on account_products has
-- something to scope against. We're not testing property logic here; just
-- ensuring existing data lives alongside the new product layer.

INSERT INTO public.properties (id, account_id, address, city, property_type, status, purchase_price, created_by)
VALUES
  ('11111111-3333-3333-3333-000000000001', '11111111-1111-1111-1111-000000000001',
    '123 Maple St', 'Cleveland', 'single_family', 'active', 125000, NULL),
  ('11111111-3333-3333-3333-000000000002', '11111111-1111-1111-1111-000000000001',
    '456 Oak Ave', 'Cleveland', 'duplex', 'active', 180000, NULL),
  ('11111111-3333-3333-3333-000000000003', '11111111-1111-1111-1111-000000000002',
    '789 Elm Blvd', 'Akron', 'single_family', 'active', 95000, NULL),
  ('11111111-3333-3333-3333-000000000004', '11111111-1111-1111-1111-000000000003',
    '1000 Corporate Way', 'Columbus', 'multi_family', 'active', 2400000, NULL)
ON CONFLICT (id) DO NOTHING;

-- ─── CONTRACTORS ──────────────────────────────────────────────────────────

INSERT INTO public.contractors (id, account_id, name, trade, w9_status, agreement_signed)
VALUES
  ('11111111-4444-4444-4444-000000000001', '11111111-1111-1111-1111-000000000001',
    'ACME Plumbing', 'plumbing', 'on_file', true),
  ('11111111-4444-4444-4444-000000000002', '11111111-1111-1111-1111-000000000003',
    'BigCo Electric', 'electrical', 'on_file', true)
ON CONFLICT (id) DO NOTHING;

-- ─── CONSTRUCTION PROJECTS ────────────────────────────────────────────────

INSERT INTO public.construction_projects (id, account_id, property_id, name, status, labor_budget, material_budget)
VALUES
  ('11111111-5555-5555-5555-000000000001',
    '11111111-1111-1111-1111-000000000001',
    '11111111-3333-3333-3333-000000000001',
    'Kitchen renovation — 123 Maple',
    'active', 8000, 6500),

  ('11111111-5555-5555-5555-000000000002',
    '11111111-1111-1111-1111-000000000003',
    '11111111-3333-3333-3333-000000000004',
    'Full electrical replacement — 1000 Corporate',
    'active', 80000, 45000)
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Sanity check — run this after the seed to confirm counts
-- ═══════════════════════════════════════════════════════════════════════════
--
-- SELECT 'accounts' AS t, COUNT(*) FROM accounts WHERE id::text LIKE '11111111-%'
-- UNION ALL SELECT 'roles',             COUNT(*) FROM roles            WHERE id::text LIKE '11111111-%'
-- UNION ALL SELECT 'role_permissions',  COUNT(*) FROM role_permissions WHERE role_id::text LIKE '11111111-%'
-- UNION ALL SELECT 'properties',        COUNT(*) FROM properties       WHERE id::text LIKE '11111111-%'
-- UNION ALL SELECT 'contractors',       COUNT(*) FROM contractors      WHERE id::text LIKE '11111111-%'
-- UNION ALL SELECT 'construction_projects', COUNT(*) FROM construction_projects WHERE id::text LIKE '11111111-%';
--
-- Expected:
--   accounts             : 3
--   roles                : 5
--   role_permissions     : 18
--   properties           : 4
--   contractors          : 2
--   construction_projects: 2
