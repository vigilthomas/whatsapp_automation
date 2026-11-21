import { describe, expect, it } from 'vitest'
import { loadAutofillContext } from './template-autofill-server'

type Call = [string, ...unknown[]]

/** Answers each table from `rows`; logs every builder call. */
function fakeDb(rows: Record<string, unknown>) {
  const calls: Call[][] = []
  const db = {
    from(table: string) {
      const log: Call[] = [['from', table]]
      calls.push(log)
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'gte', 'order', 'limit']) {
        chain[m] = (...a: unknown[]) => {
          log.push([m, ...a])
          return chain
        }
      }
      chain.maybeSingle = () => Promise.resolve({ data: rows[table] ?? null, error: null })
      return chain
    },
  }
  return { db: db as never, calls }
}

describe('loadAutofillContext', () => {
  it("gathers the contact, their next booking, the business name and timezone, pinned to the account", async () => {
    const { db, calls } = fakeDb({
      contacts: { name: 'Asha', phone: '+91 1', email: null },
      appointments: { starts_at: '2026-11-22T04:30:00Z', service: 'Cut', doctor: { name: 'Neha' }, branch: { name: 'Edapally' } },
      app_branding: { title: 'Dr.32' },
      booking_settings: { config: { timezone: 'Asia/Kolkata' } },
    })
    const ctx = await loadAutofillContext(db, 'acc', 'c1')
    expect(ctx).toEqual({
      contact: { name: 'Asha', phone: '+91 1', email: null },
      appointment: { starts_at: '2026-11-22T04:30:00Z', service: 'Cut', doctor: 'Neha', branch: 'Edapally' },
      business: 'Dr.32',
      tz: 'Asia/Kolkata',
    })
    for (const table of ['contacts', 'appointments', 'booking_settings']) {
      expect(calls.find((c) => c[0][1] === table)).toContainEqual(['eq', 'account_id', 'acc'])
    }
    const appt = calls.find((c) => c[0][1] === 'appointments')!
    expect(appt).toContainEqual(['eq', 'contact_id', 'c1'])
    expect(appt).toContainEqual(['in', 'status', ['scheduled', 'confirmed']])
  })
  it('copes with no booking and no settings', async () => {
    const { db } = fakeDb({ contacts: { name: 'Asha', phone: '1', email: null } })
    const ctx = await loadAutofillContext(db, 'acc', 'c1')
    expect(ctx.appointment).toBeNull()
    expect(ctx.business).toBeNull()
    expect(typeof ctx.tz).toBe('string')
  })
})

describe('resolveEngineTemplateParams', () => {
  const row = (body_text: string) =>
    ({ id: 't', user_id: 'u', name: 'appt', category: 'UTILITY', language: 'en', body_text, created_at: '' }) as never
  const ctx = {
    contact: { name: 'Asha', phone: '1', email: null },
    appointment: { starts_at: '2026-11-22T04:30:00Z', service: 'Cut', doctor: null, branch: null },
    business: 'Dr.32',
    tz: 'Asia/Kolkata',
  }

  it('fills named placeholders from the step first, then the contact and booking', async () => {
    const { resolveEngineTemplateParams } = await import('./template-autofill-server')
    const params = await resolveEngineTemplateParams(row('Hi {{name}}, {{service}}, token {{token_num}}'), { token_num: 'A7' }, [], async () => ctx)
    expect(params).toEqual(['Asha', 'Cut', 'A7'])
  })
  it('says which named placeholder has no value instead of sending an empty one', async () => {
    const { resolveEngineTemplateParams } = await import('./template-autofill-server')
    await expect(resolveEngineTemplateParams(row('Token {{token_num}}'), undefined, [], async () => ctx)).rejects.toThrow(
      /token_num/,
    )
  })
  it('keeps numbered templates on the configured values, in number order', async () => {
    const { resolveEngineTemplateParams } = await import('./template-autofill-server')
    let loaded = false
    const params = await resolveEngineTemplateParams(row('{{1}} and {{2}}'), { '2': 'b', '1': 'a' }, ['a', 'b'], async () => {
      loaded = true
      return ctx
    })
    expect(params).toEqual(['a', 'b'])
    expect(loaded).toBe(false)
  })
  it('passes the legacy params through when there is no template row', async () => {
    const { resolveEngineTemplateParams } = await import('./template-autofill-server')
    expect(await resolveEngineTemplateParams(null, undefined, ['x'], async () => ctx)).toEqual(['x'])
  })
})
