-- ============================================================
-- 045_clinic_ai_gateway.sql — Clinicoro AI gateway
--
-- Per-clinic AI configuration, tool-call audit log, and the
-- schema changes that let each clinic run its own AI receptionist
-- (different model, language, prompt, tool permissions) while
-- sharing the same NVIDIA NIM / OpenAI / Anthropic infrastructure.
--
-- This migration builds on 029_ai_reply (ai_configs, ai_usage_log)
-- and 041_clinic_master_data (clinics, doctors). It does NOT touch
-- the existing BYO-key ai_configs row — accounts without a
-- clinic_ai_configs entry keep using the existing path unchanged.
--
-- Key design points:
--   - clinic_ai_configs: one row per clinic, UNIQUE(clinic_id).
--     Every field the model needs is stored here, never inferred
--     from the request. The backend resolves clinic_id from the
--     inbound WhatsApp phone_number_id — the model cannot choose it.
--   - ai_tool_calls_log: audit trail for every tool call the AI
--     executes — name, args, result, latency. Append-only, written
--     by the service role, read by admin+.
--   - ai_usage_log gains clinic_id, patient_id, request_type so
--     billing and dashboards can slice by clinic and request type.
--   - clinics gains whatsapp_phone_number_id to bind a Meta Cloud
--     API phone number to a specific clinic for inbound routing.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ============================================================
-- 1. clinics.whatsapp_phone_number_id
--
-- Binds a Meta phone_number_id to a clinic so the webhook can
-- resolve inbound messages to the right clinic context. NULL when
-- the clinic doesn't have a dedicated WhatsApp number.
-- ============================================================
ALTER TABLE clinics
  ADD COLUMN IF NOT EXISTS whatsapp_phone_number_id TEXT;

-- Unique: one phone number maps to exactly one clinic. Partial
-- index so multiple clinics can have NULL (no number assigned).
CREATE UNIQUE INDEX IF NOT EXISTS idx_clinics_whatsapp_phone
  ON clinics(whatsapp_phone_number_id)
  WHERE whatsapp_phone_number_id IS NOT NULL;

-- ============================================================
-- 2. clinic_ai_configs
--
-- Per-clinic AI setup. Controls the model, prompt, language,
-- tool permissions, and usage limits for a clinic's AI agent.
-- The existing account-level ai_configs (migration 029) is
-- untouched — this is a separate, clinic-scoped layer.
-- ============================================================
CREATE TABLE IF NOT EXISTS clinic_ai_configs (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id              UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  clinic_id               UUID NOT NULL UNIQUE REFERENCES clinics(id) ON DELETE CASCADE,

  enabled                 BOOLEAN NOT NULL DEFAULT FALSE,
  provider                TEXT NOT NULL DEFAULT 'nvidia_nim'
                            CHECK (provider IN ('openai', 'anthropic', 'nvidia_nim')),
  model                   TEXT NOT NULL DEFAULT 'nvidia/nemotron-3.5-lightning-30b-a3b',
  system_prompt           TEXT,              -- clinic persona / instructions
  language                TEXT NOT NULL DEFAULT 'en',
  temperature             NUMERIC(3,2) NOT NULL DEFAULT 0.3
                            CHECK (temperature BETWEEN 0 AND 2),
  max_tokens              INTEGER NOT NULL DEFAULT 1024
                            CHECK (max_tokens BETWEEN 1 AND 4096),

  -- Usage limits (monthly billing window, calendar month).
  monthly_message_limit   INTEGER NOT NULL DEFAULT 1000
                            CHECK (monthly_message_limit > 0),
  monthly_token_limit     INTEGER NOT NULL DEFAULT 500000
                            CHECK (monthly_token_limit > 0),

  -- Tool permissions. Each boolean gates a family of tools the AI
  -- may call. When false, the tool schemas are not sent to the model.
  allow_booking           BOOLEAN NOT NULL DEFAULT TRUE,
  allow_rescheduling      BOOLEAN NOT NULL DEFAULT TRUE,
  allow_cancellation      BOOLEAN NOT NULL DEFAULT TRUE,
  allow_patient_creation  BOOLEAN NOT NULL DEFAULT FALSE,
  allow_human_handoff     BOOLEAN NOT NULL DEFAULT TRUE,

  -- Where handoffs route (same semantics as ai_configs.handoff_agent_id).
  handoff_agent_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clinic_ai_configs_account
  ON clinic_ai_configs(account_id);

-- RLS: settings-class, matching ai_configs (029).
ALTER TABLE clinic_ai_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinic_ai_configs_select ON clinic_ai_configs;
CREATE POLICY clinic_ai_configs_select ON clinic_ai_configs FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS clinic_ai_configs_insert ON clinic_ai_configs;
CREATE POLICY clinic_ai_configs_insert ON clinic_ai_configs FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS clinic_ai_configs_update ON clinic_ai_configs;
CREATE POLICY clinic_ai_configs_update ON clinic_ai_configs FOR UPDATE
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS clinic_ai_configs_delete ON clinic_ai_configs;
CREATE POLICY clinic_ai_configs_delete ON clinic_ai_configs FOR DELETE
  USING (is_account_member(account_id, 'admin'));

DROP TRIGGER IF EXISTS set_updated_at ON clinic_ai_configs;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON clinic_ai_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 3. ai_tool_calls_log — audit trail for tool executions
--
-- One row per tool call the AI executes. Append-only, written by
-- the service role from the auto-reply path. The dashboard reads
-- it for the "AI activity" view.
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_tool_calls_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  clinic_id         UUID REFERENCES clinics(id) ON DELETE SET NULL,
  conversation_id   UUID REFERENCES conversations(id) ON DELETE SET NULL,
  tool_name         TEXT NOT NULL,
  tool_args         JSONB,
  tool_result       JSONB,
  execution_ms      INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_tool_calls_log_clinic_created
  ON ai_tool_calls_log(clinic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_tool_calls_log_account_created
  ON ai_tool_calls_log(account_id, created_at DESC);

ALTER TABLE ai_tool_calls_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_tool_calls_log_select ON ai_tool_calls_log;
CREATE POLICY ai_tool_calls_log_select ON ai_tool_calls_log FOR SELECT
  USING (is_account_member(account_id, 'admin'));

-- No INSERT/UPDATE/DELETE policies: written by service_role only.

-- ============================================================
-- 4. ai_usage_log additions
--
-- Add clinic_id, patient_id, and request_type so usage can be
-- sliced by clinic for billing, and by request type for analytics.
-- Also widen the provider CHECK to include nvidia_nim.
-- ============================================================
ALTER TABLE ai_usage_log
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id) ON DELETE SET NULL;
ALTER TABLE ai_usage_log
  ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES contacts(id) ON DELETE SET NULL;
ALTER TABLE ai_usage_log
  ADD COLUMN IF NOT EXISTS request_type TEXT NOT NULL DEFAULT 'chat';

-- Widen the provider CHECK constraint to allow 'nvidia_nim'. Drop
-- the old constraint first (name from 033_ai_reply_polish.sql).
-- The constraint name varies across environments, so use a DO block
-- to find and drop it by column + table rather than by name.
DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT con.conname INTO cname
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attnum = ANY(con.conkey)
                        AND att.attrelid = con.conrelid
   WHERE con.conrelid = 'ai_usage_log'::regclass
     AND att.attname = 'provider'
     AND con.contype = 'c'
   LIMIT 1;

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE ai_usage_log DROP CONSTRAINT %I', cname);
  END IF;
END $$;

ALTER TABLE ai_usage_log
  ADD CONSTRAINT ai_usage_log_provider_check
    CHECK (provider IN ('openai', 'anthropic', 'nvidia_nim'));

-- Index for clinic-scoped billing queries.
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_clinic_created
  ON ai_usage_log(clinic_id, created_at DESC)
  WHERE clinic_id IS NOT NULL;

-- ============================================================
-- 5. Monthly usage summary function
--
-- Returns the current calendar month's message count and total
-- token spend for a clinic. Used by the usage guard to enforce
-- monthly limits before calling the provider.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_clinic_monthly_ai_usage(
  p_clinic_id UUID
)
RETURNS TABLE (message_count BIGINT, total_tokens BIGINT) AS $$
  SELECT
    COUNT(*)::BIGINT AS message_count,
    COALESCE(SUM(total_tokens), 0)::BIGINT AS total_tokens
  FROM ai_usage_log
  WHERE clinic_id = p_clinic_id
    AND created_at >= date_trunc('month', NOW())
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_clinic_monthly_ai_usage(UUID) TO service_role;
