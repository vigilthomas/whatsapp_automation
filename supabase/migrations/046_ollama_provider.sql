-- ============================================================
-- 046: allow 'ollama' as an AI provider in usage logs.
--
-- The "basic replies" tier (src/lib/ai/basic-reply.ts) answers small
-- talk from a local Ollama model and logs usage with provider =
-- 'ollama'. Widen the CHECK on ai_usage_log so those rows aren't
-- rejected (logging is best-effort and swallowed, but we still want
-- the rows for the usage dashboard).
--
-- clinic_ai_configs.provider is intentionally left alone: Ollama is
-- never the *primary* provider for a clinic — it only ever shadows
-- the configured one for small talk.
-- ============================================================
ALTER TABLE ai_usage_log DROP CONSTRAINT IF EXISTS ai_usage_log_provider_check;
ALTER TABLE ai_usage_log
  ADD CONSTRAINT ai_usage_log_provider_check
    CHECK (provider IN ('openai', 'anthropic', 'nvidia_nim', 'ollama'));
