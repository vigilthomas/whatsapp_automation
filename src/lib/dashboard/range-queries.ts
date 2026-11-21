import type { SupabaseClient } from '@supabase/supabase-js'
import type { Appointment } from '@/lib/appointments/model'
import { DEFAULT_CONFIG, parseBookingConfig, type DayHours, type Weekday } from '@/lib/booking/settings'
import { addDays, zonedInstant } from '@/lib/booking/slots'
import { serviceKey, type ApptRow } from './metrics'
import type { DateRange } from './range'

/**
 * Dashboard loaders for a chosen date range (and optional branch).
 *
 * All run in the browser on the caller's RLS-scoped client, like the
 * rest of lib/dashboard: migration 058/063 already narrows appointments
 * to the role's data scope (all / branch / own / custom), so these
 * never filter by account or scope themselves. The branch argument only
 * narrows further.
 *
 * PostgREST returns at most 1000 rows per request, so row loaders page
 * (`fetchAll`) up to ROW_CAP — a 12-month range at a busy clinic can
 * pass 1000 bookings. Counts use `head: true` count queries instead.
 */

type DB = SupabaseClient

const PAGE = 1000
/** Safety stop for one range query (20 pages). */
export const ROW_CAP = 20_000

interface Page<T> {
  data: T[] | null
  error: unknown
}

/**
 * Run `page(from, to)` until a short page comes back or ROW_CAP is hit.
 * Range loaders read newest first, so a capped result loses the OLDEST
 * rows (the far end of a long range), never the days people look at.
 */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<Page<T>>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; from < ROW_CAP; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) throw error
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < PAGE) return out
  }
  console.warn(`[dashboard] stopped at ${ROW_CAP} rows; older rows in the range are not counted`)
  return out
}

interface Counted {
  count: number | null
  error: unknown
}

/** A head count's number, throwing its error rather than reading 0. */
function countOf(r: Counted): number {
  if (r.error) throw r.error
  return r.count ?? 0
}

const APPT_ROW = 'starts_at, ends_at, status, service, doctor_id, contact_id, source'

export async function loadAppointmentsIn(db: DB, range: DateRange, branch: string | null): Promise<ApptRow[]> {
  return fetchAll<ApptRow>((a, b) => {
    let q = db
      .from('appointments')
      .select(APPT_ROW)
      .gte('starts_at', range.from.toISOString())
      .lt('starts_at', range.to.toISOString())
    if (branch) q = q.eq('branch_id', branch)
    return q.order('starts_at', { ascending: false }).range(a, b) as unknown as PromiseLike<Page<ApptRow>>
  })
}

const APPOINTMENT_SELECT =
  'id, branch_id, doctor_id, contact_id, service, starts_at, ends_at, status, source, notes, created_at, updated_at, ' +
  'contact:contacts(id, name, phone), doctor:doctors(id, name), branch:branches(id, name)'

/** Full appointments of the range's FIRST day — the queue card is point-in-time. */
export async function loadDayAppointments(db: DB, range: DateRange, branch: string | null): Promise<Appointment[]> {
  const to = zonedInstant(addDays(range.fromDay, 1), 0, range.tz)
  let q = db
    .from('appointments')
    .select(APPOINTMENT_SELECT)
    .gte('starts_at', range.from.toISOString())
    .lt('starts_at', to.toISOString())
  if (branch) q = q.eq('branch_id', branch)
  const { data, error } = await q.order('starts_at', { ascending: true })
  if (error) throw error
  return (data as unknown as Appointment[]) ?? []
}

/** Completed bookings ever, per contact (for "returning clients"). */
export async function loadCompletedCountByContact(db: DB, contactIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  const ids = [...new Set(contactIds)]
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200)
    const rows = await fetchAll<{ contact_id: string }>((a, b) =>
      db
        .from('appointments')
        .select('contact_id')
        .eq('status', 'completed')
        .in('contact_id', chunk)
        .range(a, b) as unknown as PromiseLike<Page<{ contact_id: string }>>,
    )
    for (const r of rows) counts.set(r.contact_id, (counts.get(r.contact_id) ?? 0) + 1)
  }
  return counts
}

/** Active services: normalised name → price. */
export async function loadServicePrices(db: DB): Promise<Map<string, number>> {
  const { data, error } = await db.from('services').select('name, price').eq('is_active', true).is('deleted_at', null)
  if (error) throw error
  const m = new Map<string, number>()
  for (const s of (data ?? []) as { name: string; price: number | string | null }[]) {
    m.set(serviceKey(s.name), Number(s.price) || 0)
  }
  return m
}

export interface BookingHours {
  tz: string
  hours: Record<Weekday, DayHours>
}

/** Business timezone and opening hours (booking settings); defaults on any failure. */
export async function loadBookingHours(db: DB): Promise<BookingHours> {
  try {
    const { data, error } = await db.from('booking_settings').select('config').maybeSingle()
    if (error) throw error
    const c = parseBookingConfig((data as { config?: unknown } | null)?.config)
    return { tz: c.timezone, hours: c.hours }
  } catch {
    return { tz: DEFAULT_CONFIG.timezone, hours: DEFAULT_CONFIG.hours }
  }
}

export interface StaffRow {
  id: string
  name: string
  speciality: string | null
}

/** Active bookable staff (doctors table), optionally in one branch. */
export async function loadStaff(db: DB, branch: string | null): Promise<StaffRow[]> {
  let q = db.from('doctors').select('id, name, speciality').eq('is_active', true).is('deleted_at', null)
  if (branch) q = q.eq('branch_id', branch)
  const { data, error } = await q.order('name', { ascending: true })
  if (error) throw error
  return (data ?? []) as StaffRow[]
}

/** Rows of `table` created in the range. */
export async function countCreatedIn(db: DB, table: 'contacts' | 'conversations', range: DateRange): Promise<number> {
  const { count, error } = await db
    .from(table)
    .select('id', { count: 'exact', head: true })
    .gte('created_at', range.from.toISOString())
    .lt('created_at', range.to.toISOString())
  if (error) throw error
  return count ?? 0
}

export interface PointInTimeCounts {
  openChats: number
  customersTotal: number
}

export async function loadPointInTimeCounts(db: DB): Promise<PointInTimeCounts> {
  const [convos, contacts] = await Promise.all([
    db.from('conversations').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    db.from('contacts').select('id', { count: 'exact', head: true }),
  ])
  return { openChats: countOf(convos), customersTotal: countOf(contacts) }
}

export interface DealsSummary {
  openCount: number
  openValue: number
  won: number
  lost: number
}

/**
 * Open pipeline now, plus deals won / lost in the range. Deals have no
 * closed-at column, so "won in the range" means status won AND last
 * updated in the range — an edit to an old won deal moves it.
 */
export async function loadDealsSummary(db: DB, range: DateRange): Promise<DealsSummary> {
  const inRange = (status: string) =>
    db
      .from('deals')
      .select('id', { count: 'exact', head: true })
      .eq('status', status)
      .gte('updated_at', range.from.toISOString())
      .lt('updated_at', range.to.toISOString())
  type Row = { value: number | string | null }
  const [values, won, lost] = await Promise.all([
    fetchAll<Row>((a, b) =>
      db.from('deals').select('value').eq('status', 'open').order('id').range(a, b) as unknown as PromiseLike<Page<Row>>,
    ),
    inRange('won'),
    inRange('lost'),
  ])
  return {
    openCount: values.length,
    openValue: values.reduce((s, d) => s + (Number(d.value) || 0), 0),
    won: countOf(won as Counted),
    lost: countOf(lost as Counted),
  }
}

export interface BroadcastResults {
  count: number
  sent: number
  delivered: number
  read: number
}

/** Totals over broadcasts created in the range. */
export async function loadBroadcastResults(db: DB, range: DateRange): Promise<BroadcastResults> {
  const { data, error } = await db
    .from('broadcasts')
    .select('sent_count, delivered_count, read_count')
    .gte('created_at', range.from.toISOString())
    .lt('created_at', range.to.toISOString())
  if (error) throw error
  const rows = (data ?? []) as { sent_count: number | null; delivered_count: number | null; read_count: number | null }[]
  return {
    count: rows.length,
    sent: rows.reduce((s, r) => s + (r.sent_count ?? 0), 0),
    delivered: rows.reduce((s, r) => s + (r.delivered_count ?? 0), 0),
    read: rows.reduce((s, r) => s + (r.read_count ?? 0), 0),
  }
}

/** Messages in the range, bucketed by the caller (bucketSeries). */
export async function loadMessagesIn(db: DB, range: DateRange): Promise<{ at: string; incoming: boolean }[]> {
  const rows = await fetchAll<{ created_at: string; sender_type: string }>((a, b) =>
    db
      .from('messages')
      .select('created_at, sender_type')
      .gte('created_at', range.from.toISOString())
      .lt('created_at', range.to.toISOString())
      .order('created_at', { ascending: false })
      .range(a, b) as unknown as PromiseLike<Page<{ created_at: string; sender_type: string }>>,
  )
  return rows.map((r) => ({ at: r.created_at, incoming: r.sender_type === 'customer' }))
}

/** One booking as the patients table and the upcoming column show it. */
export interface ListAppointment {
  id: string
  starts_at: string
  service: string | null
  status: string
  contact_id: string | null
  contact: { name: string | null; phone?: string | null } | null
  doctor: { name: string } | null
}

const LIST_SELECT = 'id, starts_at, service, status, contact_id, contact:contacts(name, phone), doctor:doctors(name)'
/** The table pages through at most this many of the range's bookings. */
export const LIST_CAP = 1000

/** The range's bookings, newest first, with patient and doctor names (patients table). */
export async function loadAppointmentList(db: DB, range: DateRange, branch: string | null): Promise<ListAppointment[]> {
  let q = db
    .from('appointments')
    .select(LIST_SELECT)
    .gte('starts_at', range.from.toISOString())
    .lt('starts_at', range.to.toISOString())
  if (branch) q = q.eq('branch_id', branch)
  const { data, error } = await q.order('starts_at', { ascending: false }).range(0, LIST_CAP - 1)
  if (error) throw error
  return (data as unknown as ListAppointment[]) ?? []
}

/**
 * Booked (scheduled / confirmed) appointments for 7 days from `fromDay`
 * in the business timezone, soonest first (upcoming column).
 */
export async function loadUpcoming(db: DB, fromDay: string, tz: string, branch: string | null): Promise<ListAppointment[]> {
  let q = db
    .from('appointments')
    .select(LIST_SELECT)
    .gte('starts_at', zonedInstant(fromDay, 0, tz).toISOString())
    .lt('starts_at', zonedInstant(addDays(fromDay, 7), 0, tz).toISOString())
    .in('status', ['scheduled', 'confirmed'])
  if (branch) q = q.eq('branch_id', branch)
  const { data, error } = await q.order('starts_at', { ascending: true }).range(0, 499)
  if (error) throw error
  return (data as unknown as ListAppointment[]) ?? []
}
