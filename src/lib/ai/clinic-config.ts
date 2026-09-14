// ============================================================
// Clinic AI configuration loader.
//
// Resolves a Meta phone_number_id → clinic, then loads the
// clinic's AI configuration. Used by the auto-reply path to
// determine whether the inbound message should go through the
// clinic AI gateway (tool-calling receptionist) or the existing
// BYO-key path.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AiProvider } from './types'

/**
 * Clinic AI configuration, ready to use. Loaded from
 * `clinic_ai_configs` via `loadClinicAiConfig`.
 */
export interface ClinicAiConfig {
  id: string
  clinicId: string
  accountId: string
  enabled: boolean
  provider: AiProvider
  model: string
  systemPrompt: string | null
  language: string
  temperature: number
  maxTokens: number
  monthlyMessageLimit: number
  monthlyTokenLimit: number
  allowBooking: boolean
  allowRescheduling: boolean
  allowCancellation: boolean
  allowPatientCreation: boolean
  allowHumanHandoff: boolean
  handoffAgentId: string | null
}

interface ClinicAiConfigRow {
  id: string
  account_id: string
  clinic_id: string
  enabled: boolean
  provider: string
  model: string
  system_prompt: string | null
  language: string
  temperature: number
  max_tokens: number
  monthly_message_limit: number
  monthly_token_limit: number
  allow_booking: boolean
  allow_rescheduling: boolean
  allow_cancellation: boolean
  allow_patient_creation: boolean
  allow_human_handoff: boolean
  handoff_agent_id: string | null
}

/**
 * Resolve a Meta WhatsApp phone_number_id to a clinic.
 *
 * Returns the clinic's `id` and `account_id`, or null if no clinic
 * has this phone number bound. Used by the webhook to determine
 * whether the inbound should go through the clinic AI path.
 */
export async function resolveClinicFromPhoneNumberId(
  db: SupabaseClient,
  phoneNumberId: string,
): Promise<{ clinicId: string; accountId: string } | null> {
  const { data, error } = await db
    .from('clinics')
    .select('id, account_id')
    .eq('whatsapp_phone_number_id', phoneNumberId)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    console.error('[clinic config] failed to resolve clinic from phone_number_id:', error)
    return null
  }
  if (!data) return null
  return { clinicId: data.id, accountId: data.account_id }
}

/**
 * Load the AI configuration for a specific clinic.
 *
 * Returns null when the clinic has no AI config row or AI is
 * disabled — callers treat both as "no clinic AI available".
 */
export async function loadClinicAiConfig(
  db: SupabaseClient,
  clinicId: string,
): Promise<ClinicAiConfig | null> {
  const { data, error } = await db
    .from('clinic_ai_configs')
    .select('*')
    .eq('clinic_id', clinicId)
    .maybeSingle()

  if (error) {
    console.error('[clinic config] failed to load clinic AI config:', error)
    return null
  }

  // If no DB row, fall back to env vars for dev / single-clinic setups.
  if (!data) return loadClinicAiConfigFromEnv(clinicId)

  const row = data as ClinicAiConfigRow
  if (!row.enabled) return null

  return {
    id: row.id,
    clinicId: row.clinic_id,
    accountId: row.account_id,
    enabled: row.enabled,
    provider: row.provider as AiProvider,
    model: row.model,
    systemPrompt: row.system_prompt,
    language: row.language,
    temperature: row.temperature,
    maxTokens: row.max_tokens,
    monthlyMessageLimit: row.monthly_message_limit,
    monthlyTokenLimit: row.monthly_token_limit,
    allowBooking: row.allow_booking,
    allowRescheduling: row.allow_rescheduling,
    allowCancellation: row.allow_cancellation,
    allowPatientCreation: row.allow_patient_creation,
    allowHumanHandoff: row.allow_human_handoff,
    handoffAgentId: row.handoff_agent_id,
  }
}

/**
 * Build a ClinicAiConfig from environment variables.
 *
 * Used as a fallback when no `clinic_ai_configs` row exists —
 * handy for local dev or single-clinic deployments where you
 * just want to set AI_PROVIDER, AI_MODEL, and NVIDIA_NIM_API_KEY
 * in `.env` without touching the database.
 *
 * Returns null if the minimum env vars aren't set.
 */
function loadClinicAiConfigFromEnv(clinicId: string): ClinicAiConfig | null {
  const provider = process.env.AI_PROVIDER as AiProvider | undefined
  if (!provider) return null

  // Ollama is keyless and defaults to OLLAMA_MODEL when AI_MODEL is
  // unset; NIM needs both a model and the platform key.
  const model =
    process.env.AI_MODEL || (provider === 'ollama' ? process.env.OLLAMA_MODEL : undefined)
  if (!model) return null
  if (provider !== 'ollama' && !process.env.NVIDIA_NIM_API_KEY) return null

  return {
    id: 'env-default',
    clinicId,
    accountId: '',
    enabled: true,
    provider,
    model,
    systemPrompt: process.env.AI_SYSTEM_PROMPT ?? null,
    language: process.env.AI_LANGUAGE ?? 'en',
    temperature: Number(process.env.AI_TEMPERATURE) || 0.7,
    maxTokens: Number(process.env.AI_MAX_TOKENS) || 1024,
    monthlyMessageLimit: 10_000,
    monthlyTokenLimit: 5_000_000,
    allowBooking: true,
    allowRescheduling: true,
    allowCancellation: true,
    allowPatientCreation: true,
    allowHumanHandoff: true,
    handoffAgentId: null,
  }
}

/**
 * Load minimal clinic info for the system prompt.
 */
export async function loadClinicInfo(
  db: SupabaseClient,
  clinicId: string,
): Promise<{
  name: string
  phone: string | null
  address: string | null
  city: string | null
} | null> {
  const { data, error } = await db
    .from('clinics')
    .select('name, phone, address, city')
    .eq('id', clinicId)
    .maybeSingle()

  if (error || !data) return null
  return data
}

/**
 * Load active services offered by the clinic's account.
 */
export async function loadClinicServices(
  db: SupabaseClient,
  accountId: string,
): Promise<{ name: string; duration_min: number; price: number }[]> {
  const { data, error } = await db
    .from('services')
    .select('name, duration_min, price')
    .eq('account_id', accountId)
    .eq('is_active', true)
    .order('name')

  if (error || !data) return []
  return data
}
