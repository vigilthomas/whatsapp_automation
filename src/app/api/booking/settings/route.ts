import { NextResponse } from 'next/server'
import { toErrorResponse } from '@/lib/auth/account'
import { requirePermission } from '@/lib/auth/permission-guard'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { parseBookingConfig } from '@/lib/booking/settings'

// Booking assistant settings (migration 053). Reading needs Automations →
// Read, saving needs Automations → Edit. Whatever is sent is parsed into a
// complete, valid config before it's stored.

export async function GET() {
  try {
    const { supabase } = await requirePermission('automations', 'read')
    const { data, error } = await supabase
      .from('booking_settings')
      .select('enabled, config, updated_at')
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({
      enabled: !!data?.enabled,
      config: parseBookingConfig(data?.config),
      updated_at: data?.updated_at ?? null,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

export async function PUT(request: Request) {
  let ctx
  try {
    ctx = await requirePermission('automations', 'edit')
  } catch (err) {
    return toErrorResponse(err)
  }

  const body = (await request.json().catch(() => null)) as { enabled?: unknown; config?: unknown } | null
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  const config = parseBookingConfig(body.config)

  const { data, error } = await supabaseAdmin()
    .from('booking_settings')
    .upsert({
      account_id: ctx.accountId,
      enabled: body.enabled === true,
      config,
      updated_at: new Date().toISOString(),
      updated_by: ctx.userId,
    })
    .select('enabled, config, updated_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ enabled: data.enabled, config: parseBookingConfig(data.config), updated_at: data.updated_at })
}
