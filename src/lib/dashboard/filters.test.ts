import { describe, expect, it } from 'vitest'
import { branchChoices, clampBranch, filtersToQuery, parseFilters } from './filters'

const B = (id: string) => ({ id, name: id.toUpperCase() })
const ALL = [B('b1'), B('b2'), B('b3')]

describe('parseFilters', () => {
  it('defaults to today with no branch', () => {
    expect(parseFilters(new URLSearchParams(''))).toEqual({ preset: 'today', branch: null })
  })
  it('falls back to today for an unknown preset', () => {
    expect(parseFilters(new URLSearchParams('range=bogus')).preset).toBe('today')
  })
  it('keeps valid custom dates and drops invalid ones', () => {
    const f = parseFilters(new URLSearchParams('range=custom&from=2026-11-01&to=nope'))
    expect(f).toEqual({ preset: 'custom', from: '2026-11-01', branch: null })
  })
  it('ignores from/to outside custom', () => {
    expect(parseFilters(new URLSearchParams('range=week&from=2026-11-01'))).toEqual({ preset: 'week', branch: null })
  })
})

describe('filtersToQuery', () => {
  it('is empty for the defaults', () => {
    expect(filtersToQuery({ preset: 'today', branch: null })).toBe('')
  })
  it('round-trips through parseFilters', () => {
    const f = { preset: 'custom' as const, from: '2026-11-01', to: '2026-11-09', branch: 'b2' }
    expect(parseFilters(new URLSearchParams(filtersToQuery(f)))).toEqual(f)
    const w = { preset: 'week' as const, branch: null }
    expect(parseFilters(new URLSearchParams(filtersToQuery(w)))).toEqual(w)
  })
})

describe('branchChoices', () => {
  it('all → every branch plus "All my branches"', () => {
    expect(branchChoices({ type: 'all' }, null, ALL)).toEqual({ options: ALL, showAll: true, hidden: false })
  })
  it('assigned branch → just mine, hidden (one choice)', () => {
    expect(branchChoices({ type: 'branch' }, 'b2', ALL)).toEqual({ options: [B('b2')], showAll: false, hidden: true })
  })
  it('assigned branch with none set → nothing, never "all"', () => {
    expect(branchChoices({ type: 'branch' }, null, ALL)).toEqual({ options: [], showAll: false, hidden: true })
  })
  it('custom → the picked branches', () => {
    expect(branchChoices({ type: 'custom', branches: ['b1', 'b3'] }, null, ALL)).toEqual({
      options: [B('b1'), B('b3')],
      showAll: true,
      hidden: false,
    })
  })
  it('own → hidden', () => {
    expect(branchChoices({ type: 'own' }, 'b1', ALL).hidden).toBe(true)
  })
  it('a single branch business → hidden', () => {
    expect(branchChoices({ type: 'all' }, null, [B('b1')]).hidden).toBe(true)
  })
})

describe('clampBranch', () => {
  it('drops a branch the role cannot pick', () => {
    expect(clampBranch({ preset: 'today', branch: 'b9' }, ALL)).toBeNull()
    expect(clampBranch({ preset: 'today', branch: 'b2' }, ALL)).toBe('b2')
    expect(clampBranch({ preset: 'today', branch: null }, ALL)).toBeNull()
  })
})
