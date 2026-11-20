-- ============================================================
-- 067_whatsapp_webhook_url.sql — editable WhatsApp webhook URL
--
-- Settings → WhatsApp showed the webhook callback URL built from the
-- browser's own address (window.location.origin). Opened on localhost or
-- behind a proxy, that's an address Meta can't reach, and there was no
-- way to change it. Admins can now save the public URL (their domain, or
-- an ngrok link while developing); the page loads it from here and Copy
-- hands out the saved value.
--
-- On `accounts`, not `whatsapp_config`: that row only exists once a
-- number is connected, but the URL is needed before — it's pasted into
-- the Meta App Dashboard first. NULL = not set; the page falls back to
-- the browser's address as before.
--
-- Written only through PUT /api/whatsapp/webhook-url (admin+, validated
-- there), so no new RLS policy is needed.
--
-- Safe to run more than once.
-- ============================================================

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS whatsapp_webhook_url TEXT
    CHECK (whatsapp_webhook_url IS NULL OR char_length(whatsapp_webhook_url) <= 500);

NOTIFY pgrst, 'reload schema';
