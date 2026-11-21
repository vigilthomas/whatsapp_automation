import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_CONFIG } from '@/lib/booking/settings'
import { resolveRange } from './range'
import {
  loadAppointmentsIn,
  loadBookingHours,
  loadCompletedCountByContact,
  loadServicePrices,
} from './range-queries'

type Call = [string, ...unknown[]]

/** Records every builder call; awaiting the chain resolves the next queued result. */
function fakeDb(results: unknown[]) {
  const calls: Call[][] = []
  const db = {
    from(table: string) {
      const log: Call[] = [['from', table]]
      calls.push(log)
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'gte', 'lt', 'in', 'is', 'order', 'range', 'limit']) {
        chain[m] = (...args: unknown[]) => {
          log.push([m, ...args])
          return chain
        }
      }
      const next = () => Promise.resolve(results.shift() ?? { data: [], error: null })
      chain.maybeSingle = next
      chain.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => next().then(ok, bad)
      return chain
    },
  }
  return { db: db as unknown as SupabaseClient, calls }
}

const range = resolveRange('today', new Date('2026-11-21T10:00:00Z'), 'Asia/Kolkata')

describe('loadAppointmentsIn', () => {
  it('filters to the range instants and, when given, the branch', async () => {
    const { db, calls } = fakeDb([{ data: [{ starts_at: 'x' }], error: null }])
    const rows = await loadAppointmentsIn(db, range, 'b1')
    expect(rows).toEqual([{ starts_at: 'x' }])
    expect(calls[0]).toContainEqual(['gte', 'starts_at', range.from.toISOString()])
    expect(calls[0]).toContainEqual(['lt', 'starts_at', range.to.toISOString()])
    expect(calls[0]).toContainEqual(['eq', 'branch_id', 'b1'])
  })
  it('adds no branch filter for "all my branches"', async () => {
    const { db, calls } = fakeDb([{ data: [], error: null }])
    await loadAppointmentsIn(db, range, null)
    expect(calls[0].some(([m, col]) => m === 'eq' && col === 'branch_id')).toBe(false)
  })
  it('pages past the 1000-row API limit', async () => {
    const page = Array.from({ length: 1000 }, (_, i) => ({ starts_at: String(i) }))
    const { db, calls } = fakeDb([{ data: page, error: null }, { data: [{ starts_at: 'last' }], error: null }])
    const rows = await loadAppointmentsIn(db, range, null)
    expect(rows).toHaveLength(1001)
    expect(calls[1]).toContainEqual(['range', 1000, 1999])
  })
  it('throws the query error', async () => {
    const { db } = fakeDb([{ data: null, error: new Error('boom') }])
    await expect(loadAppointmentsIn(db, range, null)).rejects.toThrow('boom')
  })
})

describe('loadServicePrices', () => {
  it('keys prices by trimmed, lower-cased service name', async () => {
    const { db } = fakeDb([{ data: [{ name: ' Haircut ', price: '500.00' }, { name: 'Colour', price: 0 }], error: null }])
    const m = await loadServicePrices(db)
    expect(m.get('haircut')).toBe(500)
    expect(m.get('colour')).toBe(0)
  })
})

describe('loadCompletedCountByContact', () => {
  it('counts completed bookings per contact', async () => {
    const { db, calls } = fakeDb([{ data: [{ contact_id: 'A' }, { contact_id: 'A' }, { contact_id: 'B' }], error: null }])
    const m = await loadCompletedCountByContact(db, ['A', 'B'])
    expect([m.get('A'), m.get('B')]).toEqual([2, 1])
    expect(calls[0]).toContainEqual(['eq', 'status', 'completed'])
    expect(calls[0]).toContainEqual(['in', 'contact_id', ['A', 'B']])
  })
  it('asks nothing for no contacts', async () => {
    const { db, calls } = fakeDb([])
    expect((await loadCompletedCountByContact(db, [])).size).toBe(0)
    expect(calls).toHaveLength(0)
  })
})

describe('loadBookingHours', () => {
  it('falls back to the default hours and timezone on error', async () => {
    const { db } = fakeDb([{ data: null, error: new Error('rls') }])
    expect(await loadBookingHours(db)).toEqual({ tz: DEFAULT_CONFIG.timezone, hours: DEFAULT_CONFIG.hours })
  })
  it("reads the business's timezone", async () => {
    const { db } = fakeDb([{ data: { config: { timezone: 'Europe/London' } }, error: null }])
    expect((await loadBookingHours(db)).tz).toBe('Europe/London')
  })
})
