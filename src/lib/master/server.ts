import { NextResponse } from 'next/server'
import type { supabaseAdmin } from '@/lib/automations/admin-client'

/**
 * A `clinic_id` in the payload must point at a clinic in the caller's
 * own account. The service-role client won't stop a cross-tenant id,
 * and a bare FK check wouldn't either, so look it up explicitly.
 * Shared by the create and update routes.
 */
export async function assertClinicInAccount(
  admin: ReturnType<typeof supabaseAdmin>,
  values: Record<string, unknown>,
  accountId: string,
): Promise<NextResponse | null> {
  const clinicId = values.clinic_id
  if (typeof clinicId !== 'string') return null
  const { data, error } = await admin
    .from('clinics')
    .select('id')
    .eq('id', clinicId)
    .eq('account_id', accountId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'clinic_id not found' }, { status: 400 })
  return null
}
