-- ============================================================
-- 070_profile_login_disabled
--
-- Login on/off for a member (Master → Users, and the Login switch on
-- Master → Doctors). The block itself is a Supabase Auth ban
-- (auth.admin.updateUserById ban_duration), which stops sign-in and
-- token refresh; this column mirrors it so the lists can show
-- "Login disabled" without an Auth admin call per row.
--
-- login_disabled joins the privilege columns: a member must not be
-- able to clear it on their own profile. The members API writes it
-- with service_role.
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS login_disabled BOOLEAN NOT NULL DEFAULT false;

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
      OR NEW.staff_type IS DISTINCT FROM OLD.staff_type
      OR NEW.login_disabled IS DISTINCT FROM OLD.login_disabled)
     AND current_user = 'authenticated'
  THEN
    RAISE EXCEPTION
      'account_role, account_id, designation_id, clinic_id, branch_id, staff_type and login_disabled cannot be changed directly; use the account member APIs'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.enforce_profile_privilege_columns() OWNER TO postgres;

NOTIFY pgrst, 'reload schema';
