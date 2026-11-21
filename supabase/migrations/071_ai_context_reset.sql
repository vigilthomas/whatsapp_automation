-- ============================================================
-- 071_ai_context_reset.sql — "Start new" for a WhatsApp chat's AI
-- ============================================================
-- The inbox's Start new button (POST /api/conversations/<id>/ai-reset)
-- stamps this column; the AI assistant then reads only messages sent
-- after it (src/lib/ai-chat/runner.ts), so it starts a fresh
-- conversation. Messages are kept for staff; appointments are untouched.
--
-- NULL = never reset: the AI reads the recent history as before.
--
-- Run after 070. Safe to run more than once.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS ai_context_since TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
