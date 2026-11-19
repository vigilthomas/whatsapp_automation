-- ============================================================
-- 050_settings_permissions.sql — Settings sections in Access control
-- ============================================================
-- The Settings page's own sections are now modules a designation can
-- grant like any other:
--
--   settings-overview    view / read
--   settings-profile     view / read / edit
--   settings-security    view / read / edit
--   settings-appearance  view / read / edit
--
-- A module missing from a designation is denied, so without this every
-- existing designation would lose Your profile, Login & security and
-- Appearance. This gives each existing designation all four, so nothing
-- changes until someone unticks them in Access control.
--
-- Run after 049. Safe to run more than once (a module already listed is
-- left alone).

UPDATE designations d
SET permissions = d.permissions || COALESCE((
  SELECT jsonb_agg(jsonb_build_object('module', s.module, 'actions', s.actions) ORDER BY s.pos)
  FROM (VALUES
    (1, 'settings-overview',   '["view","read"]'::jsonb),
    (2, 'settings-profile',    '["view","read","edit"]'::jsonb),
    (3, 'settings-security',   '["view","read","edit"]'::jsonb),
    (4, 'settings-appearance', '["view","read","edit"]'::jsonb)
  ) AS s(pos, module, actions)
  WHERE NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(d.permissions) e WHERE e->>'module' = s.module
  )
), '[]'::jsonb);
