import { addDays, localDay, weekdayOf } from '@/lib/booking/slots'
import type { ListAppointment } from './range-queries'

/**
 * Small pure helpers behind the patients table and the upcoming
 * appointments column on the dashboard.
 */

/**
 * Which visit this booking is for the patient, from their completed
 * visits ever: a completed booking is one of them; one still to come
 * (or missed) would be the next.
 */
export function visitNumber(status: string, completedEver: number): number {
  return status === 'completed' ? Math.max(1, completedEver) : completedEver + 1
}

/** Bookings grouped by their business-timezone day, in the given order. */
export function groupByDay(rows: readonly ListAppointment[], tz: string): { day: string; items: ListAppointment[] }[] {
  const out: { day: string; items: ListAppointment[] }[] = []
  for (const r of rows) {
    const day = localDay(new Date(r.starts_at), tz)
    const last = out[out.length - 1]
    if (last && last.day === day) last.items.push(r)
    else out.push({ day, items: [r] })
  }
  return out
}

/** Rows whose patient, phone, service or doctor contains the search, ignoring case. */
export function searchRows(rows: readonly ListAppointment[], query: string): ListAppointment[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...rows]
  return rows.filter((r) =>
    [r.contact?.name, r.contact?.phone, r.service, r.doctor?.name].some((v) => v?.toLowerCase().includes(q)),
  )
}

/** The Monday-to-Sunday week (YYYY-MM-DD days) containing `day`. */
export function weekOf(day: string): string[] {
  const monday = addDays(day, -((weekdayOf(day) + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}
