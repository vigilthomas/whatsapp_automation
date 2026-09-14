import type { SupabaseClient } from '@supabase/supabase-js'
import type { Appointment } from '@/lib/appointments/model'
import { addDays } from '@/lib/appointments/model'

// Clinic-dashboard loaders. All go through the caller's RLS-scoped
// browser client, like the rest of src/lib/dashboard/queries.ts, so
// nothing here needs an account filter.

const APPOINTMENT_SELECT =
  'id, clinic_id, doctor_id, contact_id, service, starts_at, ends_at, status, source, notes, created_at, updated_at, ' +
  'contact:contacts(id, name, phone), doctor:doctors(id, name), clinic:clinics(id, name)'

export interface TrendPoint {
  /** YYYY-MM-DD local */
  day: string
  label: string
  inClinic: number
  viaWhatsApp: number
  cancelled: number
}

export interface DoctorLoad {
  id: string
  name: string
  speciality: string | null
  /** Non-cancelled appointments today. */
  booked: number
}

export interface RecentConversation {
  id: string
  contactName: string
  lastMessage: string | null
  lastMessageAt: string | null
  unread: number
}

export interface ClinicTodayBundle {
  today: Appointment[]
  patientsTotal: number
  openConversations: number
}

function startOfLocalDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}
function localKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Today's appointments plus the two headline counts. */
export async function loadClinicToday(db: SupabaseClient): Promise<ClinicTodayBundle> {
  const start = startOfLocalDay(new Date())
  const end = addDays(start, 1)
  const [appts, patients, convos] = await Promise.all([
    db
      .from('appointments')
      .select(APPOINTMENT_SELECT)
      .gte('starts_at', start.toISOString())
      .lt('starts_at', end.toISOString())
      .order('starts_at', { ascending: true }),
    db.from('contacts').select('id', { count: 'exact', head: true }),
    db.from('conversations').select('id', { count: 'exact', head: true }).eq('status', 'open'),
  ])
  if (appts.error) throw appts.error
  return {
    today: (appts.data as unknown as Appointment[]) ?? [],
    patientsTotal: patients.count ?? 0,
    openConversations: convos.count ?? 0,
  }
}

/** Last `days` days of appointment counts, split the way the chart wants. */
export async function loadAppointmentsTrend(db: SupabaseClient, days = 7): Promise<TrendPoint[]> {
  const end = addDays(startOfLocalDay(new Date()), 1)
  const start = addDays(end, -days)
  const { data, error } = await db
    .from('appointments')
    .select('starts_at, status, source')
    .gte('starts_at', start.toISOString())
    .lt('starts_at', end.toISOString())
  if (error) throw error

  const fmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
  const points = new Map<string, TrendPoint>()
  for (let i = 0; i < days; i++) {
    const d = addDays(start, i)
    points.set(localKey(d), { day: localKey(d), label: fmt.format(d), inClinic: 0, viaWhatsApp: 0, cancelled: 0 })
  }
  for (const row of data ?? []) {
    const p = points.get(localKey(new Date(row.starts_at)))
    if (!p) continue
    if (row.status === 'cancelled' || row.status === 'no_show') p.cancelled++
    else if (row.source === 'whatsapp') p.viaWhatsApp++
    else p.inClinic++
  }
  return [...points.values()]
}

/** Active doctors with how many slots they have booked today. */
export async function loadDoctorLoad(db: SupabaseClient, today: Appointment[]): Promise<DoctorLoad[]> {
  const { data, error } = await db
    .from('doctors')
    .select('id, name, speciality')
    .eq('is_active', true)
    .order('name', { ascending: true })
  if (error) throw error
  const counts = new Map<string, number>()
  for (const a of today) {
    if (!a.doctor_id || a.status === 'cancelled') continue
    counts.set(a.doctor_id, (counts.get(a.doctor_id) ?? 0) + 1)
  }
  return (data ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    speciality: d.speciality,
    booked: counts.get(d.id) ?? 0,
  }))
}

/** The most recently active WhatsApp conversations. */
export async function loadRecentConversations(
  db: SupabaseClient,
  limit = 4,
): Promise<RecentConversation[]> {
  const { data, error } = await db
    .from('conversations')
    .select('id, last_message_text, last_message_at, unread_count, contact:contacts(name, phone)')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []).map((row) => {
    const c = row.contact as unknown as { name: string | null; phone: string } | null
    return {
      id: row.id,
      contactName: c?.name?.trim() || c?.phone || '—',
      lastMessage: row.last_message_text,
      lastMessageAt: row.last_message_at,
      unread: row.unread_count ?? 0,
    }
  })
}
