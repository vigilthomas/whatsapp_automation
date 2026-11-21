import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))

import { resolveVariables } from './use-broadcast-sending'
import type { Contact } from '@/types'

const contact = { id: 'c1', name: 'Asha', phone: '+91 1', email: 'a@x.com' } as Contact

describe('resolveVariables', () => {
  it("follows the template's placeholder order when given (named templates)", () => {
    const vars = {
      time: { type: 'static' as const, value: '10:00' },
      name: { type: 'field' as const, value: 'name' },
    }
    expect(resolveVariables(vars, contact, undefined, ['time', 'name'])).toEqual(['10:00', 'Asha'])
  })
  it('keeps numeric order for numbered placeholders without an order', () => {
    const vars = {
      '10': { type: 'static' as const, value: 'ten' },
      '2': { type: 'static' as const, value: 'two' },
      '1': { type: 'static' as const, value: 'one' },
    }
    expect(resolveVariables(vars, contact)).toEqual(['one', 'two', 'ten'])
  })
})
