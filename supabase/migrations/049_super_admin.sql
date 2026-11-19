-- ============================================================
-- 049_super_admin.sql — a super admin above the clinic's owners
-- ============================================================
-- The super admin (the people running Clinicoro for the clinic) can see and
-- change everything. In the app they always have every permission, the
-- clinic's owners follow their designation like everyone else, and only the
-- super admin is guaranteed full access (so a lock-out can always be undone).
--
-- Who is a super admin is kept in `super_admins`. Nothing in the app can
-- write to it: add or remove rows here, in the SQL editor, e.g.
--
--   INSERT INTO super_admins (user_id)
--   SELECT id FROM auth.users WHERE email = 'you@example.com'
--   ON CONFLICT DO NOTHING;
--
-- A super admin still needs a profile in the clinic's account (any role) so
-- the app knows which account to open.
--
-- Run after 048. Safe to run more than once.

CREATE TABLE IF NOT EXISTS super_admins (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- No policies: the browser can neither read nor write the list.
ALTER TABLE super_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON super_admins FROM anon, authenticated;

-- True when the signed-in user is a super admin.
CREATE OR REPLACE FUNCTION is_super_admin() RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid());
$$;
ALTER FUNCTION is_super_admin() OWNER TO postgres;
REVOKE ALL ON FUNCTION is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_super_admin() TO authenticated, service_role;

-- Every data rule (and can_edit_branding) goes through is_account_member, so a
-- super admin passes as the highest role in any account. Same body as 017
-- otherwise.
CREATE OR REPLACE FUNCTION is_account_member(
  target_account_id UUID,
  min_role account_role_enum DEFAULT 'viewer'
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_super_admin() OR EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.user_id = auth.uid()
      AND p.account_id = target_account_id
      AND CASE p.account_role
            WHEN 'owner'  THEN 4
            WHEN 'admin'  THEN 3
            WHEN 'agent'  THEN 2
            WHEN 'viewer' THEN 1
          END
        >=
          CASE min_role
            WHEN 'owner'  THEN 4
            WHEN 'admin'  THEN 3
            WHEN 'agent'  THEN 2
            WHEN 'viewer' THEN 1
          END
  );
$$;
ALTER FUNCTION is_account_member(UUID, account_role_enum) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION is_account_member(UUID, account_role_enum) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
