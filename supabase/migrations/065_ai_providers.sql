-- ============================================================
-- 065_ai_providers.sql
--
-- More AI providers for the WhatsApp assistant (Settings → AI assistant):
--
--   groq    hosted, OpenAI-compatible (api.groq.com)
--   nvidia  hosted NVIDIA NIM, OpenAI-compatible (integrate.api.nvidia.com)
--   ollama  a local model on the business's own server; no API key,
--           reached at the address stored in the new `base_url` column
--
-- The provider CHECKs from 029 (ai_configs) and 033 (ai_usage_log) only
-- allowed 'openai' and 'anthropic', so they are replaced. `base_url` is
-- validated by the API (src/lib/ai-chat/provider.ts → checkBaseUrl:
-- http(s) only, no cloud metadata addresses); the CHECK here only bounds
-- its shape and length.
--
-- Run after 064. Safe to run more than once.
-- ============================================================

ALTER TABLE ai_configs DROP CONSTRAINT IF EXISTS ai_configs_provider_check;
ALTER TABLE ai_configs
  ADD CONSTRAINT ai_configs_provider_check
  CHECK (provider IN ('openai', 'anthropic', 'groq', 'nvidia', 'ollama'));

ALTER TABLE ai_configs ADD COLUMN IF NOT EXISTS base_url TEXT;
ALTER TABLE ai_configs DROP CONSTRAINT IF EXISTS ai_configs_base_url_check;
ALTER TABLE ai_configs
  ADD CONSTRAINT ai_configs_base_url_check
  CHECK (base_url IS NULL OR (base_url ~ '^https?://' AND length(base_url) <= 200));

COMMENT ON COLUMN ai_configs.base_url IS
  'Server address for a self-hosted provider (Ollama), e.g. http://localhost:11434. NULL for hosted providers.';

DO $$
BEGIN
  IF to_regclass('public.ai_usage_log') IS NOT NULL THEN
    ALTER TABLE ai_usage_log DROP CONSTRAINT IF EXISTS ai_usage_log_provider_check;
    ALTER TABLE ai_usage_log
      ADD CONSTRAINT ai_usage_log_provider_check
      CHECK (provider IN ('openai', 'anthropic', 'groq', 'nvidia', 'ollama'));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
