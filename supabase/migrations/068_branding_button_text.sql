-- ============================================================
-- 068_branding_button_text.sql — separate text colour for main buttons
--
-- Text on main-colour buttons (--primary-foreground) used to be picked
-- automatically: white or dark, whichever contrasts more with the main
-- colour. For mid-tone colours like teal that pick is dark, which isn't
-- always what the clinic wants, and there was no way to override it.
-- Settings → Branding → Page colours now has "Button text".
--
-- NULL = automatic (the old behaviour). Light mode only; dark mode keeps
-- picking by contrast against its lightened accent.
--
-- The client reads this column in its newest column set and falls back
-- to the older sets when it's missing, so the app works before this runs.
--
-- Safe to run more than once.
-- ============================================================

ALTER TABLE app_branding
  ADD COLUMN IF NOT EXISTS theme_button_text TEXT
    CHECK (theme_button_text IS NULL OR theme_button_text ~ '^#[0-9A-Fa-f]{6}$');

-- 047 granted UPDATE column by column; without its own grant, saving
-- branding fails with "permission denied for table app_branding".
GRANT UPDATE (theme_button_text) ON app_branding TO authenticated;

NOTIFY pgrst, 'reload schema';
