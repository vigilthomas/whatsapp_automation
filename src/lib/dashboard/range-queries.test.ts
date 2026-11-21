import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_CONFIG } from '@/lib/booking/settings'
import { resolveRange } from './range'
import {
  loadAppointmentsIn,
  loadBookingHours,
  loadCompletedCountByContact,
  loadDealsSummary,
  loadAppointmentList,
  loadUpcoming,
  loadMessagesIn,
  loadPointInTimeCounts,
  loadServicePrices,
} from './range-queries'

type Call = [string, ...unknown[]]

/** Records every builder call; awaiting the chain resolves the next queued result. */
function fakeDb(results: unknown[] | ((log: Call[]) => unknown)) {
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
      const next = () =>
        Promise.resolve(
          (typeof results === 'function' ? results(log) : results.shift()) ?? { data: [], error: null },
        )
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

/** Which deals query a call log is: the open-pipeline row read, or a won/lost count. */
const dealsKind = (log: Call[]) => (log.find(([m, c]) => m === 'eq' && c === 'status')?.[2] as string) ?? ''

describe('loadDealsSummary', () => {
  it('sums every open deal, paging past the 1000-row API limit', async () => {
    const big = Array.from({ length: 1000 }, () => ({ value: 1 }))
    const { db } = fakeDb((log) => {
      const kind = dealsKind(log)
      if (kind === 'open') {
        const from = (log.find(([m]) => m === 'range')?.[1] as number) ?? 0
        return { data: from === 0 ? big : [{ value: 5 }], error: null }
      }
      return { count: kind === 'won' ? 3 : 2, error: null }
    })
    const s = await loadDealsSummary(db, range)
    expect(s).toEqual({ openCount: 1001, openValue: 1005, won: 3, lost: 2 })
  })
  it('throws when the won/lost count fails instead of showing 0', async () => {
    const { db } = fakeDb((log) =>
      dealsKind(log) === 'won' ? { count: null, error: new Error('won failed') } : { data: [], count: 0, error: null },
    )
    await expect(loadDealsSummary(db, range)).rejects.toThrow('won failed')
  })
})

describe('loadPointInTimeCounts', () => {
  it('throws when a count fails instead of showing 0', async () => {
    const { db } = fakeDb((log) =>
      log[0][1] === 'contacts' ? { count: null, error: new Error('contacts failed') } : { count: 4, error: null },
    )
    await expect(loadPointInTimeCounts(db)).rejects.toThrow('contacts failed')
  })
})

describe('loadMessagesIn', () => {
  it('reads newest first, so the row cap drops the oldest days, not the latest', async () => {
    const { db, calls } = fakeDb([{ data: [], error: null }])
    await loadMessagesIn(db, range)
    expect(calls[0]).toContainEqual(['order', 'created_at', { ascending: false }])
  })
})

describe('loadAppointmentList', () => {
  it('reads the range newest first with patient and doctor names, narrowed to the branch', async () => {
    const row = { id: 'a1', starts_at: 'x', service: 'Cut', status: 'completed', contact_id: 'c1', contact: { name: 'Asha' }, doctor: { name: 'Neha' } }
    const { db, calls } = fakeDb([{ data: [row], error: null }])
    expect(await loadAppointmentList(db, range, 'b1')).toEqual([row])
    expect(calls[0]).toContainEqual(['gte', 'starts_at', range.from.toISOString()])
    expect(calls[0]).toContainEqual(['lt', 'starts_at', range.to.toISOString()])
    expect(calls[0]).toContainEqual(['eq', 'branch_id', 'b1'])
    expect(calls[0]).toContainEqual(['order', 'starts_at', { ascending: false }])
  })
})

describe('loadUpcoming', () => {
  it('reads 7 business days from the given day, booked ones only, soonest first', async () => {
    const { db, calls } = fakeDb([{ data: [], error: null }])
    await loadUpcoming(db, '2026-11-23', 'Asia/Kolkata', null)
    // 2026-11-23 00:00 in Kolkata is 2026-11-22T18:30Z; 7 days later 2026-11-29T18:30Z
    expect(calls[0]).toContainEqual(['gte', 'starts_at', '2026-11-22T18:30:00.000Z'])
    expect(calls[0]).toContainEqual(['lt', 'starts_at', '2026-11-29T18:30:00.000Z'])
    expect(calls[0]).toContainEqual(['in', 'status', ['scheduled', 'confirmed']])
    expect(calls[0]).toContainEqual(['order', 'starts_at', { ascending: true }])
  })
})
