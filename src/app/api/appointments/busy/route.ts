import { NextResponse } from 'next/server'
import { toErrorResponse } from '@/lib/auth/account'
import { requirePermission } from '@/lib/auth/permission-guard'
import { supabaseAdmin } from '@/lib/automations/admin-client'

/**
 * GET /api/appointments/busy?doctor_id=<uuid>&from=<iso>&to=<iso>
 *
 * When a doctor is taken, across EVERY branch of the clinic, for the
 * booking dialog's slot grid.
 *
 * Why it exists: `GET /api/appointments` honours the caller's Data
 * access (Access control, migration 063), so a receptionist limited to
 * one branch can't see that doctor's bookings at another branch. Those
 * slots then looked free and could be double-booked. This route ignores
 * Data access on purpose, so it returns times only: no patient, no
 * notes, no branch. The service name is included because the grid
 * spaces slots by each service's buffer.
 *
 * Needs Appointments read. The doctor must belong to the caller's
 * account (service-role query, so `account_id` is filtered explicitly).
 * The window is capped at 31 days.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_WINDOW_MS = 31 * 86_400_000

export async function GET(request: Request) {
  let ctx
  try {
    ctx = await requirePermission('appointments', 'read')
  } catch (err) {
    return toErrorResponse(err)
  }

  const url = new URL(request.url)
  const doctorId = url.searchParams.get('doctor_id') ?? ''
  const from = new Date(url.searchParams.get('from') ?? '')
  const to = new Date(url.searchParams.get('to') ?? '')
  if (!UUID_RE.test(doctorId)) {
    return NextResponse.json({ error: 'doctor_id is required' }, { status: 400 })
  }
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
    return NextResponse.json({ error: 'from and to must be ISO times, from before to' }, { status: 400 })
  }
  if (to.getTime() - from.getTime() > MAX_WINDOW_MS) {
    return NextResponse.json({ error: 'window is limited to 31 days' }, { status: 400 })
  }

  const admin = supabaseAdmin()
  const { data, error } = await admin
    .from('appointments')
    .select('id, starts_at, ends_at, service')
    .eq('account_id', ctx.accountId)
    .eq('doctor_id', doctorId)
    .neq('status', 'cancelled')
    .lt('starts_at', to.toISOString())
    .gt('ends_at', from.toISOString())
    .order('starts_at', { ascending: true })
    .limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ busy: data ?? [] })
}
