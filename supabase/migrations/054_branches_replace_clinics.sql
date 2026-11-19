-- ============================================================
-- 054_branches_replace_clinics.sql — one clinic, many branches
-- ============================================================
-- Each install serves one clinic (its name and logo are the account's
-- branding), so Master → Clinics is gone. What used to point at a clinic
-- now points at a branch:
--
--   doctors.branch_id         where the doctor works
--   clinic_admins.branch_id   which branch they look after
--   profiles.branch_id        a member's branch (Master → Users)
--   appointments.branch_id    where the appointment is
--
-- Existing links are carried over where it's unambiguous: a row whose
-- clinic has exactly one branch gets that branch. Anything else is left
-- empty for you to set. The clinics table and clinic_id columns stay (the
-- AI gateway from 045 still reads them) but the app no longer uses them.
--
-- Run after 053. Safe to run more than once.

ALTER TABLE doctors       ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE clinic_admins ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE profiles      ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE appointments  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_doctors_branch       ON doctors(branch_id);
CREATE INDEX IF NOT EXISTS idx_clinic_admins_branch ON clinic_admins(branch_id);
CREATE INDEX IF NOT EXISTS idx_profiles_branch      ON profiles(branch_id);
CREATE INDEX IF NOT EXISTS idx_appointments_branch  ON appointments(account_id, branch_id);

-- Carry over clinic → its only branch.
WITH only_branch AS (
  SELECT clinic_id, (array_agg(id))[1] AS branch_id
  FROM branches
  WHERE clinic_id IS NOT NULL AND deleted_at IS NULL
  GROUP BY clinic_id
  HAVING COUNT(*) = 1
)
UPDATE doctors t SET branch_id = o.branch_id
FROM only_branch o WHERE t.clinic_id = o.clinic_id AND t.branch_id IS NULL;

WITH only_branch AS (
  SELECT clinic_id, (array_agg(id))[1] AS branch_id
  FROM branches
  WHERE clinic_id IS NOT NULL AND deleted_at IS NULL
  GROUP BY clinic_id
  HAVING COUNT(*) = 1
)
UPDATE clinic_admins t SET branch_id = o.branch_id
FROM only_branch o WHERE t.clinic_id = o.clinic_id AND t.branch_id IS NULL;

WITH only_branch AS (
  SELECT clinic_id, (array_agg(id))[1] AS branch_id
  FROM branches
  WHERE clinic_id IS NOT NULL AND deleted_at IS NULL
  GROUP BY clinic_id
  HAVING COUNT(*) = 1
)
UPDATE appointments t SET branch_id = o.branch_id
FROM only_branch o WHERE t.clinic_id = o.clinic_id AND t.branch_id IS NULL;

-- profiles has a guard trigger (044) that blocks members changing their
-- own privilege columns; this runs as the table owner, so it passes.
WITH only_branch AS (
  SELECT clinic_id, (array_agg(id))[1] AS branch_id
  FROM branches
  WHERE clinic_id IS NOT NULL AND deleted_at IS NULL
  GROUP BY clinic_id
  HAVING COUNT(*) = 1
)
UPDATE profiles t SET branch_id = o.branch_id
FROM only_branch o WHERE t.clinic_id = o.clinic_id AND t.branch_id IS NULL;

-- branch_id joins the columns a member may not change on their own profile.
CREATE OR REPLACE FUNCTION public.enforce_profile_privilege_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.account_role IS DISTINCT FROM OLD.account_role
      OR NEW.account_id IS DISTINCT FROM OLD.account_id
      OR NEW.designation_id IS DISTINCT FROM OLD.designation_id
      OR NEW.clinic_id IS DISTINCT FROM OLD.clinic_id
      OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
      OR NEW.staff_type IS DISTINCT FROM OLD.staff_type)
     AND current_user = 'authenticated'
  THEN
    RAISE EXCEPTION
      'account_role, account_id, designation_id, clinic_id, branch_id and staff_type cannot be changed directly; use the account member APIs'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.enforce_profile_privilege_columns() OWNER TO postgres;

NOTIFY pgrst, 'reload schema';
