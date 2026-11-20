-- ============================================================
-- 060_clinic_settings.sql — clinic opening hours, holidays and closed dates
-- ============================================================
-- Settings → Clinic. One row per account, the whole thing as a JSON
-- document parsed by src/lib/clinic/settings.ts:
--
--   { "hours":    { "0": {"open": false, "start": "09:00", "end": "18:00"}, ... "6": {...} },
--     "holidays": [ {"id": "...", "date": "2026-12-25", "name": "Christmas", "yearly": true} ],
--     "closures": [ {"id": "...", "from": "2026-11-23", "to": "2026-11-25", "reason": "Renovation"} ] }
--
-- No row = Monday to Saturday 09:00–18:00, Sunday closed, no holidays.
--
-- Reading: any member of the account (the appointment dialog needs the
-- hours to offer slots). Writing: only through PUT /api/clinic-settings,
-- which checks the `settings-clinic` edit tick in Access control and then
-- writes with the service role. So there is no UPDATE / INSERT policy for
-- the browser.
--
-- Run after 059. Safe to run more than once.

CREATE TABLE IF NOT EXISTS clinic_settings (
  account_id  UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  config      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE clinic_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinic_settings_select ON clinic_settings;
CREATE POLICY clinic_settings_select ON clinic_settings
  FOR SELECT USING (is_account_member(account_id));

REVOKE INSERT, UPDATE, DELETE ON clinic_settings FROM anon, authenticated;
GRANT SELECT ON clinic_settings TO authenticated;

NOTIFY pgrst, 'reload schema';
