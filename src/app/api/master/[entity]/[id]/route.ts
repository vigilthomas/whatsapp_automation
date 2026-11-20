import { NextResponse } from 'next/server'
import { toErrorResponse } from '@/lib/auth/account'
import { requirePermission } from '@/lib/auth/permission-guard'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import {
  MASTER_ENTITIES,
  isMasterEntitySlug,
  sanitizeMasterInput,
} from '@/lib/master/entities'
import { assertRefsInAccount, entityScope } from '@/lib/master/server'
import { OUT_OF_SCOPE_MESSAGE, rowInScope } from '@/lib/auth/data-scope'
import type { PermissionContext } from '@/lib/auth/permission-guard'
import type { MasterEntity } from '@/lib/master/entities'

// Update / delete one clinic master-data record. Every mutation is
// scoped by `account_id` as well as `id` — the service-role client
// bypasses RLS, so both the permission check (write / delete on the
// entity's module) and the tenancy filter live here.

type Params = { params: Promise<{ entity: string; id: string }> }

/**
 * Leaves follow the role's data scope: the record has to be inside it
 * (404 otherwise, so ids outside it don't leak) and an edit can't move
 * it outside. Returns the filter and current row, or a response to
 * send. Unscoped entities skip the lookup entirely.
 */
async function checkScope(
  admin: ReturnType<typeof supabaseAdmin>,
  entity: MasterEntity,
  ctx: PermissionContext,
  id: string,
) {
  let scope
  try {
    scope = await entityScope(admin, entity, ctx)
  } catch {
    return NextResponse.json({ error: 'Could not check data access' }, { status: 500 })
  }
  if (!scope) return { scope, row: {} as Record<string, unknown> }
  const { data, error } = await admin
    .from(entity.table)
    .select(scope.column)
    .eq('id', id)
    .eq('account_id', ctx.accountId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const row = (data ?? null) as Record<string, unknown> | null
  if (!row || !rowInScope(scope, row)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return { scope, row }
}

export async function PATCH(request: Request, { params }: Params) {
  const { entity: slug, id } = await params
  if (!isMasterEntitySlug(slug)) {
    return NextResponse.json({ error: 'Unknown entity' }, { status: 404 })
  }
  const entity = MASTER_ENTITIES[slug]
  if (entity.readOnly) {
    return NextResponse.json({ error: 'Managed from Master → Users' }, { status: 405 })
  }

  let ctx
  try {
    ctx = await requirePermission(entity.module, 'edit')
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  const result = sanitizeMasterInput(entity, body, { partial: true })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

  const admin = supabaseAdmin()
  const refCheck = await assertRefsInAccount(admin, entity, result.values, ctx.accountId)
  if (refCheck) return refCheck

  const scoped = await checkScope(admin, entity, ctx, id)
  if (scoped instanceof NextResponse) return scoped
  if (!rowInScope(scoped.scope, { ...scoped.row, ...result.values })) {
    return NextResponse.json({ error: OUT_OF_SCOPE_MESSAGE }, { status: 403 })
  }

  const { data, error } = await admin
    .from(entity.table)
    .update(result.values)
    .eq('id', id)
    .eq('account_id', ctx.accountId)
    .is('deleted_at', null)
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
  if (entity.readOnly) {
    return NextResponse.json({ error: 'Managed from Master → Users' }, { status: 405 })
  }

  let ctx
  try {
    ctx = await requirePermission(entity.module, 'delete')
  } catch (err) {
    return toErrorResponse(err)
  }

  const admin = supabaseAdmin()

  const scoped = await checkScope(admin, entity, ctx, id)
  if (scoped instanceof NextResponse) return scoped

  // A role still held by someone can't go: they'd keep its permissions
  // with no way to see or change them. Move them to another role first.
  if (entity.table === 'designations') {
    const { count, error: inUseError } = await admin
      .from('profiles')
      .select('user_id', { count: 'exact', head: true })
      .eq('account_id', ctx.accountId)
      .eq('designation_id', id)
    if (inUseError) return NextResponse.json({ error: inUseError.message }, { status: 500 })
    if (count) {
      return NextResponse.json(
        { error: `This role is assigned to ${count} ${count === 1 ? 'person' : 'people'}. Give them another role first.` },
        { status: 409 },
      )
    }
  }

  // Bookable staff with a login belong to Users: deleting the row here
  // would be undone the next time their user changes (syncDoctorForUser
  // revives it). Switch them off here, or remove the user.
  if (entity.table === 'doctors') {
    const { data: linked, error: linkedError } = await admin
      .from('doctors')
      .select('user_id')
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .maybeSingle()
    if (linkedError) return NextResponse.json({ error: linkedError.message }, { status: 500 })
    if (linked?.user_id) {
      return NextResponse.json(
        { error: 'This person has a login. Remove them from Master → Users, or switch them off here.' },
        { status: 409 },
      )
    }
  }

  // Soft delete: the row stays (appointments and history still point at
  // it) but is switched off and hidden from every list. Undo by clearing
  // deleted_at in the database.
  const { data, error } = await admin
    .from(entity.table)
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id)
    .eq('account_id', ctx.accountId)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
