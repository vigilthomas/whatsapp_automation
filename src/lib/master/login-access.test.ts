import { describe, expect, it } from 'vitest'
import { BAN_FOREVER, doctorForLogin, linkDoctorLogin, setLoginEnabled } from './login-access'

type Call = [string, ...unknown[]]

/**
 * A fake service-role client: `rows[table]` answers selects, every
 * builder call is logged, and auth.admin.updateUserById is recorded.
 */
function fakeAdmin(opts: {
  rows?: Record<string, unknown>
  updateError?: Record<string, unknown>
  banError?: unknown
}) {
  const calls: Call[][] = []
  const bans: { id: string; ban: string }[] = []
  const admin = {
    from(table: string) {
      const log: Call[] = [['from', table]]
      calls.push(log)
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'is', 'update']) {
        chain[m] = (...args: unknown[]) => {
          log.push([m, ...args])
          return chain
        }
      }
      const result = () => {
        const isUpdate = log.some(([m]) => m === 'update')
        if (isUpdate) {
          const error = opts.updateError?.[table] ?? null
          const data = error ? null : (opts.rows?.[`${table}:update`] ?? [])
          return { data, error }
        }
        return { data: opts.rows?.[table] ?? null, error: null }
      }
      chain.maybeSingle = () => Promise.resolve(result())
      chain.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(result()).then(ok, bad)
      return chain
    },
    auth: {
      admin: {
        updateUserById: (id: string, attrs: { ban_duration: string }) => {
          bans.push({ id, ban: attrs.ban_duration })
          return Promise.resolve({ data: {}, error: opts.banError ?? null })
        },
      },
    },
  }
  return { admin: admin as never, calls, bans }
}

const who = { accountId: 'acc', callerId: 'me' }

describe('setLoginEnabled', () => {
  it('bans the login and marks the profile when switched off', async () => {
    const { admin, calls, bans } = fakeAdmin({ rows: { profiles: { account_role: 'agent' } } })
    expect(await setLoginEnabled(admin, who, 'u1', false)).toEqual({ ok: true })
    expect(bans).toEqual([{ id: 'u1', ban: BAN_FOREVER }])
    const upd = calls.find((c) => c.some(([m]) => m === 'update'))!
    expect(upd).toContainEqual(['update', { login_disabled: true }])
    expect(upd).toContainEqual(['eq', 'account_id', 'acc'])
  })
  it('lifts the ban when switched on', async () => {
    const { admin, bans } = fakeAdmin({ rows: { profiles: { account_role: 'agent' } } })
    expect(await setLoginEnabled(admin, who, 'u1', true)).toEqual({ ok: true })
    expect(bans).toEqual([{ id: 'u1', ban: 'none' }])
  })
  it("refuses to switch off the caller's own login", async () => {
    const { admin, bans } = fakeAdmin({ rows: { profiles: { account_role: 'admin' } } })
    expect(await setLoginEnabled(admin, who, 'me', false)).toMatchObject({ ok: false, status: 400 })
    expect(bans).toHaveLength(0)
  })
  it("refuses to switch off the owner's login", async () => {
    const { admin, bans } = fakeAdmin({ rows: { profiles: { account_role: 'owner' } } })
    expect(await setLoginEnabled(admin, who, 'u1', false)).toMatchObject({ ok: false, status: 400 })
    expect(bans).toHaveLength(0)
  })
  it('404s for someone outside the account', async () => {
    const { admin, bans } = fakeAdmin({ rows: {} })
    expect(await setLoginEnabled(admin, who, 'u1', false)).toMatchObject({ ok: false, status: 404 })
    expect(bans).toHaveLength(0)
  })
  it('undoes the ban when the profile flag cannot be saved', async () => {
    const { admin, bans } = fakeAdmin({
      rows: { profiles: { account_role: 'agent' } },
      updateError: { profiles: new Error('column missing') },
    })
    expect(await setLoginEnabled(admin, who, 'u1', false)).toMatchObject({ ok: false, status: 500 })
    expect(bans).toEqual([
      { id: 'u1', ban: BAN_FOREVER },
      { id: 'u1', ban: 'none' },
    ])
  })
  it('does not touch the profile when the ban fails', async () => {
    const { admin, calls } = fakeAdmin({ rows: { profiles: { account_role: 'agent' } }, banError: new Error('auth down') })
    expect(await setLoginEnabled(admin, who, 'u1', false)).toMatchObject({ ok: false, status: 500 })
    expect(calls.some((c) => c.some(([m]) => m === 'update'))).toBe(false)
  })
})

describe('doctorForLogin', () => {
  it("returns this account's doctor when it has no login yet", async () => {
    const doc = { id: 'd1', name: 'Neha', branch_id: 'b1', email: 'n@x.com', user_id: null }
    const { admin, calls } = fakeAdmin({ rows: { doctors: doc } })
    expect(await doctorForLogin(admin, 'acc', 'd1')).toEqual({ ok: true, doctor: doc })
    expect(calls[0]).toContainEqual(['eq', 'account_id', 'acc'])
    expect(calls[0]).toContainEqual(['is', 'deleted_at', null])
  })
  it('409s when the doctor already has a login', async () => {
    const { admin } = fakeAdmin({ rows: { doctors: { id: 'd1', name: 'N', branch_id: null, email: null, user_id: 'u9' } } })
    expect(await doctorForLogin(admin, 'acc', 'd1')).toMatchObject({ ok: false, status: 409 })
  })
  it('400s for an unknown doctor', async () => {
    const { admin } = fakeAdmin({ rows: {} })
    expect(await doctorForLogin(admin, 'acc', 'd1')).toMatchObject({ ok: false, status: 400 })
  })
})

describe('linkDoctorLogin', () => {
  it('links only a doctor that is still without a login', async () => {
    const { admin, calls } = fakeAdmin({ rows: { 'doctors:update': [{ id: 'd1' }] } })
    expect(await linkDoctorLogin(admin, 'acc', 'd1', 'u1')).toBe(true)
    expect(calls[0]).toContainEqual(['update', { user_id: 'u1' }])
    expect(calls[0]).toContainEqual(['is', 'user_id', null])
    expect(calls[0]).toContainEqual(['eq', 'account_id', 'acc'])
  })
  it('reports false when someone else linked it first', async () => {
    const { admin } = fakeAdmin({ rows: { 'doctors:update': [] } })
    expect(await linkDoctorLogin(admin, 'acc', 'd1', 'u1')).toBe(false)
  })
})
