-- ============================================================
-- 046_app_branding.sql — the clinic's name, logo, colours and sidebar menu wording
-- ============================================================
-- One row for the whole install (one clinic per project). Every column is
-- optional: NULL means "keep the Clinicoro default". Ported from the base
-- template's Access control → Branding / Sidebar menu.
--
-- Readable by everyone (the login page shows the brand before sign-in);
-- changeable only by account owners and admins. Safe to run more than once.

CREATE TABLE IF NOT EXISTS app_branding (
  id             SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  title          TEXT CHECK (title IS NULL OR char_length(title) <= 40),
  subtitle       TEXT CHECK (subtitle IS NULL OR char_length(subtitle) <= 40),
  logo           TEXT CHECK (
                   logo IS NULL
                   OR (logo ~* '^https://\S+$' AND char_length(logo) <= 2000)
                   OR (logo ~ '^data:image/(png|jpeg|svg\+xml|webp);base64,[A-Za-z0-9+/=]+$'
                       AND char_length(logo) <= 700000)
                 ),
  sidebar_bg     TEXT CHECK (sidebar_bg     IS NULL OR sidebar_bg     ~ '^#[0-9A-Fa-f]{6}$'),
  sidebar_text   TEXT CHECK (sidebar_text   IS NULL OR sidebar_text   ~ '^#[0-9A-Fa-f]{6}$'),
  sidebar_accent TEXT CHECK (sidebar_accent IS NULL OR sidebar_accent ~ '^#[0-9A-Fa-f]{6}$'),
  title_color    TEXT CHECK (title_color    IS NULL OR title_color    ~ '^#[0-9A-Fa-f]{6}$'),
  subtitle_color TEXT CHECK (subtitle_color IS NULL OR subtitle_color ~ '^#[0-9A-Fa-f]{6}$'),
  theme_primary  TEXT CHECK (theme_primary  IS NULL OR theme_primary  ~ '^#[0-9A-Fa-f]{6}$'),
  theme_text     TEXT CHECK (theme_text     IS NULL OR theme_text     ~ '^#[0-9A-Fa-f]{6}$'),
  theme_muted    TEXT CHECK (theme_muted    IS NULL OR theme_muted    ~ '^#[0-9A-Fa-f]{6}$'),
  theme_bg       TEXT CHECK (theme_bg       IS NULL OR theme_bg       ~ '^#[0-9A-Fa-f]{6}$'),
  theme_surface  TEXT CHECK (theme_surface  IS NULL OR theme_surface  ~ '^#[0-9A-Fa-f]{6}$'),
  theme_danger   TEXT CHECK (theme_danger   IS NULL OR theme_danger   ~ '^#[0-9A-Fa-f]{6}$'),
  menu           JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(menu) = 'object'),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO app_branding (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE app_branding ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read the branding" ON app_branding;
CREATE POLICY "Anyone can read the branding" ON app_branding
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Owners and admins change the branding" ON app_branding;
CREATE POLICY "Owners and admins change the branding" ON app_branding
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.account_role IN ('owner', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.user_id = auth.uid() AND p.account_role IN ('owner', 'admin')));
-- No INSERT or DELETE policy: the single row is seeded above and never removed.

GRANT SELECT ON app_branding TO anon, authenticated;
GRANT UPDATE ON app_branding TO authenticated;

CREATE OR REPLACE FUNCTION app_branding_touch() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := NOW();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS app_branding_touch ON app_branding;
CREATE TRIGGER app_branding_touch BEFORE UPDATE ON app_branding
  FOR EACH ROW EXECUTE FUNCTION app_branding_touch();

-- Make the API see the new table straight away.
NOTIFY pgrst, 'reload schema';
