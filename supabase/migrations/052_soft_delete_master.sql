-- ============================================================
-- 052_soft_delete_master.sql — soft delete for the Master lists
-- ============================================================
-- Deleting a clinic, branch, doctor, clinic admin, service or role no
-- longer removes the row. It gets `deleted_at` (and is switched off), the
-- app hides it from every list and lookup, and anything that pointed at it
-- (appointments, history) keeps working.
--
-- To bring one back, in the SQL editor:
--   UPDATE doctors SET deleted_at = NULL, is_active = TRUE WHERE id = '...';
--
-- Run after 051. Safe to run more than once.

ALTER TABLE clinics       ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE branches      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE doctors       ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE clinic_admins ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE services      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE designations  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Lists only ever read the live rows.
CREATE INDEX IF NOT EXISTS clinics_live_idx       ON clinics (account_id)       WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS branches_live_idx      ON branches (account_id)      WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS doctors_live_idx       ON doctors (account_id)       WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS clinic_admins_live_idx ON clinic_admins (account_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS services_live_idx      ON services (account_id)      WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS designations_live_idx  ON designations (account_id)  WHERE deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';
