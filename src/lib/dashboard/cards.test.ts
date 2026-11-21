import { describe, expect, it } from 'vitest'
import { deriveLayout, type GridItem } from './cards'

const tiles: GridItem[] = ['stat-bookings-today', 'stat-pending', 'stat-no-show-rate', 'metric-new-contacts'].map((i, n) => ({
  i,
  x: n * 3,
  y: 0,
  w: 3,
  h: 4,
}))

describe('deriveLayout', () => {
  it('splits four quarter tiles evenly on a 10-column grid (2 per row), not 3-3-2-2', () => {
    const out = deriveLayout(tiles, 10)
    expect(out.map((t) => [t.x, t.y, t.w])).toEqual([
      [0, 0, 5],
      [5, 0, 5],
      [0, 4, 5],
      [5, 4, 5],
    ])
  })
  it('keeps exact splits as they are (6 columns → 2 per row... of 3 wide)', () => {
    expect(deriveLayout(tiles, 6).map((t) => t.w)).toEqual([3, 3, 3, 3])
  })
  it('stacks full width on a phone', () => {
    expect(deriveLayout(tiles, 2).map((t) => t.w)).toEqual([2, 2, 2, 2])
  })
})
