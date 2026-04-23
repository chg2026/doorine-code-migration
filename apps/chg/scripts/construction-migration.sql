-- ═══════════════════════════════════════════════════════════════════════════
-- CHG CRM — Construction Module Migration
-- Run this in Supabase Dashboard → SQL Editor
--
-- Adds the foundation for the Construction overhaul:
--   • units (per-property units)
--   • master_phases (per-account customizable phase library, seeded with 19
--     standard phases)
--   • addendums (scope/budget/timeline change requests w/ approval workflow)
--   • project_notes (rich-text feed inside project dashboard)
--   • project_activity (read-only auto-generated audit log)
--
-- Extends existing tables with the new columns required by the spec:
--   • properties        → name, street, state, zip, photo_url, purchase_date
--   • construction_projects → unit_id, description, agreement_url, w9_url,
--                              insurance_url
--   • construction_phases   → contractor_id, labor_budget, materials_budget,
--                              labor_spent, materials_spent, status,
--                              payment_approved, checklist_complete,
--                              estimated_start, estimated_completion,
--                              sort_order
--   • invoices          → phase_id, project_id, invoice_date, invoice_number,
--                          category, notes, submitted_by
--   • contractors       → contact_name, w9_url, insurance_url,
--                          insurance_expiry, notes
--
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── EXTEND PROPERTIES ────────────────────────────────────────────────────────
ALTER TABLE properties ADD COLUMN IF NOT EXISTS name          TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS street        TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS state         TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS zip           TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS photo_url     TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS purchase_date DATE;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- ─── EXTEND CONTRACTORS ───────────────────────────────────────────────────────
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS contact_name      TEXT;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS w9_url            TEXT;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS insurance_url     TEXT;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS insurance_expiry  DATE;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS notes             TEXT;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS performance_score INTEGER CHECK (performance_score BETWEEN 1 AND 10);
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS w9_status         TEXT DEFAULT 'missing' CHECK (w9_status IN ('on_file','expired','missing'));
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS agreement_signed  BOOLEAN DEFAULT FALSE;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS company_name      TEXT;

-- ─── UNITS ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS units (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_units_property ON units(property_id);
CREATE INDEX IF NOT EXISTS idx_units_account  ON units(account_id);

-- ─── MASTER PHASES (per-account customizable library) ─────────────────────────
CREATE TABLE IF NOT EXISTS master_phases (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  sort_order  INTEGER DEFAULT 0,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_id, name)
);

CREATE INDEX IF NOT EXISTS idx_master_phases_account ON master_phases(account_id);

-- ─── EXTEND CONSTRUCTION_PROJECTS ─────────────────────────────────────────────
ALTER TABLE construction_projects ADD COLUMN IF NOT EXISTS unit_id        UUID REFERENCES units(id) ON DELETE SET NULL;
ALTER TABLE construction_projects ADD COLUMN IF NOT EXISTS description    TEXT;
ALTER TABLE construction_projects ADD COLUMN IF NOT EXISTS agreement_url  TEXT;
ALTER TABLE construction_projects ADD COLUMN IF NOT EXISTS w9_url         TEXT;
ALTER TABLE construction_projects ADD COLUMN IF NOT EXISTS insurance_url  TEXT;
ALTER TABLE construction_projects ADD COLUMN IF NOT EXISTS created_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE construction_projects ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_projects_unit ON construction_projects(unit_id);

-- ─── EXTEND CONSTRUCTION_PHASES ───────────────────────────────────────────────
-- The spec calls these "phases". We keep the existing table name for backward
-- compatibility and extend it with all required columns.
ALTER TABLE construction_phases ADD COLUMN IF NOT EXISTS contractor_id        UUID REFERENCES contractors(id) ON DELETE SET NULL;
ALTER TABLE construction_phases ADD COLUMN IF NOT EXISTS labor_budget         NUMERIC DEFAULT 0;
ALTER TABLE construction_phases ADD COLUMN IF NOT EXISTS materials_budget     NUMERIC DEFAULT 0;
ALTER TABLE construction_phases ADD COLUMN IF NOT EXISTS labor_spent          NUMERIC DEFAULT 0;
ALTER TABLE construction_phases ADD COLUMN IF NOT EXISTS materials_spent      NUMERIC DEFAULT 0;
ALTER TABLE construction_phases ADD COLUMN IF NOT EXISTS status               TEXT DEFAULT 'not_started';
ALTER TABLE construction_phases ADD COLUMN IF NOT EXISTS payment_approved     BOOLEAN DEFAULT false;
ALTER TABLE construction_phases ADD COLUMN IF NOT EXISTS checklist_complete   BOOLEAN DEFAULT false;
ALTER TABLE construction_phases ADD COLUMN IF NOT EXISTS estimated_start      DATE;
ALTER TABLE construction_phases ADD COLUMN IF NOT EXISTS estimated_completion DATE;
ALTER TABLE construction_phases ADD COLUMN IF NOT EXISTS sort_order           INTEGER DEFAULT 0;
ALTER TABLE construction_phases ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMPTZ DEFAULT NOW();

-- ─── EXTEND INVOICES ──────────────────────────────────────────────────────────
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS project_id     UUID REFERENCES construction_projects(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS phase_id       UUID REFERENCES construction_phases(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_date   DATE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_number TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS category       TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS notes          TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS submitted_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS file_url       TEXT;

CREATE INDEX IF NOT EXISTS idx_invoices_project ON invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_invoices_phase   ON invoices(phase_id);

-- ─── ADDENDUMS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS addendums (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id              UUID NOT NULL REFERENCES construction_projects(id) ON DELETE CASCADE,
  account_id              UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  title                   TEXT NOT NULL,
  description             TEXT,
  change_types            TEXT[] DEFAULT ARRAY[]::TEXT[],
  budget_delta_labor      NUMERIC DEFAULT 0,
  budget_delta_materials  NUMERIC DEFAULT 0,
  proposed_delivery_date  DATE,
  document_url            TEXT,
  status                  TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  requested_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  request_date            TIMESTAMPTZ DEFAULT NOW(),
  reviewed_by             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  review_date             TIMESTAMPTZ,
  review_comment          TEXT,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_addendums_project ON addendums(project_id);
CREATE INDEX IF NOT EXISTS idx_addendums_account ON addendums(account_id);
CREATE INDEX IF NOT EXISTS idx_addendums_status  ON addendums(status);

-- ─── PROJECT NOTES (feed) ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES construction_projects(id) ON DELETE CASCADE,
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  note_type   TEXT DEFAULT 'note',         -- note | update | reminder | issue | meeting
  visibility  TEXT DEFAULT 'all',          -- all | admin
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_notes_project ON project_notes(project_id);
CREATE INDEX IF NOT EXISTS idx_project_notes_account ON project_notes(account_id);

-- ─── PROJECT ACTIVITY (auto-generated audit log) ──────────────────────────────
CREATE TABLE IF NOT EXISTS project_activity (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES construction_projects(id) ON DELETE CASCADE,
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,               -- project_created | completion_updated | invoice_logged | ...
  description TEXT NOT NULL,
  metadata    JSONB DEFAULT '{}',
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_activity_project ON project_activity(project_id);
CREATE INDEX IF NOT EXISTS idx_project_activity_account ON project_activity(account_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE units            ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_phases    ENABLE ROW LEVEL SECURITY;
ALTER TABLE addendums        ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_notes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_activity ENABLE ROW LEVEL SECURITY;

-- Drop any pre-existing policies for idempotency
DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['units','master_phases','addendums','project_notes','project_activity'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Super admin full access on %1$s" ON %1$s', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Tenant isolation on %1$s" ON %1$s', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Tenant read on %1$s" ON %1$s', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Tenant insert on %1$s" ON %1$s', tbl);
  END LOOP;
END $$;

-- Standard tenant isolation pattern (full CRUD) for mutable tables
DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['units','master_phases','addendums','project_notes'] LOOP
    EXECUTE format('CREATE POLICY "Super admin full access on %1$s" ON %1$s FOR ALL USING (is_super_admin())', tbl);
    EXECUTE format('CREATE POLICY "Tenant isolation on %1$s" ON %1$s FOR ALL USING (account_id = current_account_id())', tbl);
  END LOOP;
END $$;

-- project_activity is an APPEND-ONLY audit log:
--   • Super admin can read everything (no mutation needed via UI)
--   • Tenant users can read their own account's entries
--   • Tenant users can insert (so the app can write events under the user's session)
--   • No UPDATE or DELETE policies → these operations are denied for non-service roles
--   • The service_role key bypasses RLS entirely, so backend cleanup jobs still work
CREATE POLICY "Super admin full access on project_activity"
  ON project_activity FOR SELECT USING (is_super_admin());

CREATE POLICY "Tenant read on project_activity"
  ON project_activity FOR SELECT USING (account_id = current_account_id());

CREATE POLICY "Tenant insert on project_activity"
  ON project_activity FOR INSERT WITH CHECK (account_id = current_account_id());

-- Belt-and-suspenders: hard-block UPDATE/DELETE at the trigger level for any
-- non-service role that somehow bypasses missing policies.
CREATE OR REPLACE FUNCTION block_project_activity_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'project_activity is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS no_update_project_activity ON project_activity;
CREATE TRIGGER no_update_project_activity
  BEFORE UPDATE ON project_activity
  FOR EACH ROW EXECUTE FUNCTION block_project_activity_mutation();

DROP TRIGGER IF EXISTS no_delete_project_activity ON project_activity;
CREATE TRIGGER no_delete_project_activity
  BEFORE DELETE ON project_activity
  FOR EACH ROW EXECUTE FUNCTION block_project_activity_mutation();

-- ═══════════════════════════════════════════════════════════════════════════
-- updated_at TRIGGERS (set_updated_at function defined in saas-migration.sql)
-- ═══════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS set_units_updated_at ON units;
CREATE TRIGGER set_units_updated_at BEFORE UPDATE ON units
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_construction_projects_updated_at ON construction_projects;
CREATE TRIGGER set_construction_projects_updated_at BEFORE UPDATE ON construction_projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_construction_phases_updated_at ON construction_phases;
CREATE TRIGGER set_construction_phases_updated_at BEFORE UPDATE ON construction_phases
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_addendums_updated_at ON addendums;
CREATE TRIGGER set_addendums_updated_at BEFORE UPDATE ON addendums
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_project_notes_updated_at ON project_notes;
CREATE TRIGGER set_project_notes_updated_at BEFORE UPDATE ON project_notes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- MASTER PHASE LIBRARY — seed 19 standard phases per account
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION seed_master_phases_for_account(target_account UUID)
RETURNS VOID AS $$
DECLARE
  phase_names TEXT[] := ARRAY[
    'Demolition','Framing','Rough Electrical','Rough Plumbing','HVAC',
    'Insulation','Drywall','Finish Electrical','Finish Plumbing','Flooring',
    'Painting','Trim & Doors','Kitchen & Cabinets','Bathroom','Windows',
    'Exterior','Landscaping','Final Walkthrough','Punch List'
  ];
  i INTEGER;
BEGIN
  FOR i IN 1..array_length(phase_names, 1) LOOP
    INSERT INTO master_phases (account_id, name, sort_order, is_active)
    VALUES (target_account, phase_names[i], i, true)
    ON CONFLICT (account_id, name) DO NOTHING;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Seed the 19 phases for every existing account
DO $$
DECLARE acct RECORD;
BEGIN
  FOR acct IN SELECT id FROM accounts LOOP
    PERFORM seed_master_phases_for_account(acct.id);
  END LOOP;
END $$;

-- Auto-seed on new account creation
CREATE OR REPLACE FUNCTION handle_new_account_master_phases()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM seed_master_phases_for_account(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_account_created_seed_phases ON accounts;
CREATE TRIGGER on_account_created_seed_phases
  AFTER INSERT ON accounts
  FOR EACH ROW EXECUTE FUNCTION handle_new_account_master_phases();

-- ═══════════════════════════════════════════════════════════════════════════
-- BACKFILL — give every existing single-property at least 1 unit
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO units (property_id, account_id, label, sort_order)
SELECT p.id, p.account_id, 'Unit 1', 0
FROM properties p
WHERE NOT EXISTS (SELECT 1 FROM units u WHERE u.property_id = p.id)
  AND p.account_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- STORAGE BUCKET — project-documents
-- ═══════════════════════════════════════════════════════════════════════════
-- Files are organized as:  <account_id>/<project_id>/<filename>
-- RLS policies use the first path segment as the account scope.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public)
VALUES ('project-documents', 'project-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies for idempotency
DROP POLICY IF EXISTS "Super admin all access on project-documents"     ON storage.objects;
DROP POLICY IF EXISTS "Account members read project-documents"          ON storage.objects;
DROP POLICY IF EXISTS "Account members upload project-documents"        ON storage.objects;
DROP POLICY IF EXISTS "Account members update project-documents"        ON storage.objects;
DROP POLICY IF EXISTS "Account members delete project-documents"        ON storage.objects;

CREATE POLICY "Super admin all access on project-documents"
  ON storage.objects FOR ALL
  USING (bucket_id = 'project-documents' AND is_super_admin());

CREATE POLICY "Account members read project-documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'project-documents'
    AND (storage.foldername(name))[1]::uuid = current_account_id()
  );

CREATE POLICY "Account members upload project-documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'project-documents'
    AND (storage.foldername(name))[1]::uuid = current_account_id()
  );

CREATE POLICY "Account members update project-documents"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'project-documents'
    AND (storage.foldername(name))[1]::uuid = current_account_id()
  );

CREATE POLICY "Account members delete project-documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'project-documents'
    AND (storage.foldername(name))[1]::uuid = current_account_id()
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- TASK 10: extend recurring_tasks so notes can convert into real tasks /
-- reminders linked to a project, assigned to a teammate, with a real due date
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE recurring_tasks ADD COLUMN IF NOT EXISTS project_id   UUID REFERENCES construction_projects(id) ON DELETE SET NULL;
ALTER TABLE recurring_tasks ADD COLUMN IF NOT EXISTS description  TEXT;
ALTER TABLE recurring_tasks ADD COLUMN IF NOT EXISTS due_date     DATE;
ALTER TABLE recurring_tasks ADD COLUMN IF NOT EXISTS type         TEXT DEFAULT 'task'; -- task | reminder
ALTER TABLE recurring_tasks ADD COLUMN IF NOT EXISTS assigned_to  UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE recurring_tasks ADD COLUMN IF NOT EXISTS source_note_id UUID REFERENCES project_notes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_recurring_tasks_project  ON recurring_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_recurring_tasks_assigned ON recurring_tasks(assigned_to);
