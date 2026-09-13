import { NextResponse } from 'next/server'
import type { supabaseAdmin } from '@/lib/automations/admin-client'
import type { AppointmentInput } from './model'

/**
 * Column list + embedded display names for every appointment read.
 * PostgREST resolves the FK embeds from the schema cache; the aliases
 * keep the wire shape matching `Appointment` in model.ts.
 */
export const APPOINTMENT_SELECT =
  'id, clinic_id, doctor_id, contact_id, service, starts_at, ends_at, status, source, notes, created_at, updated_at, ' +
  'contact:contacts(id, name, phone), doctor:doctors(id, name), clinic:clinics(id, name)'

/**
 * Every FK in a payload must point inside the caller's account. The
 * service-role client would happily write a cross-tenant id, so look
 * each one up before the insert/update. Returns an error response or
 * null when everything checks out.
 */
export async function assertRefsInAccount(
  admin: ReturnType<typeof supabaseAdmin>,
  values: AppointmentInput,
  accountId: string,
): Promise<NextResponse | null> {
  const checks: Array<[table: string, id: string | null | undefined, label: string]> = [
    ['contacts', values.contact_id, 'contact_id'],
    ['doctors', values.doctor_id, 'doctor_id'],
    ['clinics', values.clinic_id, 'clinic_id'],
  ]
  for (const [table, id, label] of checks) {
    if (typeof id !== 'string') continue
    const { data, error } = await admin
      .from(table)
      .select('id')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: `${label} not found` }, { status: 400 })
  }
  return null
}
