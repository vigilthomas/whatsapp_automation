-- ============================================================
-- 063_data_scope.sql — a role's data access, enforced in Postgres
-- ============================================================
-- Settings → Access control lets a role (designation) be limited to some
-- of the clinic's data, per module, on top of what it may do there:
--
--   all     every branch (default; also what older rows mean)
--   branch  only the member's own branch (profiles.branch_id)
--   own     only what is assigned to them: appointments where they are
--           the doctor, their own leaves
--   custom  only the branches picked on the role
--
-- It is stored on the role's permission entry, e.g.
--   { "module": "appointments", "actions": ["view","read"],
--     "scope": { "type": "custom", "branches": ["<uuid>", …] } }
--
-- The API routes already apply it (src/lib/auth/data-scope.ts). This adds
-- the same rule to row-level security so reads straight from the browser
-- (dashboard tiles, the inbox contact panel) follow it too. Each rule is a
-- RESTRICTIVE policy: it narrows the existing <table>_select policy, never
-- widens it. Writes go through the service-role API and are checked there.
--
-- A super admin is never limited. A member with no designation (role
-- default) sees everything. "branch" with no branch set, or "custom" with
-- none picked, sees nothing — fail closed.
--
-- Run after 062. Safe to run more than once.

-- True when the signed-in member's role lets them see a row of `p_module`
-- at branch `p_branch`, owned by user `p_owner`.
CREATE OR REPLACE FUNCTION public.data_scope_allows(
  p_account UUID,
  p_module  TEXT,
  p_branch  UUID,
  p_owner   UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_found  BOOLEAN := FALSE;
  v_branch UUID;
  v_perms  JSONB;
  v_entry  JSONB;
  v_type   TEXT;
BEGIN
  IF is_super_admin() THEN
    RETURN TRUE;
  END IF;

  SELECT TRUE, p.branch_id, d.permissions
    INTO v_found, v_branch, v_perms
  FROM profiles p
  LEFT JOIN designations d ON d.id = p.designation_id
  WHERE p.user_id = auth.uid() AND p.account_id = p_account;

  -- Not a member: the permissive policy already says no. No designation:
  -- the role default, which has no scope.
  IF NOT COALESCE(v_found, FALSE) OR v_perms IS NULL OR jsonb_typeof(v_perms) <> 'array' THEN
    RETURN TRUE;
  END IF;

  SELECT e INTO v_entry
  FROM jsonb_array_elements(v_perms) e
  WHERE e->>'module' = p_module
  LIMIT 1;

  v_type := COALESCE(v_entry->'scope'->>'type', 'all');

  IF v_type = 'branch' THEN
    RETURN p_branch IS NOT NULL AND v_branch IS NOT NULL AND p_branch = v_branch;
  ELSIF v_type = 'custom' THEN
    RETURN p_branch IS NOT NULL
       AND jsonb_typeof(v_entry->'scope'->'branches') = 'array'
       AND (v_entry->'scope'->'branches') ? p_branch::TEXT;
  ELSIF v_type = 'own' THEN
    RETURN p_owner IS NOT NULL AND p_owner = auth.uid();
  END IF;
  RETURN TRUE;
END;
$$;
ALTER FUNCTION public.data_scope_allows(UUID, TEXT, UUID, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.data_scope_allows(UUID, TEXT, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.data_scope_allows(UUID, TEXT, UUID, UUID) TO authenticated, service_role;

-- An appointment belongs to the user behind its doctor.
CREATE OR REPLACE FUNCTION public.appointment_in_scope(p_account UUID, p_branch UUID, p_doctor UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT data_scope_allows(
    p_account, 'appointments', p_branch,
    (SELECT user_id FROM doctors WHERE id = p_doctor AND account_id = p_account)
  );
$$;
ALTER FUNCTION public.appointment_in_scope(UUID, UUID, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.appointment_in_scope(UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.appointment_in_scope(UUID, UUID, UUID) TO authenticated, service_role;

-- A leave sits at the branch of the member taking it.
CREATE OR REPLACE FUNCTION public.leave_in_scope(p_account UUID, p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT data_scope_allows(
    p_account, 'leaves',
    (SELECT branch_id FROM profiles WHERE user_id = p_user AND account_id = p_account),
    p_user
  );
$$;
ALTER FUNCTION public.leave_in_scope(UUID, UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.leave_in_scope(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_in_scope(UUID, UUID) TO authenticated, service_role;

DROP POLICY IF EXISTS appointments_scope ON appointments;
CREATE POLICY appointments_scope ON appointments
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (appointment_in_scope(account_id, branch_id, doctor_id));

DROP POLICY IF EXISTS user_leaves_scope ON user_leaves;
CREATE POLICY user_leaves_scope ON user_leaves
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (leave_in_scope(account_id, user_id));

NOTIFY pgrst, 'reload schema';
