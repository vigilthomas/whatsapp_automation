import { describe, expect, it } from 'vitest'
import { parseAppointmentsLink } from './deep-link'

describe('parseAppointmentsLink', () => {
  it('opens the day view on a one-day range', () => {
    const l = parseAppointmentsLink(new URLSearchParams('from=2026-11-21&to=2026-11-21'))
    expect(l.view).toBe('day')
    expect([l.day?.getFullYear(), l.day?.getMonth(), l.day?.getDate(), l.day?.getHours()]).toEqual([2026, 10, 21, 0])
  })
  it('opens the week view on a longer range, at its last (most recent) day', () => {
    const l = parseAppointmentsLink(new URLSearchParams('from=2026-11-01&to=2026-11-21'))
    expect(l.view).toBe('week')
    expect(l.day?.getDate()).toBe(21)
  })
  it('keeps a known status and a branch id', () => {
    expect(parseAppointmentsLink(new URLSearchParams('status=no_show&branch=b1'))).toMatchObject({ status: 'no_show', branch: 'b1' })
  })
  it('ignores junk', () => {
    expect(parseAppointmentsLink(new URLSearchParams('from=nope&status=bogus'))).toEqual({ day: null, view: null, branch: null, status: null })
  })
})
