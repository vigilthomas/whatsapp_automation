import { describe, expect, it } from 'vitest'
import { groupByDay, searchRows, visitNumber, weekOf } from './list-helpers'
import type { ListAppointment } from './range-queries'

const row = (over: Partial<ListAppointment>): ListAppointment => ({
  id: 'a',
  starts_at: '2026-11-23T04:30:00Z',
  service: 'Cleaning',
  status: 'scheduled',
  contact_id: 'c1',
  contact: { name: 'Asha Menon' },
  doctor: { name: 'Dr. Neha' },
  ...over,
})

describe('visitNumber', () => {
  it('counts a completed booking among their completed visits', () => {
    expect(visitNumber('completed', 1)).toBe(1)
    expect(visitNumber('completed', 3)).toBe(3)
  })
  it('counts a booking still to come as the next visit', () => {
    expect(visitNumber('scheduled', 0)).toBe(1)
    expect(visitNumber('confirmed', 2)).toBe(3)
  })
})

describe('groupByDay', () => {
  it('groups by the business-timezone day, keeping order', () => {
    const rows = [
      row({ id: '1', starts_at: '2026-11-23T04:30:00Z' }),
      row({ id: '2', starts_at: '2026-11-23T19:00:00Z' }), // 00:30 on the 24th in Kolkata
      row({ id: '3', starts_at: '2026-11-24T05:00:00Z' }),
    ]
    expect(groupByDay(rows, 'Asia/Kolkata').map((g) => [g.day, g.items.map((r) => r.id)])).toEqual([
      ['2026-11-23', ['1']],
      ['2026-11-24', ['2', '3']],
    ])
  })
})

describe('searchRows', () => {
  const rows = [row({ id: '1' }), row({ id: '2', contact: { name: 'Ravi' }, service: 'Root canal', doctor: { name: 'Dr. Arjun' } })]
  it('matches patient, service or doctor, ignoring case', () => {
    expect(searchRows(rows, 'asha').map((r) => r.id)).toEqual(['1'])
    expect(searchRows(rows, 'ROOT').map((r) => r.id)).toEqual(['2'])
    expect(searchRows(rows, 'arjun').map((r) => r.id)).toEqual(['2'])
  })
  it('returns everything for an empty search', () => {
    expect(searchRows(rows, '  ')).toHaveLength(2)
  })
})

describe('weekOf', () => {
  it('lists the Monday-to-Sunday week containing the day', () => {
    expect(weekOf('2026-11-25')).toEqual([
      '2026-11-23',
      '2026-11-24',
      '2026-11-25',
      '2026-11-26',
      '2026-11-27',
      '2026-11-28',
      '2026-11-29',
    ])
  })
})
