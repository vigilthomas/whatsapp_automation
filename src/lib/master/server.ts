import { NextResponse } from 'next/server'
import type { supabaseAdmin } from '@/lib/automations/admin-client'
import { isRefType, type MasterEntity, type RefType } from './entities'
import { isScopedTable, scopeFilter, type ScopeContext, type ScopeFilter } from '@/lib/auth/data-scope'

/** Where each kind of reference lives, and how to tell it's live and ours. */
const REF_TABLES: Record<RefType, { table: string; idColumn: string; live: boolean }> = {
  branch: { table: 'branches', idColumn: 'id', live: true },
  doctor: { table: 'doctors', idColumn: 'id', live: true },
  service: { table: 'services', idColumn: 'id', live: true },
  user: { table: 'profiles', idColumn: 'user_id', live: false },
}

/**
 * Every id a payload points at (branch, doctor, service, user) must be a
 * live record of the caller's own account. The service-role client won't
 * stop a cross-tenant id, and a bare FK check wouldn't either, so look
 * each one up. Shared by the create and update routes.
 */
export async function assertRefsInAccount(
  admin: ReturnType<typeof supabaseAdmin>,
  entity: MasterEntity,
  values: Record<string, unknown>,
  accountId: string,
): Promise<NextResponse | null> {
  for (const field of entity.fields) {
    if (!isRefType(field.type)) continue
    const id = values[field.key]
    if (typeof id !== 'string') continue
    const ref = REF_TABLES[field.type]
    let q = admin.from(ref.table).select(ref.idColumn).eq(ref.idColumn, id).eq('account_id', accountId)
    if (ref.live) q = q.is('deleted_at', null)
    const { data, error } = await q.maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: `${field.key} not found` }, { status: 400 })
  }
  return null
}

/**
 * The caller's data scope (Access control → Data access) for an
 * entity's table, or `null` when the table isn't scoped (only
 * Leaves is, today) or the role sees everything. Doctors share the
 * `appointments` module but are not narrowed by it — scope follows
 * the table, not the module.
 */
export async function entityScope(
  admin: ReturnType<typeof supabaseAdmin>,
  entity: MasterEntity,
  ctx: ScopeContext,
): Promise<ScopeFilter> {
  if (entity.table !== 'user_leaves' || !isScopedTable(entity.table)) return null
  return scopeFilter(admin, entity.table, ctx)
}
