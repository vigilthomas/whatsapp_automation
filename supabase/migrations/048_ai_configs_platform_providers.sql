-- ============================================================
-- 048: NVIDIA NIM + Ollama on the account-level AI Agents setup.
--
-- The AI Agents page (ai_configs, migration 029) was BYO-key only:
-- provider CHECK (openai | anthropic) and api_key NOT NULL. This lets an
-- account pick the platform NIM provider or a self-hosted Ollama server
-- from the same page, for drafts, the Playground and auto-reply.
--
-- Neither needs an account key — NIM falls back to NVIDIA_NIM_API_KEY
-- on the server (an account-supplied key is honoured as an override),
-- Ollama has no auth — so api_key becomes nullable. The application
-- still requires a key for openai / anthropic.
-- ============================================================
ALTER TABLE ai_configs DROP CONSTRAINT IF EXISTS ai_configs_provider_check;
ALTER TABLE ai_configs
  ADD CONSTRAINT ai_configs_provider_check
    CHECK (provider IN ('openai', 'anthropic', 'nvidia_nim', 'ollama'));

ALTER TABLE ai_configs ALTER COLUMN api_key DROP NOT NULL;

-- A BYO provider must still carry a key.
ALTER TABLE ai_configs DROP CONSTRAINT IF EXISTS ai_configs_byo_key_required;
ALTER TABLE ai_configs
  ADD CONSTRAINT ai_configs_byo_key_required
    CHECK (provider IN ('nvidia_nim', 'ollama') OR api_key IS NOT NULL);
