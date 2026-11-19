-- ============================================================
-- 048_branding_logo_shape.sql — show the logo as uploaded, in a circle or in a rounded square
-- ============================================================
-- NULL = as uploaded (how 046 showed it). Run after 047. Safe to run more than once.

ALTER TABLE app_branding
  ADD COLUMN IF NOT EXISTS logo_shape TEXT
  CHECK (logo_shape IS NULL OR logo_shape IN ('original', 'circle', 'rounded'));

GRANT UPDATE (logo_shape) ON app_branding TO authenticated;

NOTIFY pgrst, 'reload schema';
