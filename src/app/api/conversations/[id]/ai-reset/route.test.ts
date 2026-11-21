import { beforeEach, describe, expect, it, vi } from 'vitest'

// "Start new" for one chat: the AI forgets the conversation so far
// (messages stay for staff; appointments are untouched).

type Call = [string, ...unknown[]]
type Result = { data: unknown; error: { message: string; code?: string } | null }

const mocks = vi.hoisted(() => ({
  results: [] as Result[],
  calls: [] as Call[][],
  guard: vi.fn(),
}))

function builder(calls: Call[]) {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'update', 'delete', 'insert']) {
    b[m] = vi.fn((...args: unknown[]) => {
      calls.push([m, ...args])
      return b
    })
  }
  const settle = () => Promise.resolve(mocks.results.shift() ?? { data: null, error: null })
  b.maybeSingle = vi.fn(settle)
  b.then = (resolve: (v: unknown) => unknown) => settle().then(resolve)
  return b
}

vi.mock('@/lib/auth/permission-guard', () => ({ requirePermission: mocks.guard }))
vi.mock('@/lib/auth/account', () => ({
  toErrorResponse: vi.fn(() => Response.json({ error: 'denied' }, { status: 403 })),
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

const ID = '0b6f5c2e-1c1a-4c1e-9a43-6a7d3b2c1d09'
const params = { params: Promise.resolve({ id: ID }) }
const post = () => POST(new Request(`http://x/api/conversations/${ID}/ai-reset`, { method: 'POST' }), params)

beforeEach(() => {
  mocks.results = []
  mocks.calls = []
  mocks.guard.mockReset()
  mocks.guard.mockResolvedValue({ accountId: 'acc-1', userId: 'u-1' })
})

describe('POST /api/conversations/:id/ai-reset', () => {
  it('marks the moment the AI starts afresh, restarts its reply count, in this account only — and deletes nothing', async () => {
    mocks.results.push({ data: { id: ID, ai_context_since: '2026-11-21T10:00:00Z' }, error: null })
    const res = await post()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ ai_context_since: '2026-11-21T10:00:00Z' })
    expect(mocks.guard).toHaveBeenCalledWith('ai-assistant', 'edit')
    const calls = mocks.calls.flat()
    expect(calls).toContainEqual(['from', 'conversations'])
    const update = calls.find((c) => c[0] === 'update')?.[1] as Record<string, unknown>
    expect(update).toMatchObject({ ai_reply_count: 0, ai_handoff_summary: null })
    expect(typeof update.ai_context_since).toBe('string')
    expect(calls).toContainEqual(['eq', 'account_id', 'acc-1'])
    expect(calls).toContainEqual(['eq', 'id', ID])
    // Messages and appointments are never touched.
    expect(calls.some((c) => c[0] === 'delete')).toBe(false)
    expect(calls).not.toContainEqual(['from', 'messages'])
    expect(calls).not.toContainEqual(['from', 'appointments'])
  })

  it('404s for a chat in another account', async () => {
    mocks.results.push({ data: null, error: null })
    expect((await post()).status).toBe(404)
  })

  it('explains the missing migration instead of a bare error', async () => {
    mocks.results.push({ data: null, error: { message: 'column "ai_context_since" does not exist', code: '42703' } })
    const res = await post()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain('071')
  })

  it('refuses a role without edit on the AI assistant', async () => {
    mocks.guard.mockRejectedValue(new Error('forbidden'))
    expect((await post()).status).toBe(403)
  })
})
