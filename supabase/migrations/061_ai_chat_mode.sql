-- ============================================================
-- 061_ai_chat_mode.sql — Human / Bot switch on each WhatsApp chat
-- ============================================================
-- The AI assistant (ai_configs, migration 029) answers a chat only while
-- that chat is in Bot mode:
--
--   conversations.ai_mode   'bot'   the assistant replies
--                           'human' staff reply; the assistant stays quiet
--                           NULL    follow the account default:
--                                   ai_configs.auto_reply_enabled
--                                   ("new chats start in Bot mode")
--
-- The inbox switch (PATCH /api/conversations/<id>/ai-mode) sets it, gated
-- on the `ai-assistant` module in Access control. When the assistant can't
-- answer (or reaches its per-chat reply cap) it sets 'human' itself, puts
-- the reason in ai_handoff_summary (033), assigns the chat to the handoff
-- agent (033) and notifies them.
--
-- Switching back to Bot resets ai_reply_count (029) so the cap counts
-- from that moment.
--
-- Run after 060. Safe to run more than once.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS ai_mode TEXT
  CHECK (ai_mode IS NULL OR ai_mode IN ('bot', 'human'));

NOTIFY pgrst, 'reload schema';
