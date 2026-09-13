-- ============================================================
-- 038_clinic_master_data
--
-- Clinic master data: clinics, the doctors who work at them, and the
-- clinic-side admin contacts. Plain account-scoped records — no login
-- or role of their own yet; they are reference data that later
-- features (appointments, prescriptions, per-clinic WhatsApp
-- routing) will point at. Managed under the sidebar's Master group
-- via /api/master/<entity>.
--
-- Tenancy: every row carries `account_id`, like every other domain
-- table. `clinic_id` on doctors / clinic_admins is optional and
-- SET NULL on clinic delete so removing a clinic never silently
-- deletes people records.
--
-- RLS: any member reads; admin+ writes. Master data is configuration
-- (it shapes what agents can pick from), so it follows the same
-- admin-gated model as templates and tags rather than the agent-
-- gated one quick replies use.
-- ============================================================

-- 1. clinics ----------------------------------------------------
CREATE TABLE IF NOT EXISTS clinics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clinics_account ON clinics(account_id);

-- 2. doctors ----------------------------------------------------
CREATE TABLE IF NOT EXISTS doctors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  clinic_id UUID REFERENCES clinics(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  speciality TEXT,
  phone TEXT,
  email TEXT,
  whatsapp_number TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doctors_account ON doctors(account_id);
CREATE INDEX IF NOT EXISTS idx_doctors_clinic ON doctors(clinic_id);

-- 3. clinic_admins ----------------------------------------------
CREATE TABLE IF NOT EXISTS clinic_admins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  clinic_id UUID REFERENCES clinics(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clinic_admins_account ON clinic_admins(account_id);
CREATE INDEX IF NOT EXISTS idx_clinic_admins_clinic ON clinic_admins(clinic_id);

-- 4. RLS + updated_at, identical shape for all three ------------
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['clinics', 'doctors', 'clinic_admins'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_select', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_insert', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_update', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_delete', tbl);

    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT USING (is_account_member(account_id))',
      tbl || '_select', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT WITH CHECK (is_account_member(account_id, ''admin''))',
      tbl || '_insert', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR UPDATE USING (is_account_member(account_id, ''admin''))',
      tbl || '_update', tbl);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR DELETE USING (is_account_member(account_id, ''admin''))',
      tbl || '_delete', tbl);

    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON %I', tbl);
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
      tbl);
  END LOOP;
END $$;
