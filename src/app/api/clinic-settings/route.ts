import { NextResponse } from 'next/server'
import { getCurrentAccount, toErrorResponse } from '@/lib/auth/account'
import { requirePermission } from '@/lib/auth/permission-guard'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { DEFAULT_CLINIC_SETTINGS, parseClinicSettings } from '@/lib/clinic/settings'

// Clinic opening hours, holidays and closed dates (migration 060,
// Settings → Clinic).
//
// GET is open to every member of the account, not gated on the
// `settings-clinic` module: the appointment dialog and calendar need the
// hours to offer slots even for people who may not open the settings
// section. The rows hold nothing sensitive (hours and holiday names).
//
// PUT needs Edit on `settings-clinic` (by default only owners without a
// role and the super admin have it; Access control can grant it). Whatever
// arrives is parsed into a complete, valid document before it's stored,
// and the write uses the service role scoped to the caller's account.

/** Postgres "undefined_table": migration 060 hasn't been run. */
const UNDEFINED_TABLE = '42P01'

export async function GET() {
  try {
    const { supabase } = await getCurrentAccount()
    const { data, error } = await supabase.from('clinic_settings').select('config, updated_at').maybeSingle()
    if (error?.code === UNDEFINED_TABLE) {
      return NextResponse.json({ settings: DEFAULT_CLINIC_SETTINGS, updated_at: null, available: false })
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({
      settings: parseClinicSettings(data?.config),
      updated_at: data?.updated_at ?? null,
      available: true,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function PUT(request: Request) {
  let ctx
  try {
    ctx = await requirePermission('settings-clinic', 'edit')
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = (await request.json().catch(() => null)) as { settings?: unknown } | null
  if (!body || typeof body !== 'object' || !body.settings || typeof body.settings !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  const settings = parseClinicSettings(body.settings)

  const { data, error } = await supabaseAdmin()
    .from('clinic_settings')
    .upsert({
      account_id: ctx.accountId,
      config: settings,
      updated_by: ctx.userId,
      updated_at: new Date().toISOString(),
    })
    .select('config, updated_at')
    .single()
  if (error?.code === UNDEFINED_TABLE) {
    return NextResponse.json({ error: 'Run migration 060_clinic_settings.sql first.' }, { status: 503 })
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ settings: parseClinicSettings(data.config), updated_at: data.updated_at, available: true })
}
