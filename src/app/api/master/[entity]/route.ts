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

// Master data (branches / doctors / clinic-admins / services / roles) — one route
// for all three, driven by the registry in src/lib/master/entities.ts.
// GET lists; POST creates. RLS-scoped read via the user client,
// service-role write after the designation permission check + account
// scope (the admin client bypasses RLS, so tenancy is enforced here,
// not by Postgres). Every handler goes through `requirePermission`
// so a designation's read / write matrix is honoured server-side.
// Leaves also follow the role's data scope (`entityScope`): the list
// is narrowed and a new leave must be for someone inside it.

type Params = { params: Promise<{ entity: string }> }

export async function GET(_request: Request, { params }: Params) {
  const { entity: slug } = await params
  if (!isMasterEntitySlug(slug)) {
    return NextResponse.json({ error: 'Unknown entity' }, { status: 404 })
  }
  const entity = MASTER_ENTITIES[slug]
  try {
    const ctx = await requirePermission(entity.module, 'read')
    const scope = await entityScope(supabaseAdmin(), entity, ctx)
    if (scope && scope.values.length === 0) return NextResponse.json({ records: [] })
    // RLS (<table>_select) scopes to the caller's account.
    let q = ctx.supabase.from(entity.table).select('*').is('deleted_at', null)
    if (scope) q = q.in(scope.column, scope.values)
    const { data, error } = await q.order(entity.orderBy?.column ?? 'name', {
      ascending: entity.orderBy?.ascending ?? true,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ records: data ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function POST(request: Request, { params }: Params) {
  const { entity: slug } = await params
  if (!isMasterEntitySlug(slug)) {
    return NextResponse.json({ error: 'Unknown entity' }, { status: 404 })
  }
  const entity = MASTER_ENTITIES[slug]
  if (entity.readOnly) {
    return NextResponse.json({ error: 'Managed from Master → Users' }, { status: 405 })
  }

  let ctx
  try {
    ctx = await requirePermission(entity.module, 'write')
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  const admin = supabaseAdmin()
  let scope
  try {
    scope = await entityScope(admin, entity, ctx)
  } catch {
    return NextResponse.json({ error: 'Could not check data access' }, { status: 500 })
  }

  // Several picks at once (e.g. Doctor services: one doctor, many
  // services, each with its own time) → one record per pick.
  const multi = entity.fields.find((f) => f.multiOnCreate)
  const picks = multi && body && typeof body === 'object' ? (body as Record<string, unknown>)[`${multi.key}s`] : undefined
  if (multi && Array.isArray(picks)) {
    if (picks.length === 0) return NextResponse.json({ error: `${multi.key} is required` }, { status: 400 })
    if (picks.length > 100) return NextResponse.json({ error: 'Too many at once' }, { status: 400 })
    const { [`${multi.key}s`]: _drop, ...shared } = body as Record<string, unknown>
    void _drop
    const rows: Record<string, unknown>[] = []
    for (const pick of picks) {
      if (!pick || typeof pick !== 'object' || Array.isArray(pick)) {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
      }
      const result = sanitizeMasterInput(entity, { ...shared, ...(pick as Record<string, unknown>) }, { partial: false })
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
      const refCheck = await assertRefsInAccount(admin, entity, result.values, ctx.accountId)
      if (refCheck) return refCheck
      if (!rowInScope(scope, result.values)) return NextResponse.json({ error: OUT_OF_SCOPE_MESSAGE }, { status: 403 })
      rows.push({ ...result.values, account_id: ctx.accountId })
    }
    const { data, error } = await admin.from(entity.table).insert(rows).select()
    if (error) {
      const status = error.code === '23505' ? 409 : 500
      const message = error.code === '23505' ? 'One of these is already added' : error.message
      return NextResponse.json({ error: message }, { status })
    }
    return NextResponse.json({ records: data ?? [] }, { status: 201 })
  }

  const result = sanitizeMasterInput(entity, body, { partial: false })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

  const refCheck = await assertRefsInAccount(admin, entity, result.values, ctx.accountId)
  if (refCheck) return refCheck
  if (!rowInScope(scope, result.values)) return NextResponse.json({ error: OUT_OF_SCOPE_MESSAGE }, { status: 403 })

  const { data, error } = await admin
    .from(entity.table)
    .insert({ ...result.values, account_id: ctx.accountId })
    .select()
    .single()
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Already added' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ record: data }, { status: 201 })
}
