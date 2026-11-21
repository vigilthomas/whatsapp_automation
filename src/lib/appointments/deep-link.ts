import { isDay } from '@/lib/dashboard/range'
import { isAppointmentStatus, type AppointmentStatus } from './model'

/**
 * `/appointments?from=&to=&branch=&status=` — how a dashboard card opens
 * Appointments already filtered to its range, branch and status. The
 * calendar shows one day or one week, so a longer range opens the week
 * of its LAST day — the most recent, which is what "this month" or
 * "last 30 days" usually means to look at. Unknown or malformed values are ignored.
 */
export interface AppointmentsLink {
  /** Local midnight of `from` (one day) or `to` (longer ranges). */
  day: Date | null
  view: 'day' | 'week' | null
  branch: string | null
  status: AppointmentStatus | null
}

export function parseAppointmentsLink(params: URLSearchParams): AppointmentsLink {
  const from = params.get('from')
  const to = params.get('to')
  let day: Date | null = null
  let view: AppointmentsLink['view'] = null
  if (isDay(from)) {
    const longer = isDay(to) && to !== from
    const [y, m, d] = (longer ? to : from).split('-').map(Number)
    day = new Date(y, m - 1, d)
    view = longer ? 'week' : 'day'
  }
  const status = params.get('status')
  return {
    day,
    view,
    branch: params.get('branch') || null,
    status: isAppointmentStatus(status) ? status : null,
  }
}
