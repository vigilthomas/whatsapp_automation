-- ============================================================
-- 042_appointments
--
-- Clinic appointments — the calendar behind /appointments and the
-- dashboard's "today" widgets. A patient (a `contacts` row) sees a
-- doctor at a clinic for a service, at a time, with a status that
-- moves scheduled → confirmed → completed (or cancelled / no_show).
--
-- `source` records who created it: staff by hand, the AI assistant,
-- or an inbound WhatsApp flow — the dashboard's "booked by AI" count
-- reads it. Free-text `service` for now; a services master table can
-- replace it later without touching this row shape.
--
-- Tenancy: `account_id` on every row, like everything else. Doctor and
-- clinic FKs are SET NULL so removing a doctor never deletes history;
-- the patient FK cascades because an appointment without a patient
-- is meaningless.
--
-- RLS: any member reads; agent+ writes (operational data, same tier
-- as quick replies and conversations — not admin-gated config).
-- ============================================================

CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  clinic_id UUID REFERENCES clinics(id) ON DELETE SET NULL,
  doctor_id UUID REFERENCES doctors(id) ON DELETE SET NULL,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  service TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')),
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'ai', 'whatsapp')),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT appointments_time_order CHECK (ends_at > starts_at)
);

-- The calendar always queries one account × one time window; the
-- dashboard adds a doctor split on top.
CREATE INDEX IF NOT EXISTS idx_appointments_account_starts
  ON appointments(account_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_starts
  ON appointments(doctor_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_appointments_contact
  ON appointments(contact_id);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS appointments_select ON appointments;
DROP POLICY IF EXISTS appointments_insert ON appointments;
DROP POLICY IF EXISTS appointments_update ON appointments;
DROP POLICY IF EXISTS appointments_delete ON appointments;
CREATE POLICY appointments_select ON appointments FOR SELECT
  USING (is_account_member(account_id));
CREATE POLICY appointments_insert ON appointments FOR INSERT
  WITH CHECK (is_account_member(account_id, 'agent'));
CREATE POLICY appointments_update ON appointments FOR UPDATE
  USING (is_account_member(account_id, 'agent'));
CREATE POLICY appointments_delete ON appointments FOR DELETE
  USING (is_account_member(account_id, 'agent'));

DROP TRIGGER IF EXISTS set_updated_at ON appointments;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
