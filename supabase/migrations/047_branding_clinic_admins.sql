-- ============================================================
-- 047_branding_clinic_admins.sql — only the clinic's own owners and admins change the branding
-- ============================================================
-- 046 let the owner or admin of *any* account change `app_branding`. But every
-- sign-up gets an account of its own and is its owner (handle_new_user, 017), so
-- anyone who signs up could rebrand the login page. The branding now belongs to
-- one account, the clinic's:
--   - the account of whoever last saved the branding, if anyone has;
--   - otherwise the oldest account (the clinic's first sign-up).
-- Members of other accounts can still read it, as before. Safe to run more than once.

ALTER TABLE app_branding
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;

UPDATE app_branding b
SET account_id = COALESCE(
  (SELECT p.account_id FROM profiles p WHERE p.user_id = b.updated_by),
  (SELECT a.id FROM accounts a ORDER BY a.created_at, a.id LIMIT 1)
)
WHERE b.id = 1 AND b.account_id IS NULL;

-- True when the signed-in user is an owner or admin of the clinic's account.
-- Used by the policy below and by the app to show or hide the settings screens.
CREATE OR REPLACE FUNCTION can_edit_branding() RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_account_member(
    COALESCE(
      (SELECT account_id FROM app_branding WHERE id = 1),
      (SELECT id FROM accounts ORDER BY created_at, id LIMIT 1)
    ),
    'admin'
  );
$$;
ALTER FUNCTION can_edit_branding() OWNER TO postgres;
REVOKE ALL ON FUNCTION can_edit_branding() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION can_edit_branding() TO authenticated;

DROP POLICY IF EXISTS "Owners and admins change the branding" ON app_branding;
DROP POLICY IF EXISTS "Clinic owners and admins change the branding" ON app_branding;
CREATE POLICY "Clinic owners and admins change the branding" ON app_branding
  FOR UPDATE TO authenticated
  USING (can_edit_branding())
  WITH CHECK (can_edit_branding());

-- Only the branding columns can be changed from the app; account_id, updated_at
-- and updated_by are not (the trigger from 046 still fills the last two).
REVOKE UPDATE ON app_branding FROM anon, authenticated;
GRANT UPDATE (
  title, subtitle, logo, menu,
  sidebar_bg, sidebar_text, sidebar_accent, title_color, subtitle_color,
  theme_primary, theme_text, theme_muted, theme_bg, theme_surface, theme_danger
) ON app_branding TO authenticated;

NOTIFY pgrst, 'reload schema';
