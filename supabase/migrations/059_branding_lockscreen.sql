-- ============================================================
-- 059_branding_lockscreen.sql — pick a sign-in screen layout
-- ============================================================
-- Settings → Branding → Lockscreen chooses how the sign-in, sign-up and
-- reset-password pages look:
--
--   classic    a centred card on the page background (how it always looked)
--   split      the clinic's logo, name and tagline on a coloured panel beside the form
--   spotlight  the form floating on a full-screen gradient in the clinic's colour
--
-- NULL = classic. The pages are public, and "Anyone can read the branding"
-- (046) already lets them read it before sign-in.
--
-- 058 is reserved for the per-module data scope migration that's in progress.
-- Run after 057. Safe to run more than once.

ALTER TABLE app_branding
  ADD COLUMN IF NOT EXISTS lockscreen TEXT
  CHECK (lockscreen IS NULL OR lockscreen IN ('classic', 'split', 'spotlight'));

-- 047 granted UPDATE column by column; the new column needs its own grant.
GRANT UPDATE (lockscreen) ON app_branding TO authenticated;

NOTIFY pgrst, 'reload schema';
