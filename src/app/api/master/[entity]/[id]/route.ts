import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import {
  MASTER_ENTITIES,
  isMasterEntitySlug,
  sanitizeMasterInput,
} from '@/lib/master/entities'
import { assertClinicInAccount } from '@/lib/master/server'

// Update / delete one clinic master-data record. Every mutation is
// scoped by `account_id` as well as `id` — the service-role client
// bypasses RLS, so both the admin role check and the tenancy filter
// live here.

type Params = { params: Promise<{ entity: string; id: string }> }

export async function PATCH(request: Request, { params }: Params) {
  const { entity: slug, id } = await params
  if (!isMasterEntitySlug(slug)) {
    return NextResponse.json({ error: 'Unknown entity' }, { status: 404 })
  }
  const entity = MASTER_ENTITIES[slug]

  let ctx
  try {
    ctx = await requireRole('admin')
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  const result = sanitizeMasterInput(entity, body, { partial: true })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

  const admin = supabaseAdmin()
  const clinicCheck = await assertClinicInAccount(admin, result.values, ctx.accountId)
  if (clinicCheck) return clinicCheck

  const { data, error } = await admin
    .from(entity.table)
    .update(result.values)
    .eq('id', id)
    .eq('account_id', ctx.accountId)
    .select()
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ record: data })
}

export async function DELETE(_request: Request, { params }: Params) {
  const { entity: slug, id } = await params
  if (!isMasterEntitySlug(slug)) {
    return NextResponse.json({ error: 'Unknown entity' }, { status: 404 })
  }
  const entity = MASTER_ENTITIES[slug]

  let ctx
  try {
    ctx = await requireRole('admin')
  } catch (err) {
    return toErrorResponse(err)
  }

  const { error } = await supabaseAdmin()
    .from(entity.table)
    .delete()
    .eq('id', id)
    .eq('account_id', ctx.accountId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
