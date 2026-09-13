import { NextResponse } from 'next/server'
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import {
  MASTER_ENTITIES,
  isMasterEntitySlug,
  sanitizeMasterInput,
} from '@/lib/master/entities'
import { assertClinicInAccount } from '@/lib/master/server'

// Clinic master data (clinics / doctors / clinic-admins) — one route
// for all three, driven by the registry in src/lib/master/entities.ts.
// GET lists; POST creates. Mirrors the quick-replies route: RLS-scoped
// read via the user client, service-role write after an explicit role
// check + account scope (the admin client bypasses RLS, so tenancy is
// enforced here, not by Postgres).

type Params = { params: Promise<{ entity: string }> }

export async function GET(_request: Request, { params }: Params) {
  const { entity: slug } = await params
  if (!isMasterEntitySlug(slug)) {
    return NextResponse.json({ error: 'Unknown entity' }, { status: 404 })
  }
  const entity = MASTER_ENTITIES[slug]
  try {
    const { supabase } = await getCurrentAccount()
    // RLS (<table>_select) scopes to the caller's account.
    const { data, error } = await supabase
      .from(entity.table)
      .select('*')
      .order('name', { ascending: true })
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

  let ctx
  try {
    ctx = await requireRole('admin')
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = await request.json().catch(() => null)
  const result = sanitizeMasterInput(entity, body, { partial: false })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

  const admin = supabaseAdmin()
  const clinicCheck = await assertClinicInAccount(admin, result.values, ctx.accountId)
  if (clinicCheck) return clinicCheck

  const { data, error } = await admin
    .from(entity.table)
    .insert({ ...result.values, account_id: ctx.accountId })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ record: data }, { status: 201 })
}
