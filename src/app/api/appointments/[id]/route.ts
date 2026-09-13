import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { validateAppointmentInput } from '@/lib/appointments/model'
import { APPOINTMENT_SELECT, assertRefsInAccount } from '@/lib/appointments/server'

// Update / delete one appointment. Both the agent role check and the
// `account_id` scope live here because the service-role client
// bypasses RLS.

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params
  let ctx
  try {
    ctx = await requireRole('agent')
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  const result = validateAppointmentInput(body, { partial: true })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

  const admin = supabaseAdmin()
  const refCheck = await assertRefsInAccount(admin, result.values, ctx.accountId)
  if (refCheck) return refCheck

  const { data, error } = await admin
    .from('appointments')
    .update(result.values)
    .eq('id', id)
    .eq('account_id', ctx.accountId)
    .select(APPOINTMENT_SELECT)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ appointment: data })
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params
  let ctx
  try {
    ctx = await requireRole('agent')
  } catch (err) {
    return toErrorResponse(err)
  }
  const { error } = await supabaseAdmin()
    .from('appointments')
    .delete()
    .eq('id', id)
    .eq('account_id', ctx.accountId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
