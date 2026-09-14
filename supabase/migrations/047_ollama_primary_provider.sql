-- ============================================================
-- 047: allow 'ollama' as a clinic's PRIMARY AI provider.
--
-- 046 allowed 'ollama' in usage logs for the small-talk tier. This
-- lets a clinic_ai_configs row select a local Ollama model with tool
-- support (e.g. qwen3:8b) as the tool-calling receptionist itself,
-- so the pipeline can run fully on-prem with no NIM dependency.
-- ============================================================
ALTER TABLE clinic_ai_configs DROP CONSTRAINT IF EXISTS clinic_ai_configs_provider_check;
ALTER TABLE clinic_ai_configs
  ADD CONSTRAINT clinic_ai_configs_provider_check
    CHECK (provider IN ('openai', 'anthropic', 'nvidia_nim', 'ollama'));
