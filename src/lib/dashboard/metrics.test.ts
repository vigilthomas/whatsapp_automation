import { describe, expect, it } from 'vitest'
import type { DayHours, Weekday } from '@/lib/booking/settings'
import { bucketSeries, countBy, messageSeries, trendPoints, estimatedTakings, noShowRate, returningClients, utilisation, type ApptRow } from './metrics'
import { resolveRange } from './range'

const row = (over: Partial<ApptRow>): ApptRow => ({
  starts_at: '2026-11-16T09:00:00Z',
  ends_at: '2026-11-16T09:30:00Z',
  status: 'completed',
  service: null,
  doctor_id: null,
  contact_id: null,
  ...over,
})

describe('noShowRate', () => {
  it('is no_show over completed + no_show', () => {
    const rows = [
      ...Array.from({ length: 3 }, () => row({ status: 'completed' })),
      row({ status: 'no_show' }),
      row({ status: 'cancelled' }),
      row({ status: 'cancelled' }),
    ]
    expect(noShowRate(rows)).toBe(25)
  })
  it('is null with nothing finished', () => {
    expect(noShowRate([row({ status: 'cancelled' })])).toBeNull()
  })
})

describe('returningClients', () => {
  it('counts distinct contacts in range with 2+ completed bookings ever', () => {
    const rows = [row({ contact_id: 'A' }), row({ contact_id: 'A' }), row({ contact_id: 'B' })]
    expect(returningClients(rows, new Map([['A', 3], ['B', 1]]))).toBe(1)
  })
})

describe('estimatedTakings', () => {
  const prices = new Map([['haircut', 500]])
  it('sums completed bookings by service name, case- and space-insensitive', () => {
    const rows = [
      row({ service: 'Haircut' }),
      row({ service: 'haircut ' }),
      row({ service: 'Haircut', status: 'cancelled' }),
      row({ service: 'Unknown' }),
    ]
    expect(estimatedTakings(rows, prices)).toBe(1000)
  })
  it('is null when no service has a price', () => {
    expect(estimatedTakings([row({ service: 'Haircut' })], new Map([['haircut', 0]]))).toBeNull()
  })
})

describe('utilisation', () => {
  const closed: DayHours = { open: false, start: '09:00', end: '18:00' }
  const open: DayHours = { open: true, start: '09:00', end: '18:00' }
  const hours = { 0: closed, 1: open, 2: closed, 3: closed, 4: closed, 5: closed, 6: closed } as Record<Weekday, DayHours>
  const monday = resolveRange('custom', new Date('2026-11-21T00:00:00Z'), 'UTC', { from: '2026-11-16', to: '2026-11-16' })
  it('is booked minutes over open minutes × staff', () => {
    const rows = [
      row({ starts_at: '2026-11-16T09:00:00Z', ends_at: '2026-11-16T11:00:00Z' }), // 120
      row({ starts_at: '2026-11-16T12:00:00Z', ends_at: '2026-11-16T14:30:00Z', status: 'confirmed' }), // 150
      row({ starts_at: '2026-11-16T15:00:00Z', ends_at: '2026-11-16T17:00:00Z', status: 'cancelled' }), // ignored
    ]
    expect(utilisation(rows, hours, monday, 2)).toBe(25)
  })
  it('is null on a closed day or with no staff', () => {
    const sunday = resolveRange('custom', new Date('2026-11-21T00:00:00Z'), 'UTC', { from: '2026-11-15', to: '2026-11-15' })
    expect(utilisation([], hours, sunday, 2)).toBeNull()
    expect(utilisation([], hours, monday, 0)).toBeNull()
  })
})

describe('countBy', () => {
  it('counts per key, descending, skipping nulls', () => {
    const rows = [row({ doctor_id: 'd1' }), row({ doctor_id: 'd2' }), row({ doctor_id: 'd2' }), row({ doctor_id: null })]
    expect(countBy(rows, (r) => r.doctor_id)).toEqual([
      { key: 'd2', count: 2 },
      { key: 'd1', count: 1 },
    ])
  })
})

describe('bucketSeries', () => {
  const now = new Date('2026-11-21T10:00:00Z')
  it('gives one bucket per day, zeros included', () => {
    const r = resolveRange('custom', now, 'UTC', { from: '2026-11-15', to: '2026-11-21' })
    const s = bucketSeries([{ at: '2026-11-16T10:00:00Z' }, { at: '2026-11-16T11:00:00Z' }], r)
    expect(s).toHaveLength(7)
    expect(s.map((b) => b.count)).toEqual([0, 2, 0, 0, 0, 0, 0])
    expect(s[0].key).toBe('2026-11-15')
  })
  it('uses Monday weeks for ranges over 31 days', () => {
    const r = resolveRange('custom', now, 'UTC', { from: '2026-09-23', to: '2026-11-21' })
    const s = bucketSeries([{ at: '2026-11-18T10:00:00Z' }], r)
    expect(s[0].key).toBe('2026-09-21')
    expect(s.every((b) => new Date(`${b.key}T00:00:00Z`).getUTCDay() === 1)).toBe(true)
    expect(s[s.length - 1]).toMatchObject({ key: '2026-11-16', count: 1 })
  })
  it('uses the business timezone for the day', () => {
    const r = resolveRange('custom', now, 'Asia/Kolkata', { from: '2026-11-16', to: '2026-11-17' })
    const s = bucketSeries([{ at: '2026-11-16T20:00:00Z' }], r) // 01:30 on the 17th in Kolkata
    expect(s.map((b) => b.count)).toEqual([0, 1])
  })
})

describe('trendPoints', () => {
  it('splits bookings per bucket into in-clinic, WhatsApp and cancelled/no-show', () => {
    const r = resolveRange('custom', new Date('2026-11-21T10:00:00Z'), 'UTC', { from: '2026-11-16', to: '2026-11-17' })
    const pts = trendPoints(
      [
        row({ starts_at: '2026-11-16T09:00:00Z', status: 'confirmed', source: 'whatsapp' }),
        row({ starts_at: '2026-11-16T10:00:00Z', status: 'completed', source: 'manual' }),
        row({ starts_at: '2026-11-17T10:00:00Z', status: 'no_show' }),
        row({ starts_at: '2026-11-17T11:00:00Z', status: 'cancelled', source: 'whatsapp' }),
      ],
      r,
    )
    expect(pts.map(({ day, inClinic, viaWhatsApp, cancelled }) => [day, inClinic, viaWhatsApp, cancelled])).toEqual([
      ['2026-11-16', 1, 1, 0],
      ['2026-11-17', 0, 0, 2],
    ])
  })
})

describe('messageSeries', () => {
  it('counts incoming and outgoing per bucket', () => {
    const r = resolveRange('custom', new Date('2026-11-21T10:00:00Z'), 'UTC', { from: '2026-11-16', to: '2026-11-17' })
    expect(
      messageSeries(
        [
          { at: '2026-11-16T09:00:00Z', incoming: true },
          { at: '2026-11-16T09:01:00Z', incoming: false },
          { at: '2026-11-17T09:00:00Z', incoming: true },
        ],
        r,
      ),
    ).toEqual([
      { day: '2026-11-16', incoming: 1, outgoing: 1 },
      { day: '2026-11-17', incoming: 1, outgoing: 0 },
    ])
  })
})
