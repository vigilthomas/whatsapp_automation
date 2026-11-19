-- ============================================================
-- 053_booking_assistant.sql — WhatsApp booking assistant
-- ============================================================
-- A ready-made bot that books appointments over WhatsApp: the customer
-- picks a service, doctor, day and free time (or just checks what's free),
-- gives their name and answers the clinic's own questions, confirms, and
-- the appointment lands in Appointments / the dashboard as "via WhatsApp".
--
--   booking_settings  one row per account: on/off, trigger words, opening
--                     hours, slot length, the clinic's extra questions and
--                     the messages the bot sends.
--   booking_sessions  where each customer is in the conversation (one live
--                     row per contact; removed when they finish or cancel).
--
-- Both are written only by the server (settings via the API, sessions by
-- the webhook with the service role). Members may read the settings.
--
-- Run after 052. Safe to run more than once.

CREATE TABLE IF NOT EXISTS booking_settings (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  -- Everything else (keywords, timezone, hours, slot length, days ahead,
  -- ask name, questions, messages) lives in one JSON document so new
  -- options need no migration. Parsed and defaulted in src/lib/booking.
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT booking_settings_config_is_object CHECK (jsonb_typeof(config) = 'object')
);

ALTER TABLE booking_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS booking_settings_select ON booking_settings;
CREATE POLICY booking_settings_select ON booking_settings
  FOR SELECT USING (is_account_member(account_id));

CREATE TABLE IF NOT EXISTS booking_sessions (
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  conversation_id UUID,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, contact_id)
);

-- Server only: no policies, nothing reaches it from the browser.
ALTER TABLE booking_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON booking_sessions FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
