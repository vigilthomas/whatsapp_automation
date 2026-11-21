import { describe, expect, it } from 'vitest'
import { cardFailed } from './load-state'

describe('cardFailed', () => {
  it('is true when any group the card needs failed to load', () => {
    expect(cardFailed(['appts', 'prices'], new Set(['prices']))).toBe(true)
  })
  it('is false when its groups loaded, even if others failed', () => {
    expect(cardFailed(['appts'], new Set(['deals']))).toBe(false)
  })
  it('is false for a card that needs no data', () => {
    expect(cardFailed([], new Set(['deals']))).toBe(false)
  })
})
