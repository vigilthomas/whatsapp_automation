import { addDays, localDay, weekdayOf, zonedInstant } from '@/lib/booking/slots'

/**
 * Dashboard date ranges — pure, no I/O.
 *
 * Every boundary is a calendar day in the BUSINESS timezone (booking
 * settings' `timezone`), not the browser's: "Today" on the dashboard
 * must mean the clinic's today even when someone opens it from another
 * zone, or late at night on a laptop with a different clock.
 *
 * Ranges are whole days: `fromDay`..`toDay` inclusive, and `from`/`to`
 * are the matching instants (`to` exclusive) for `gte`/`lt` queries.
 * Weeks start on Monday.
 */

export const RANGE_PRESETS = ['today', 'yesterday', 'week', 'month', 'last30', 'custom'] as const
export type RangePreset = (typeof RANGE_PRESETS)[number]

/** Longest custom range; longer ones are clamped to end at `to`. */
export const MAX_RANGE_DAYS = 366

export interface DateRange {
  preset: RangePreset
  /** First day, YYYY-MM-DD, inclusive. */
  fromDay: string
  /** Last day, YYYY-MM-DD, inclusive. */
  toDay: string
  /** Start instant of fromDay in `tz`. */
  from: Date
  /** Start instant of the day after toDay in `tz` (exclusive). */
  to: Date
  days: number
  tz: string
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

export function isDay(v: unknown): v is string {
  if (typeof v !== 'string' || !DAY_RE.test(v)) return false
  const [y, m, d] = v.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

/** Whole days from a to b inclusive (a ≤ b). */
function spanDays(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)
  return Math.round(ms / 86_400_000) + 1
}

function build(preset: RangePreset, fromDay: string, toDay: string, tz: string): DateRange {
  return {
    preset,
    fromDay,
    toDay,
    from: zonedInstant(fromDay, 0, tz),
    to: zonedInstant(addDays(toDay, 1), 0, tz),
    days: spanDays(fromDay, toDay),
    tz,
  }
}

export function resolveRange(
  preset: RangePreset,
  now: Date,
  tz: string,
  custom?: { from?: string; to?: string },
): DateRange {
  const today = localDay(now, tz)
  switch (preset) {
    case 'yesterday': {
      const y = addDays(today, -1)
      return build(preset, y, y, tz)
    }
    case 'week':
      return build(preset, addDays(today, -((weekdayOf(today) + 6) % 7)), today, tz)
    case 'month':
      return build(preset, `${today.slice(0, 8)}01`, today, tz)
    case 'last30':
      return build(preset, addDays(today, -29), today, tz)
    case 'custom': {
      if (!isDay(custom?.from) || !isDay(custom?.to)) return build('today', today, today, tz)
      let [a, b] = [custom.from, custom.to]
      if (a > b) [a, b] = [b, a]
      if (spanDays(a, b) > MAX_RANGE_DAYS) a = addDays(b, -(MAX_RANGE_DAYS - 1))
      return build(preset, a, b, tz)
    }
    case 'today':
    default:
      return build('today', today, today, tz)
  }
}

/** The same-length span that ends the day before `r` starts. */
export function previousRange(r: DateRange): DateRange {
  const toDay = addDays(r.fromDay, -1)
  return build(r.preset, addDays(toDay, -(r.days - 1)), toDay, r.tz)
}

/** Chart bucket size for a range. */
export function bucketFor(r: DateRange): 'day' | 'week' | 'month' {
  if (r.days <= 31) return 'day'
  if (r.days <= 182) return 'week'
  return 'month'
}

/** Change from prev to cur in percent, rounded; null when prev is 0. */
export function percentChange(cur: number, prev: number): number | null {
  if (!prev) return null
  return Math.round(((cur - prev) / prev) * 100)
}
