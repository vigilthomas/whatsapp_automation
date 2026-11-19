import { NextResponse } from 'next/server'
import { toErrorResponse } from '@/lib/auth/account'
import { requirePermission } from '@/lib/auth/permission-guard'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { validateAppointmentInput } from '@/lib/appointments/model'
import { APPOINTMENT_SELECT, assertRefsInAccount } from '@/lib/appointments/server'
import { OUT_OF_SCOPE_MESSAGE, rowInScope, scopeFilter, type ScopeFilter } from '@/lib/auth/data-scope'
import type { PermissionContext } from '@/lib/auth/permission-guard'

// Update / delete one appointment. Both the permission check (write /
// delete on `appointments`) and the `account_id` scope live here
// because the service-role client bypasses RLS.

type Params = { params: Promise<{ id: string }> }

/**
 * The role's data scope (Access control → Data access) applies here
 * too: the appointment must be inside it today, and — for an edit —
 * still inside it afterwards (no moving a booking to a branch or
 * doctor you can't see). Out of scope reads as 404 for the existing
 * row so ids outside it don't leak, and 403 for the destination.
 */
async function checkExisting(
  admin: ReturnType<typeof supabaseAdmin>,
  ctx: PermissionContext,
  id: string,
): Promise<{ scope: ScopeFilter; row: Record<string, unknown> } | NextResponse> {
  let scope: ScopeFilter
  try {
    scope = await scopeFilter(admin, 'appointments', ctx)
  } catch {
    return NextResponse.json({ error: 'Could not check data access' }, { status: 500 })
  }
  const { data, error } = await admin
    .from('appointments')
    .select('id, branch_id, doctor_id')
    .eq('id', id)
    .eq('account_id', ctx.accountId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data || !rowInScope(scope, data)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return { scope, row: data }
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params
  let ctx
  try {
    ctx = await requirePermission('appointments', 'edit')
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  const result = validateAppointmentInput(body, { partial: true })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

  const admin = supabaseAdmin()
  const refCheck = await assertRefsInAccount(admin, result.values, ctx.accountId)
  if (refCheck) return refCheck

  const existing = await checkExisting(admin, ctx, id)
  if (existing instanceof NextResponse) return existing
  if (!rowInScope(existing.scope, { ...existing.row, ...(result.values as Record<string, unknown>) })) {
    return NextResponse.json({ error: OUT_OF_SCOPE_MESSAGE }, { status: 403 })
  }

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
    ctx = await requirePermission('appointments', 'delete')
  } catch (err) {
    return toErrorResponse(err)
  }
  const admin = supabaseAdmin()
  const existing = await checkExisting(admin, ctx, id)
  if (existing instanceof NextResponse) return existing
  const { error } = await admin
    .from('appointments')
    .delete()
    .eq('id', id)
    .eq('account_id', ctx.accountId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
