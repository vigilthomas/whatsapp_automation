import { NextResponse } from 'next/server'
import type { supabaseAdmin } from '@/lib/automations/admin-client'
import type { AppointmentInput } from './model'

/**
 * Column list + embedded display names for every appointment read.
 * PostgREST resolves the FK embeds from the schema cache; the aliases
 * keep the wire shape matching `Appointment` in model.ts.
 */
export const APPOINTMENT_SELECT =
  'id, branch_id, doctor_id, contact_id, service, starts_at, ends_at, status, source, notes, created_at, updated_at, ' +
  'contact:contacts(id, name, phone), doctor:doctors(id, name), branch:branches(id, name)'

/**
 * Every FK in a payload must point inside the caller's account. The
 * service-role client would happily write a cross-tenant id, so look
 * each one up before the insert/update. Returns an error response or
 * null when everything checks out.
 */
export async function assertRefsInAccount(
  admin: ReturnType<typeof supabaseAdmin>,
  values: AppointmentInput,
  accountId: string,
): Promise<NextResponse | null> {
  const checks: Array<[table: string, id: string | null | undefined, label: string]> = [
    ['contacts', values.contact_id, 'contact_id'],
    ['doctors', values.doctor_id, 'doctor_id'],
    ['branches', values.branch_id, 'branch_id'],
  ]
  for (const [table, id, label] of checks) {
    if (typeof id !== 'string') continue
    const { data, error } = await admin
      .from(table)
      .select('id')
      .eq('id', id)
      .eq('account_id', accountId)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: `${label} not found` }, { status: 400 })
  }
  return null
}

/** Statuses that no longer hold their time slot. */
const FREE_STATUSES = ['cancelled'] as const

/**
 * An existing booking for the same doctor whose time overlaps
 * [startsAt, endsAt), or null when the slot is free. Excludes cancelled
 * bookings and, for an edit, the appointment itself.
 *
 * Runs on the service-role client and so sees EVERY branch, which is the
 * point: a role limited by Data access (Access control) may not see a
 * doctor's bookings at another branch, so the dialog's slot grid alone
 * can't be trusted to stop a double booking (security audit F-11).
 * Overlap is strict (touching end/start is fine); service buffers are a
 * slot-grid nicety, not something the server enforces.
 *
 * Not race-proof on its own: two requests in the same instant can both
 * pass. A Postgres exclusion constraint would close that; it isn't added
 * yet because existing data may already overlap.
 */
export async function findOverlap(
  admin: ReturnType<typeof supabaseAdmin>,
  args: { accountId: string; doctorId: string; startsAt: string; endsAt: string; excludeId?: string },
): Promise<{ id: string; starts_at: string; ends_at: string } | null> {
  let q = admin
    .from('appointments')
    .select('id, starts_at, ends_at')
    .eq('account_id', args.accountId)
    .eq('doctor_id', args.doctorId)
    .not('status', 'in', `(${FREE_STATUSES.join(',')})`)
    .lt('starts_at', args.endsAt)
    .gt('ends_at', args.startsAt)
  if (args.excludeId) q = q.neq('id', args.excludeId)
  const { data, error } = await q.limit(1).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as { id: string; starts_at: string; ends_at: string } | null) ?? null
}

/** The 409 a clashing booking gets. */
export function overlapResponse(clash: { starts_at: string; ends_at: string }): NextResponse {
  return NextResponse.json(
    {
      error: 'This doctor already has an appointment at that time. Pick another slot.',
      code: 'overlap',
      conflict: { starts_at: clash.starts_at, ends_at: clash.ends_at },
    },
    { status: 409 },
  )
}
