-- CHG CRM Database Schema
-- Run this in Supabase Dashboard → SQL Editor

-- ─── PROPERTIES ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS properties (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address          TEXT NOT NULL,
  city             TEXT,
  property_type    TEXT DEFAULT 'single_family',
  unit_count       INTEGER DEFAULT 1,
  status           TEXT DEFAULT 'vacant',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE properties ADD COLUMN IF NOT EXISTS property_type    TEXT DEFAULT 'single_family';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS type             TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS unit_count       INTEGER DEFAULT 1;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS status           TEXT DEFAULT 'vacant';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS purchase_price   NUMERIC;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS acquisition_date DATE;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS insurance_policy TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS monthly_rent     NUMERIC;

-- ─── CONTRACTORS ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contractors (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  trade             TEXT,
  phone             TEXT,
  email             TEXT,
  w9_status         TEXT,
  agreement_signed  BOOLEAN DEFAULT false,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE contractors ADD COLUMN IF NOT EXISTS w9_status        TEXT;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS agreement_signed BOOLEAN DEFAULT false;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS email            TEXT;

-- ─── CONSTRUCTION PROJECTS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS construction_projects (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id       UUID REFERENCES properties(id) ON DELETE CASCADE,
  contractor_id     UUID REFERENCES contractors(id),
  name              TEXT,
  labor_budget      NUMERIC DEFAULT 0,
  material_budget   NUMERIC DEFAULT 0,
  labor_spent       NUMERIC DEFAULT 0,
  material_spent    NUMERIC DEFAULT 0,
  overall_pct       INTEGER DEFAULT 0,
  status            TEXT DEFAULT 'active',
  start_date        DATE,
  target_completion DATE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE construction_projects ADD COLUMN IF NOT EXISTS name              TEXT;
ALTER TABLE construction_projects ADD COLUMN IF NOT EXISTS start_date        DATE;
ALTER TABLE construction_projects ADD COLUMN IF NOT EXISTS target_completion DATE;

-- ─── CONSTRUCTION PHASES ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS construction_phases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID REFERENCES construction_projects(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  completion_pct  INTEGER DEFAULT 0,
  budget          NUMERIC DEFAULT 0,
  amount_spent    NUMERIC DEFAULT 0,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE construction_phases ADD COLUMN IF NOT EXISTS budget       NUMERIC DEFAULT 0;
ALTER TABLE construction_phases ADD COLUMN IF NOT EXISTS amount_spent NUMERIC DEFAULT 0;
ALTER TABLE construction_phases ADD COLUMN IF NOT EXISTS notes        TEXT;

-- ─── TENANTS ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id      UUID REFERENCES properties(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  unit             TEXT,
  rent_amount      NUMERIC DEFAULT 0,
  payment_status   TEXT DEFAULT 'current',
  late_fee_count   INTEGER DEFAULT 0,
  current_late_fee NUMERIC DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─── DEALS ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS deals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address           TEXT NOT NULL,
  asking_price      NUMERIC,
  arv               NUMERIC,
  labor_estimate    NUMERIC,
  material_estimate NUMERIC,
  roi_estimate      NUMERIC,
  source            TEXT,
  opportunity_level TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─── RECURRING TASKS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recurring_tasks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id         UUID REFERENCES properties(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  status              TEXT DEFAULT 'pending',
  due_day             INTEGER,
  confirmation_number TEXT,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── INVOICES ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id    UUID REFERENCES properties(id) ON DELETE CASCADE,
  vendor         TEXT,
  amount         NUMERIC DEFAULT 0,
  classification TEXT DEFAULT 'expense',
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
