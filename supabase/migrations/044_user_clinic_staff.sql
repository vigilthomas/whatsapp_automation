-- ============================================================
-- 044_user_clinic_staff
--
-- Users belong to a clinic. Master → Users lets a clinic admin add a
-- doctor / assistant / other staff member directly (name, email,
-- password, clinic, designation) instead of sending an invite link.
--
--   profiles.clinic_id   — which clinic (041) the member works at.
--   profiles.staff_type  — 'doctor' | 'assistant' | 'other'; a doctor
--                          also gets a `doctors` row so appointments
--                          can be booked against them.
--   doctors.user_id      — back-link from the doctors record to the
--                          login, when the doctor is a user.
--
-- `clinic_id` and `staff_type` join the privilege columns guarded by
-- the 034/043 trigger: a member must not move themselves between
-- clinics or promote themselves to doctor through the self-service
-- profile UPDATE. The members API writes them via service_role.
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS staff_type TEXT
    CHECK (staff_type IS NULL OR staff_type IN ('doctor', 'assistant', 'other'));
CREATE INDEX IF NOT EXISTS idx_profiles_clinic ON profiles(clinic_id);

ALTER TABLE doctors
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_doctors_user ON doctors(user_id);

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
      OR NEW.staff_type IS DISTINCT FROM OLD.staff_type)
     AND current_user = 'authenticated'
  THEN
    RAISE EXCEPTION
      'account_role, account_id, designation_id, clinic_id and staff_type cannot be changed directly; use the account member APIs'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.enforce_profile_privilege_columns() OWNER TO postgres;

DROP TRIGGER IF EXISTS enforce_profile_privilege_columns ON public.profiles;
CREATE TRIGGER enforce_profile_privilege_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_privilege_columns();
