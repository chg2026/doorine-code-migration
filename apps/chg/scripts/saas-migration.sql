-- ═══════════════════════════════════════════════════════════════════════════
-- CHG CRM → SaaS Migration
-- Run this in Supabase Dashboard → SQL Editor
-- Adds multi-tenant accounts, users, roles, permissions + RLS policies
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── ACCOUNTS (client organizations) ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  plan_tier     TEXT NOT NULL DEFAULT 'starter',
  status        TEXT NOT NULL DEFAULT 'active',
  billing_email TEXT,
  max_users     INTEGER DEFAULT 5,
  allowed_departments TEXT[] DEFAULT ARRAY['acquisitions','construction'],
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── ROLES ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  account_id  UUID REFERENCES accounts(id) ON DELETE CASCADE,
  is_system   BOOLEAN DEFAULT false,
  created_by  UUID,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── ROLE PERMISSIONS ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS role_permissions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id          UUID REFERENCES roles(id) ON DELETE CASCADE,
  department       TEXT NOT NULL,
  permission_level TEXT NOT NULL DEFAULT 'none',
  UNIQUE(role_id, department)
);

-- ─── USER PROFILES (linked to Supabase Auth) ───────────────────────────────

CREATE TABLE IF NOT EXISTS user_profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  full_name    TEXT,
  phone        TEXT,
  avatar_url   TEXT,
  role_id      UUID REFERENCES roles(id) ON DELETE SET NULL,
  account_id   UUID REFERENCES accounts(id) ON DELETE CASCADE,
  is_super_admin BOOLEAN DEFAULT false,
  is_account_admin BOOLEAN DEFAULT false,
  status       TEXT NOT NULL DEFAULT 'active',
  last_login   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── SUBSCRIPTION TIERS (configurable by Super Admin) ───────────────────────

CREATE TABLE IF NOT EXISTS subscription_tiers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL UNIQUE,
  display_name        TEXT NOT NULL,
  max_users           INTEGER NOT NULL DEFAULT 5,
  allowed_departments TEXT[] NOT NULL DEFAULT ARRAY['acquisitions','construction'],
  price_monthly       NUMERIC DEFAULT 0,
  price_yearly        NUMERIC DEFAULT 0,
  features            JSONB DEFAULT '{}',
  sort_order          INTEGER DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default tiers
INSERT INTO subscription_tiers (name, display_name, max_users, allowed_departments, price_monthly, price_yearly, sort_order)
VALUES
  ('starter',      'Starter',      5,   ARRAY['acquisitions','construction'], 49, 470, 1),
  ('professional', 'Professional', 20,  ARRAY['acquisitions','construction','property_management','contractors'], 99, 950, 2),
  ('enterprise',   'Enterprise',   9999,ARRAY['acquisitions','construction','property_management','contractors','finance','tasks'], 199, 1900, 3)
ON CONFLICT (name) DO NOTHING;

-- ─── ADD account_id TO EXISTING TABLES ──────────────────────────────────────

ALTER TABLE properties           ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE contractors          ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE construction_projects ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE tenants              ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE deals                ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE recurring_tasks      ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;
ALTER TABLE invoices             ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE CASCADE;

-- ─── ACTIVITY LOG ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS activity_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  account_id  UUID REFERENCES accounts(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   UUID,
  metadata    JSONB DEFAULT '{}',
  ip_address  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── INDEXES ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_user_profiles_account  ON user_profiles(account_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role     ON user_profiles(role_id);
CREATE INDEX IF NOT EXISTS idx_roles_account          ON roles(account_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role   ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_properties_account     ON properties(account_id);
CREATE INDEX IF NOT EXISTS idx_contractors_account    ON contractors(account_id);
CREATE INDEX IF NOT EXISTS idx_projects_account       ON construction_projects(account_id);
CREATE INDEX IF NOT EXISTS idx_tenants_account        ON tenants(account_id);
CREATE INDEX IF NOT EXISTS idx_deals_account          ON deals(account_id);
CREATE INDEX IF NOT EXISTS idx_invoices_account       ON invoices(account_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_account   ON activity_log(account_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_user      ON activity_log(user_id);

-- ─── ROW LEVEL SECURITY ────────────────────────────────────────────────────

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE construction_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE construction_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Helper function: check if current user is a super admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT is_super_admin FROM user_profiles WHERE id = auth.uid()),
    false
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function: get current user's account_id
CREATE OR REPLACE FUNCTION current_account_id()
RETURNS UUID AS $$
  SELECT account_id FROM user_profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── Drop existing policies for idempotency ──

DO $$ BEGIN
  -- user_profiles
  DROP POLICY IF EXISTS "Super admin sees all profiles" ON user_profiles;
  DROP POLICY IF EXISTS "Users see own account profiles" ON user_profiles;
  DROP POLICY IF EXISTS "Super admin manages all profiles" ON user_profiles;
  DROP POLICY IF EXISTS "Account admin manages own account profiles" ON user_profiles;
  -- accounts
  DROP POLICY IF EXISTS "Super admin sees all accounts" ON accounts;
  DROP POLICY IF EXISTS "Users see own account" ON accounts;
  DROP POLICY IF EXISTS "Super admin manages accounts" ON accounts;
  -- roles
  DROP POLICY IF EXISTS "Super admin sees all roles" ON roles;
  DROP POLICY IF EXISTS "Users see own account roles" ON roles;
  DROP POLICY IF EXISTS "Super admin manages roles" ON roles;
  -- role_permissions
  DROP POLICY IF EXISTS "Super admin sees all permissions" ON role_permissions;
  DROP POLICY IF EXISTS "Users see own account permissions" ON role_permissions;
  DROP POLICY IF EXISTS "Super admin manages permissions" ON role_permissions;
  -- subscription_tiers
  DROP POLICY IF EXISTS "Anyone can read tiers" ON subscription_tiers;
  DROP POLICY IF EXISTS "Super admin manages tiers" ON subscription_tiers;
  -- construction_phases
  DROP POLICY IF EXISTS "Super admin full access on construction_phases" ON construction_phases;
  DROP POLICY IF EXISTS "Tenant isolation on construction_phases" ON construction_phases;
  -- activity_log
  DROP POLICY IF EXISTS "Super admin sees all activity" ON activity_log;
  DROP POLICY IF EXISTS "Users see own account activity" ON activity_log;
END $$;

DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'properties','contractors','construction_projects',
    'tenants','deals','invoices','recurring_tasks'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Super admin full access on %1$s" ON %1$s', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Tenant isolation on %1$s" ON %1$s', tbl);
  END LOOP;
END $$;

-- ── Policies: user_profiles ──

CREATE POLICY "Super admin sees all profiles"
  ON user_profiles FOR SELECT USING (is_super_admin());

CREATE POLICY "Users see own account profiles"
  ON user_profiles FOR SELECT USING (account_id = current_account_id());

CREATE POLICY "Super admin manages all profiles"
  ON user_profiles FOR ALL USING (is_super_admin());

CREATE POLICY "Account admin manages own account profiles"
  ON user_profiles FOR ALL
  USING (account_id = current_account_id() AND (SELECT is_account_admin FROM user_profiles WHERE id = auth.uid()));

-- ── Policies: accounts ──

CREATE POLICY "Super admin sees all accounts"
  ON accounts FOR SELECT USING (is_super_admin());

CREATE POLICY "Users see own account"
  ON accounts FOR SELECT USING (id = current_account_id());

CREATE POLICY "Super admin manages accounts"
  ON accounts FOR ALL USING (is_super_admin());

-- ── Policies: roles ──

CREATE POLICY "Super admin sees all roles"
  ON roles FOR SELECT USING (is_super_admin());

CREATE POLICY "Users see own account roles"
  ON roles FOR SELECT USING (account_id = current_account_id());

CREATE POLICY "Super admin manages roles"
  ON roles FOR ALL USING (is_super_admin());

-- ── Policies: role_permissions ──

CREATE POLICY "Super admin sees all permissions"
  ON role_permissions FOR SELECT USING (is_super_admin());

CREATE POLICY "Users see own account permissions"
  ON role_permissions FOR SELECT
  USING (role_id IN (SELECT id FROM roles WHERE account_id = current_account_id()));

CREATE POLICY "Super admin manages permissions"
  ON role_permissions FOR ALL USING (is_super_admin());

-- ── Policies: subscription_tiers (publicly readable) ──

CREATE POLICY "Anyone can read tiers"
  ON subscription_tiers FOR SELECT USING (true);

CREATE POLICY "Super admin manages tiers"
  ON subscription_tiers FOR ALL USING (is_super_admin());

-- ── Generic multi-tenant policies for data tables ──

DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'properties','contractors','construction_projects',
    'tenants','deals','invoices','recurring_tasks'
  ] LOOP
    EXECUTE format('CREATE POLICY "Super admin full access on %1$s" ON %1$s FOR ALL USING (is_super_admin())', tbl);
    EXECUTE format('CREATE POLICY "Tenant isolation on %1$s" ON %1$s FOR ALL USING (account_id = current_account_id())', tbl);
  END LOOP;
END $$;

-- construction_phases inherits through project
CREATE POLICY "Super admin full access on construction_phases"
  ON construction_phases FOR ALL USING (is_super_admin());

CREATE POLICY "Tenant isolation on construction_phases"
  ON construction_phases FOR ALL
  USING (project_id IN (SELECT id FROM construction_projects WHERE account_id = current_account_id()));

-- activity_log
CREATE POLICY "Super admin sees all activity"
  ON activity_log FOR SELECT USING (is_super_admin());

CREATE POLICY "Users see own account activity"
  ON activity_log FOR SELECT USING (account_id = current_account_id());

-- ─── TRIGGER: auto-set updated_at ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_accounts_updated_at ON accounts;
CREATE TRIGGER set_accounts_updated_at
  BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER set_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── TRIGGER: auto-create user profile on auth signup ──────────────────────

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.raw_user_meta_data->>'account_id' IS NOT NULL THEN
    INSERT INTO user_profiles (id, email, full_name, account_id, role_id)
    VALUES (
      NEW.id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
      (NEW.raw_user_meta_data->>'account_id')::UUID,
      NULLIF(NEW.raw_user_meta_data->>'role_id', '')::UUID
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED: Create a default Super Admin account + role
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO accounts (id, name, plan_tier, status, billing_email, max_users, allowed_departments)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'CHG Internal',
  'enterprise',
  'active',
  'admin@clevelandholding.com',
  9999,
  ARRAY['acquisitions','construction','property_management','contractors','finance','tasks']
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO roles (id, name, account_id, is_system)
VALUES (
  '00000000-0000-0000-0000-000000000010',
  'Super Admin',
  '00000000-0000-0000-0000-000000000001',
  true
)
ON CONFLICT (id) DO NOTHING;

-- Give Super Admin role full permissions on all departments
INSERT INTO role_permissions (role_id, department, permission_level)
VALUES
  ('00000000-0000-0000-0000-000000000010', 'acquisitions', 'edit'),
  ('00000000-0000-0000-0000-000000000010', 'construction', 'edit'),
  ('00000000-0000-0000-0000-000000000010', 'property_management', 'edit'),
  ('00000000-0000-0000-0000-000000000010', 'contractors', 'edit'),
  ('00000000-0000-0000-0000-000000000010', 'finance', 'edit'),
  ('00000000-0000-0000-0000-000000000010', 'tasks', 'edit')
ON CONFLICT (role_id, department) DO NOTHING;

-- Link existing data to CHG Internal account
UPDATE properties           SET account_id = '00000000-0000-0000-0000-000000000001' WHERE account_id IS NULL;
UPDATE contractors          SET account_id = '00000000-0000-0000-0000-000000000001' WHERE account_id IS NULL;
UPDATE construction_projects SET account_id = '00000000-0000-0000-0000-000000000001' WHERE account_id IS NULL;
UPDATE tenants              SET account_id = '00000000-0000-0000-0000-000000000001' WHERE account_id IS NULL;
UPDATE deals                SET account_id = '00000000-0000-0000-0000-000000000001' WHERE account_id IS NULL;
UPDATE recurring_tasks      SET account_id = '00000000-0000-0000-0000-000000000001' WHERE account_id IS NULL;
UPDATE invoices             SET account_id = '00000000-0000-0000-0000-000000000001' WHERE account_id IS NULL;

-- ─── ENFORCE NOT NULL on account_id after migration ────────────────────────
-- Run these AFTER all existing data has been assigned to an account above.
ALTER TABLE properties           ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE contractors          ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE construction_projects ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE tenants              ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE deals                ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE recurring_tasks      ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE invoices             ALTER COLUMN account_id SET NOT NULL;
