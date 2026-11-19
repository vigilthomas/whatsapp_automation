import { NextResponse } from 'next/server'
import { toErrorResponse } from '@/lib/auth/account'
import { requirePermission } from '@/lib/auth/permission-guard'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { validateAppointmentInput } from '@/lib/appointments/model'
import { APPOINTMENT_SELECT, assertRefsInAccount } from '@/lib/appointments/server'
import { OUT_OF_SCOPE_MESSAGE, rowInScope, scopeFilter } from '@/lib/auth/data-scope'

// Appointments — GET lists a time window (the calendar's visible week,
// or "today" for the dashboard); POST creates. Same split as the other
// operational routes: RLS-scoped read via the user client, service-
// role write after an explicit role check + account scope.
//
// Query params: from / to (ISO, inclusive/exclusive on starts_at),
// branch_id, doctor_id, status. Without from/to the list is capped
// at the most recent 200 rows so a bare call stays cheap.
//
// Data scope (Access control → Data access): the role may be limited
// to some branches or to the caller's own appointments. GET narrows
// the list (RLS from 058 does too, this works without it); POST
// refuses a new appointment outside that scope.

export async function GET(request: Request) {
  try {
    const ctx = await requirePermission('appointments', 'read')
    const { supabase } = ctx
    const scope = await scopeFilter(supabaseAdmin(), 'appointments', ctx)
    if (scope && scope.values.length === 0) return NextResponse.json({ appointments: [] })
    const url = new URL(request.url)
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const branchId = url.searchParams.get('branch_id')
    const doctorId = url.searchParams.get('doctor_id')
    const status = url.searchParams.get('status')

    let q = supabase.from('appointments').select(APPOINTMENT_SELECT)
    if (from) q = q.gte('starts_at', from)
    if (to) q = q.lt('starts_at', to)
    if (branchId) q = q.eq('branch_id', branchId)
    if (doctorId) q = q.eq('doctor_id', doctorId)
    if (status) q = q.eq('status', status)
    if (scope) q = q.in(scope.column, scope.values)
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

  const scope = await scopeFilter(admin, 'appointments', ctx).catch(() => undefined)
  if (scope === undefined) return NextResponse.json({ error: 'Could not check data access' }, { status: 500 })
  if (!rowInScope(scope, result.values as Record<string, unknown>)) {
    return NextResponse.json({ error: OUT_OF_SCOPE_MESSAGE }, { status: 403 })
  }

  const { data, error } = await admin
    .from('appointments')
    .insert({ ...result.values, account_id: ctx.accountId, created_by: ctx.userId })
    .select(APPOINTMENT_SELECT)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ appointment: data }, { status: 201 })
}
