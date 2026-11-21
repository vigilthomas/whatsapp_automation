import { describe, expect, it } from 'vitest'
import { parseDashboardCards } from './card-switches'

describe('parseDashboardCards', () => {
  it('treats missing or junk as all cards on', () => {
    expect(parseDashboardCards(null)).toEqual({ disabled: [] })
    expect(parseDashboardCards(undefined)).toEqual({ disabled: [] })
    expect(parseDashboardCards('junk')).toEqual({ disabled: [] })
    expect(parseDashboardCards({ disabled: 'pipeline' })).toEqual({ disabled: [] })
  })
  it('keeps known card ids once, in order', () => {
    expect(parseDashboardCards({ disabled: ['pipeline', 'pipeline', 'nope', 3, 'activity'] })).toEqual({
      disabled: ['pipeline', 'activity'],
    })
  })
})
