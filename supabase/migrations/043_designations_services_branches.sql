-- ============================================================
-- 043_designations_services_branches
--
-- Three more master-data tables plus designation-based access control.
--
--   designations  — job titles (Receptionist, Dentist, …) that carry a
--                   `permissions` list: per module, which of view /
--                   read / write / delete / export the holder may do,
--                   in the order they see the modules. Access control
--                   is "pick a designation, tick cells, arrange rows".
--   services      — what a clinic offers: name, duration, price.
--   branches      — locations of a clinic.
--
-- `profiles.designation_id` links a member to a designation. Effective
-- permissions = the designation's matrix when set; otherwise a role
-- default (owner/admin everything, agent read+write+export, viewer
-- read) minus the per-role module deny-list from 040. Both the UI and
-- the API routes check the same matrix — see src/lib/auth/permissions.ts.
--
-- Security: `designation_id` is a privilege column exactly like
-- `account_role` — a user must not be able to hand themselves a more
-- permissive designation through the self-service profile UPDATE the
-- 017 RLS policy allows. The 034 trigger already blocks
-- `authenticated` from touching account_role / account_id; this
-- migration extends it to `designation_id`. Legitimate writers (the
-- members API via service_role) are unaffected.
--
-- RLS: any member reads; admin+ writes — same tier as templates/tags.
-- ============================================================

-- 1. designations -------------------------------------------------
CREATE TABLE IF NOT EXISTS designations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  -- Ordered array — the order is the holder's sidebar order:
  --   [{"module":"appointments","actions":["view","read","write"]}, ...]
  -- A module absent from it is fully denied. Validated app-side.
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT designations_permissions_is_array CHECK (jsonb_typeof(permissions) = 'array')
);
CREATE INDEX IF NOT EXISTS idx_designations_account ON designations(account_id);

-- 2. services -----------------------------------------------------
CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  duration_min INTEGER NOT NULL DEFAULT 30 CHECK (duration_min > 0),
  -- Priced in the account's default_currency (021).
  price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_services_account ON services(account_id);

-- 3. branches -----------------------------------------------------
CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  clinic_id UUID REFERENCES clinics(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  phone TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_branches_account ON branches(account_id);
CREATE INDEX IF NOT EXISTS idx_branches_clinic ON branches(clinic_id);

-- 4. RLS + updated_at, same shape as 041 --------------------------
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['designations', 'services', 'branches'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_select', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_insert', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_update', tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', tbl || '_delete', tbl);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (is_account_member(account_id))', tbl || '_select', tbl);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (is_account_member(account_id, ''admin''))', tbl || '_insert', tbl);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (is_account_member(account_id, ''admin''))', tbl || '_update', tbl);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (is_account_member(account_id, ''admin''))', tbl || '_delete', tbl);
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON %I', tbl);
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', tbl);
  END LOOP;
END $$;

-- 5. profiles.designation_id + privilege guard -------------------
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS designation_id UUID REFERENCES designations(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_designation ON profiles(designation_id);

CREATE OR REPLACE FUNCTION public.enforce_profile_privilege_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.account_role IS DISTINCT FROM OLD.account_role
      OR NEW.account_id IS DISTINCT FROM OLD.account_id
      OR NEW.designation_id IS DISTINCT FROM OLD.designation_id)
     AND current_user = 'authenticated'
  THEN
    RAISE EXCEPTION
      'account_role, account_id and designation_id cannot be changed directly; use the account member APIs'
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
