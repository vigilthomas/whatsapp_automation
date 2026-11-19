-- ============================================================
-- 055_buffer_doctor_services_leaves.sql
-- ============================================================
-- 0. services.price becomes optional.
-- 1. services.buffer_min — minutes kept free around each appointment of
--    the service (cleaning, notes). Half goes before, half after, so two
--    back-to-back visits are one full buffer apart.
-- 2. doctor_services — which doctor offers which service (Master →
--    Doctor services). A service with no rows here can be booked with any
--    doctor, so nothing changes until you add some.
-- 3. user_leaves — days a user is away (Master → Leaves). A doctor on
--    leave isn't offered for booking on those days.
--
-- New lists follow the house rule: edit, soft delete (deleted_at) and an
-- on/off switch (is_active). Same RLS as the other master tables (043):
-- members read, admins write; the app writes through the API.
--
-- Run after 054. Safe to run more than once.

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS buffer_min INTEGER NOT NULL DEFAULT 0 CHECK (buffer_min >= 0 AND buffer_min <= 240);

-- Price is optional now: a service can be listed without one.
ALTER TABLE services ALTER COLUMN price DROP NOT NULL;
ALTER TABLE services ALTER COLUMN price DROP DEFAULT;

CREATE TABLE IF NOT EXISTS doctor_services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- One live link per doctor + service.
CREATE UNIQUE INDEX IF NOT EXISTS doctor_services_live_uq
  ON doctor_services (doctor_id, service_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS doctor_services_account_idx
  ON doctor_services (account_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS user_leaves (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  reason TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_leaves_dates CHECK (ends_on >= starts_on)
);
CREATE INDEX IF NOT EXISTS user_leaves_account_idx
  ON user_leaves (account_id, starts_on, ends_on) WHERE deleted_at IS NULL;

DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['doctor_services', 'user_leaves'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_select', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_insert', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_update', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_delete', tbl);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (is_account_member(account_id))', tbl || '_select', tbl);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (is_account_member(account_id, ''admin''))', tbl || '_insert', tbl);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (is_account_member(account_id, ''admin''))', tbl || '_update', tbl);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (is_account_member(account_id, ''admin''))', tbl || '_delete', tbl);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
