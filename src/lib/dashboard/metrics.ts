import { minutesOf, type DayHours, type Weekday } from '@/lib/booking/settings'
import { addDays, localDay, weekdayOf } from '@/lib/booking/slots'
import { bucketFor, type DateRange } from './range'

/**
 * Dashboard metric maths — pure, over the minimal appointment rows the
 * range loaders fetch. No payments exist in this app, so "takings" is an
 * estimate from service prices; booked appointments store the service
 * by NAME (appointments.service), so prices are matched by name.
 */

export interface ApptRow {
  starts_at: string
  ends_at: string
  status: string
  service: string | null
  doctor_id: string | null
  contact_id: string | null
  source?: string | null
}

const live = (r: ApptRow) => r.status !== 'cancelled'

/** no_show ÷ (completed + no_show), in percent; null when neither happened. */
export function noShowRate(rows: ApptRow[]): number | null {
  let done = 0
  let missed = 0
  for (const r of rows) {
    if (r.status === 'completed') done++
    else if (r.status === 'no_show') missed++
  }
  const total = done + missed
  return total ? Math.round((missed / total) * 100) : null
}

/** Distinct contacts in the range who have 2+ completed bookings ever. */
export function returningClients(rangeRows: ApptRow[], completedCountByContact: Map<string, number>): number {
  const seen = new Set<string>()
  for (const r of rangeRows) {
    if (r.contact_id && (completedCountByContact.get(r.contact_id) ?? 0) >= 2) seen.add(r.contact_id)
  }
  return seen.size
}

export const serviceKey = (name: string) => name.trim().toLowerCase()

/** Sum of prices of completed bookings; null when no service has a price. */
export function estimatedTakings(rows: ApptRow[], priceByService: Map<string, number>): number | null {
  if (![...priceByService.values()].some((p) => p > 0)) return null
  let sum = 0
  for (const r of rows) {
    if (r.status !== 'completed' || !r.service) continue
    sum += priceByService.get(serviceKey(r.service)) ?? 0
  }
  return Math.round(sum * 100) / 100
}

/**
 * Booked minutes of non-cancelled bookings ÷ (open minutes × staff), in
 * percent. Open minutes come from booking settings' opening hours for
 * each day of the range. Staff leave isn't subtracted (v1).
 */
export function utilisation(
  rows: ApptRow[],
  hours: Record<Weekday, DayHours>,
  range: DateRange,
  staffCount: number,
): number | null {
  let open = 0
  for (let d = range.fromDay; d <= range.toDay; d = addDays(d, 1)) {
    const h = hours[weekdayOf(d)]
    if (h?.open) open += Math.max(0, minutesOf(h.end) - minutesOf(h.start))
  }
  const capacity = open * staffCount
  if (!capacity) return null
  let booked = 0
  for (const r of rows) {
    if (!live(r)) continue
    booked += Math.max(0, (Date.parse(r.ends_at) - Date.parse(r.starts_at)) / 60_000)
  }
  return Math.round((booked / capacity) * 100)
}

export function countBy<K extends string>(rows: ApptRow[], key: (r: ApptRow) => K | null): { key: K; count: number }[] {
  const m = new Map<K, number>()
  for (const r of rows) {
    const k = key(r)
    if (k) m.set(k, (m.get(k) ?? 0) + 1)
  }
  return [...m.entries()].map(([k, count]) => ({ key: k, count })).sort((a, b) => b.count - a.count)
}

function bucketStart(day: string, size: 'day' | 'week' | 'month'): string {
  if (size === 'day') return day
  if (size === 'week') return addDays(day, -((weekdayOf(day) + 6) % 7))
  return `${day.slice(0, 8)}01`
}

function nextBucket(key: string, size: 'day' | 'week' | 'month'): string {
  if (size === 'day') return addDays(key, 1)
  if (size === 'week') return addDays(key, 7)
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10)
}

function bucketLabel(key: string, size: 'day' | 'week' | 'month'): string {
  const d = new Date(`${key}T00:00:00Z`)
  const opts: Intl.DateTimeFormatOptions =
    size === 'month' ? { month: 'short', year: 'numeric' } : size === 'week' ? { day: 'numeric', month: 'short' } : { weekday: 'short', day: 'numeric' }
  return new Intl.DateTimeFormat(undefined, { ...opts, timeZone: 'UTC' }).format(d)
}

/** Counts per day/week/month bucket over the range, zeros included. */
export function bucketSeries(rows: { at: string }[], range: DateRange): { key: string; label: string; count: number }[] {
  const size = bucketFor(range)
  const counts = new Map<string, number>()
  for (const r of rows) {
    const k = bucketStart(localDay(new Date(r.at), range.tz), size)
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  const out: { key: string; label: string; count: number }[] = []
  for (let k = bucketStart(range.fromDay, size); k <= range.toDay; k = nextBucket(k, size)) {
    out.push({ key: k, label: bucketLabel(k, size), count: counts.get(k) ?? 0 })
  }
  return out
}

/** The bucket keys of a range, in order, with their labels. */
function bucketKeys(range: DateRange): { key: string; label: string; size: 'day' | 'week' | 'month' }[] {
  const size = bucketFor(range)
  const out: { key: string; label: string; size: 'day' | 'week' | 'month' }[] = []
  for (let k = bucketStart(range.fromDay, size); k <= range.toDay; k = nextBucket(k, size)) {
    out.push({ key: k, label: bucketLabel(k, size), size })
  }
  return out
}

/** Bookings per bucket for the trend chart: in-clinic, via WhatsApp, cancelled + no-show. */
export function trendPoints(
  rows: ApptRow[],
  range: DateRange,
): { day: string; label: string; inClinic: number; viaWhatsApp: number; cancelled: number }[] {
  const keys = bucketKeys(range)
  const pts = new Map(keys.map(({ key, label }) => [key, { day: key, label, inClinic: 0, viaWhatsApp: 0, cancelled: 0 }]))
  const size = keys[0]?.size ?? 'day'
  for (const r of rows) {
    const p = pts.get(bucketStart(localDay(new Date(r.starts_at), range.tz), size))
    if (!p) continue
    if (r.status === 'cancelled' || r.status === 'no_show') p.cancelled++
    else if (r.source === 'whatsapp') p.viaWhatsApp++
    else p.inClinic++
  }
  return [...pts.values()]
}

/** Messages per bucket for the conversations chart. */
export function messageSeries(
  rows: { at: string; incoming: boolean }[],
  range: DateRange,
): { day: string; incoming: number; outgoing: number }[] {
  const keys = bucketKeys(range)
  const pts = new Map(keys.map(({ key }) => [key, { day: key, incoming: 0, outgoing: 0 }]))
  const size = keys[0]?.size ?? 'day'
  for (const r of rows) {
    const p = pts.get(bucketStart(localDay(new Date(r.at), range.tz), size))
    if (!p) continue
    if (r.incoming) p.incoming++
    else p.outgoing++
  }
  return [...pts.values()]
}
