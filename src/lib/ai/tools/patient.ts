// ============================================================
// Patient tool implementations.
//
// Every function receives a server-side ClinicContext — the model
// cannot override accountId, clinicId, or patientId. All queries
// are scoped by accountId so RLS and multi-tenant isolation hold.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ClinicContext } from './types'

/** Look up a patient (contact) by phone within the account. */
export async function getPatient(
  db: SupabaseClient,
  ctx: ClinicContext,
  args: { phone: string },
): Promise<unknown> {
  const phone = args.phone.replace(/\s+/g, '')
  const { data, error } = await db
    .from('contacts')
    .select('id, name, phone, email, created_at')
    .eq('account_id', ctx.accountId)
    .eq('phone', phone)
    .maybeSingle()

  if (error) throw error
  if (!data) return { found: false, message: `No patient found with phone ${phone}.` }
  return { found: true, patient: data }
}

/** Register a new patient (contact) within the account. */
export async function createPatient(
  db: SupabaseClient,
  ctx: ClinicContext,
  args: { name: string; phone: string },
): Promise<unknown> {
  const phone = args.phone.replace(/\s+/g, '')

  // Check if already exists to avoid duplicates.
  const { data: existing } = await db
    .from('contacts')
    .select('id, name, phone')
    .eq('account_id', ctx.accountId)
    .eq('phone', phone)
    .maybeSingle()

  if (existing) {
    return {
      created: false,
      message: `Patient already exists with this phone number.`,
      patient: existing,
    }
  }

  const { data, error } = await db
    .from('contacts')
    .insert({
      account_id: ctx.accountId,
      name: args.name.trim(),
      phone,
    })
    .select('id, name, phone, created_at')
    .single()

  if (error) throw error
  return { created: true, patient: data }
}

/** Update a patient's name. */
export async function updatePatient(
  db: SupabaseClient,
  ctx: ClinicContext,
  args: { patient_id: string; name: string },
): Promise<unknown> {
  const { data, error } = await db
    .from('contacts')
    .update({ name: args.name.trim() })
    .eq('id', args.patient_id)
    .eq('account_id', ctx.accountId) // ← tenant guard
    .select('id, name, phone')
    .maybeSingle()

  if (error) throw error
  if (!data) return { updated: false, message: 'Patient not found.' }
  return { updated: true, patient: data }
}
