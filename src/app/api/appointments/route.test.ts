import { beforeEach, describe, expect, it, vi } from 'vitest'

// Double-booking guard (security audit F-11, Data access gap): the
// server refuses a booking that overlaps the same doctor's existing one,
// whatever branch it's in, and the busy endpoint covers every branch.

type Call = [string, ...unknown[]]
type Result = { data: unknown; error: { message: string } | null }

const mocks = vi.hoisted(() => ({
  results: [] as Result[],
  calls: [] as Call[][],
  guard: vi.fn(),
}))

function builder(calls: Call[]) {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'neq', 'not', 'lt', 'gt', 'gte', 'in', 'order', 'limit', 'insert', 'update']) {
    b[m] = vi.fn((...args: unknown[]) => {
      calls.push([m, ...args])
      return b
    })
  }
  const settle = () => Promise.resolve(mocks.results.shift() ?? { data: null, error: null })
  b.maybeSingle = vi.fn(settle)
  b.single = vi.fn(settle)
  b.then = (resolve: (v: unknown) => unknown) => settle().then(resolve)
  return b
}

vi.mock('@/lib/auth/permission-guard', () => ({ requirePermission: mocks.guard }))
vi.mock('@/lib/auth/account', () => ({
  toErrorResponse: vi.fn(() => Response.json({ error: 'denied' }, { status: 403 })),
}))
vi.mock('@/lib/auth/data-scope', () => ({
  OUT_OF_SCOPE_MESSAGE: 'out of scope',
  scopeFilter: vi.fn(async () => null),
  rowInScope: vi.fn(() => true),
}))
vi.mock('@/lib/automations/admin-client', () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      const calls: Call[] = [['from', table]]
      mocks.calls.push(calls)
      return builder(calls)
    },
  }),
}))

import { POST } from './route'
import { GET as BUSY } from './busy/route'

const DOCTOR = '0b6f5c2e-1c1a-4c1e-9a43-6a7d3b2c1d01'
const CONTACT = '0b6f5c2e-1c1a-4c1e-9a43-6a7d3b2c1d02'

const booking = {
  contact_id: CONTACT,
  doctor_id: DOCTOR,
  service: 'Consultation',
  starts_at: '2026-11-21T04:30:00.000Z',
  ends_at: '2026-11-21T05:00:00.000Z',
}

function post(body: unknown) {
  return POST(new Request('http://x/api/appointments', { method: 'POST', body: JSON.stringify(body) }))
}

const inserted = () => mocks.calls.flat().some((c) => Array.isArray(c) && c[0] === 'insert')

beforeEach(() => {
  mocks.results = []
  mocks.calls = []
  mocks.guard.mockReset()
  mocks.guard.mockResolvedValue({ accountId: 'acc-1', userId: 'u-1', branchId: null })
})

describe('POST /api/appointments overlap guard', () => {
  it('refuses a booking that overlaps the doctor (409) and writes nothing', async () => {
    mocks.results = [
      { data: { id: CONTACT }, error: null }, // contact in account
      { data: { id: DOCTOR }, error: null }, // doctor in account
      { data: { id: 'a-1', starts_at: booking.starts_at, ends_at: booking.ends_at }, error: null },
    ]
    const res = await post(booking)
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('overlap')
    expect(inserted()).toBe(false)

    // The overlap query is account- and doctor-scoped, skips cancelled,
    // and tests real overlap rather than equal start times.
    const q = mocks.calls[2]
    expect(q).toContainEqual(['eq', 'account_id', 'acc-1'])
    expect(q).toContainEqual(['eq', 'doctor_id', DOCTOR])
    expect(q).toContainEqual(['not', 'status', 'in', '(cancelled)'])
    expect(q).toContainEqual(['lt', 'starts_at', booking.ends_at])
    expect(q).toContainEqual(['gt', 'ends_at', booking.starts_at])
  })

  it('books a free slot', async () => {
    mocks.results = [
      { data: { id: CONTACT }, error: null },
      { data: { id: DOCTOR }, error: null },
      { data: null, error: null }, // no clash
      { data: { id: 'new' }, error: null }, // insert
    ]
    const res = await post(booking)
    expect(res.status).toBe(201)
    expect(inserted()).toBe(true)
  })

  it('skips the check for a cancelled booking', async () => {
    mocks.results = [
      { data: { id: CONTACT }, error: null },
      { data: { id: DOCTOR }, error: null },
      { data: { id: 'new' }, error: null },
    ]
    const res = await post({ ...booking, status: 'cancelled' })
    expect(res.status).toBe(201)
  })
})

describe('GET /api/appointments/busy', () => {
  const busy = (qs: string) => BUSY(new Request(`http://x/api/appointments/busy?${qs}`))

  it('returns times only, account-scoped, every branch', async () => {
    mocks.results = [{ data: [{ id: 'a-1', starts_at: 's', ends_at: 'e', service: 'X' }], error: null }]
    const res = await busy(`doctor_id=${DOCTOR}&from=2026-11-21T00:00:00Z&to=2026-11-22T00:00:00Z`)
    expect(res.status).toBe(200)
    expect((await res.json()).busy).toHaveLength(1)
    const q = mocks.calls[0]
    expect(q).toContainEqual(['select', 'id, starts_at, ends_at, service'])
    expect(q).toContainEqual(['eq', 'account_id', 'acc-1'])
    expect(q.some((c) => c[1] === 'branch_id')).toBe(false)
  })

  it('validates its inputs', async () => {
    expect((await busy('from=2026-11-21T00:00:00Z&to=2026-11-22T00:00:00Z')).status).toBe(400)
    expect((await busy(`doctor_id=${DOCTOR}&from=x&to=y`)).status).toBe(400)
    expect((await busy(`doctor_id=${DOCTOR}&from=2026-01-01T00:00:00Z&to=2026-03-01T00:00:00Z`)).status).toBe(400)
  })

  it('needs Appointments read', async () => {
    mocks.guard.mockRejectedValueOnce(new Error('forbidden'))
    const res = await busy(`doctor_id=${DOCTOR}&from=2026-11-21T00:00:00Z&to=2026-11-22T00:00:00Z`)
    expect(res.status).toBe(403)
  })
})
