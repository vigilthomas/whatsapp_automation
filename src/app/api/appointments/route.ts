import { NextResponse } from 'next/server'
import { toErrorResponse } from '@/lib/auth/account'
import { requirePermission } from '@/lib/auth/permission-guard'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { validateAppointmentInput } from '@/lib/appointments/model'
import { APPOINTMENT_SELECT, assertRefsInAccount } from '@/lib/appointments/server'

// Appointments — GET lists a time window (the calendar's visible week,
// or "today" for the dashboard); POST creates. Same split as the other
// operational routes: RLS-scoped read via the user client, service-
// role write after an explicit role check + account scope.
//
// Query params: from / to (ISO, inclusive/exclusive on starts_at),
// clinic_id, doctor_id, status. Without from/to the list is capped
// at the most recent 200 rows so a bare call stays cheap.

export async function GET(request: Request) {
  try {
    const { supabase } = await requirePermission('appointments', 'read')
    const url = new URL(request.url)
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const clinicId = url.searchParams.get('clinic_id')
    const doctorId = url.searchParams.get('doctor_id')
    const status = url.searchParams.get('status')

    let q = supabase.from('appointments').select(APPOINTMENT_SELECT)
    if (from) q = q.gte('starts_at', from)
    if (to) q = q.lt('starts_at', to)
    if (clinicId) q = q.eq('clinic_id', clinicId)
    if (doctorId) q = q.eq('doctor_id', doctorId)
    if (status) q = q.eq('status', status)
    q = q.order('starts_at', { ascending: !!from })
    if (!from && !to) q = q.limit(200)

    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ appointments: data ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request) {
  let ctx
  try {
    ctx = await requirePermission('appointments', 'write')
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  const result = validateAppointmentInput(body, { partial: false })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

  const admin = supabaseAdmin()
  const refCheck = await assertRefsInAccount(admin, result.values, ctx.accountId)
  if (refCheck) return refCheck

  const { data, error } = await admin
    .from('appointments')
    .insert({ ...result.values, account_id: ctx.accountId, created_by: ctx.userId })
    .select(APPOINTMENT_SELECT)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ appointment: data }, { status: 201 })
}
