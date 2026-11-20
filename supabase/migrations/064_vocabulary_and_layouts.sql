-- ============================================================
-- 064_vocabulary_and_layouts.sql
--
-- Makes the product reusable across sectors (clinics, salons,
-- agencies, ...) and lets each user arrange their own screens.
--
--   1. app_branding.vocabulary — what this install calls its business,
--      customers, staff and bookings: { "sector": "salon", "terms":
--      { "staff": { "one": "Barber", "many": "Barbers" } } }.
--      Parsed by src/lib/vocabulary.ts; '{}' means the install default.
--
--   2. app_branding.dashboard — the dashboard's default template and
--      the card titles / icons set in Settings → Branding → Dashboard:
--      { "template": "modern", "cards": { "kpi-bookings": { "title":
--      "Visits today", "icon": "calendar" } } }. Parsed by
--      src/lib/dashboard/cards.ts.
--
--   3. user_layouts — one row per user per screen ("dashboard",
--      "table:contacts", ...) holding that user's saved arrangement
--      (dashboard card positions and sizes, table columns). Each user
--      reads and writes only their own rows. Replaces the per-browser
--      localStorage presets, so a layout follows the user to another
--      device.
--
-- Both branding columns are written under the existing branding policy
-- (047: the install's owners/admins and the super admin).
--
-- Run after 063. Safe to run more than once.
-- ============================================================

ALTER TABLE app_branding
  ADD COLUMN IF NOT EXISTS vocabulary JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS dashboard  JSONB NOT NULL DEFAULT '{}'::jsonb;

GRANT UPDATE (vocabulary, dashboard) ON app_branding TO authenticated;

CREATE TABLE IF NOT EXISTS user_layouts (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key        TEXT NOT NULL CHECK (key ~ '^[a-z0-9][a-z0-9:._-]{0,79}$'),
  layout     JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key),
  -- A layout is a handful of cards or columns; anything bigger is junk.
  CONSTRAINT user_layouts_size CHECK (pg_column_size(layout) < 65536)
);

ALTER TABLE user_layouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_layouts_own_select ON user_layouts;
CREATE POLICY user_layouts_own_select ON user_layouts
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_layouts_own_insert ON user_layouts;
CREATE POLICY user_layouts_own_insert ON user_layouts
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_layouts_own_update ON user_layouts;
CREATE POLICY user_layouts_own_update ON user_layouts
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_layouts_own_delete ON user_layouts;
CREATE POLICY user_layouts_own_delete ON user_layouts
  FOR DELETE TO authenticated USING (user_id = auth.uid());

REVOKE ALL ON user_layouts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_layouts TO authenticated;

NOTIFY pgrst, 'reload schema';
