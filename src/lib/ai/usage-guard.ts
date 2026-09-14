// ============================================================
// Usage guard — pre-flight monthly limit check.
//
// Called before invoking the LLM to ensure the clinic hasn't
// exceeded its monthly message or token budget. Uses the
// get_clinic_monthly_ai_usage RPC (migration 045).
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ClinicAiConfig } from './clinic-config'

export interface UsageCheckResult {
  allowed: boolean
  reason?: string
  currentMessages: number
  currentTokens: number
}

/**
 * Check whether a clinic is within its monthly AI usage limits.
 *
 * Returns `{ allowed: true }` when the clinic may proceed, or
 * `{ allowed: false, reason }` explaining which limit was hit.
 *
 * Best-effort: on RPC failure, defaults to **allowed** — we'd
 * rather over-serve a few messages than block a clinic because
 * the usage RPC is temporarily down. The post-flight usage log
 * is the authoritative record for billing.
 */
export async function checkClinicUsageLimit(
  db: SupabaseClient,
  clinicId: string,
  config: ClinicAiConfig,
): Promise<UsageCheckResult> {
  try {
    const { data, error } = await db.rpc('get_clinic_monthly_ai_usage', {
      p_clinic_id: clinicId,
    })

    if (error) {
      console.error('[usage guard] RPC failed, allowing by default:', error)
      return { allowed: true, currentMessages: 0, currentTokens: 0 }
    }

    const row = Array.isArray(data) ? data[0] : data
    const currentMessages = Number(row?.message_count ?? 0)
    const currentTokens = Number(row?.total_tokens ?? 0)

    if (currentMessages >= config.monthlyMessageLimit) {
      return {
        allowed: false,
        reason: `Monthly message limit reached (${currentMessages}/${config.monthlyMessageLimit}).`,
        currentMessages,
        currentTokens,
      }
    }

    if (currentTokens >= config.monthlyTokenLimit) {
      return {
        allowed: false,
        reason: `Monthly token limit reached (${currentTokens}/${config.monthlyTokenLimit}).`,
        currentMessages,
        currentTokens,
      }
    }

    return { allowed: true, currentMessages, currentTokens }
  } catch (err) {
    console.error('[usage guard] unexpected error, allowing by default:', err)
    return { allowed: true, currentMessages: 0, currentTokens: 0 }
  }
}
