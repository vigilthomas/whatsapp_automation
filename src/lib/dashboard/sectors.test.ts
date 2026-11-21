import { describe, expect, it } from 'vitest'
import { SECTORS } from '@/lib/vocabulary'
import { CARD_IDS, cardDef, isScopedCard } from './cards'
import { packLayout, SECTOR_CARDS, sectorLayout, visibleCards } from './sectors'

describe('SECTOR_CARDS', () => {
  it('only names cards that exist', () => {
    for (const s of SECTORS) for (const id of SECTOR_CARDS[s]) expect(CARD_IDS).toContain(id)
  })
  it('gives each business type its own set, in the agreed order', () => {
    expect(SECTOR_CARDS.clinic.slice(0, 3)).toEqual(['stat-bookings-today', 'stat-pending', 'stat-no-show-rate'])
    expect(SECTOR_CARDS.salon).toContain('stat-utilisation')
    expect(SECTOR_CARDS.agency[0]).toBe('stat-pipeline-value')
    expect(SECTOR_CARDS.general).toContain('activity')
  })
})

describe('sectorLayout / packLayout', () => {
  it('fits every card inside 12 columns without overlaps', () => {
    for (const s of SECTORS) {
      const lg = sectorLayout(s).layouts.lg!
      expect(lg.map((it) => it.i)).toEqual([...SECTOR_CARDS[s]])
      for (const a of lg) {
        expect(a.x + a.w).toBeLessThanOrEqual(12)
        for (const b of lg) {
          if (a === b) continue
          const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
          expect(overlap, `${a.i} overlaps ${b.i}`).toBe(false)
        }
      }
    }
  })
  it('packs only the cards given, so hidden cards leave no hole', () => {
    const l = packLayout(['stat-bookings-today', 'stat-no-show-rate'])
    expect(l.layouts.lg).toEqual([
      { i: 'stat-bookings-today', x: 0, y: 0, w: 3, h: 4 },
      { i: 'stat-no-show-rate', x: 3, y: 0, w: 3, h: 4 },
    ])
    expect(l.layouts.xxs?.length).toBe(2)
  })
})

describe('visibleCards', () => {
  const ids = ['stat-bookings-today', 'recent-chats', 'quick-actions']
  it('drops cards whose module the role cannot read', () => {
    expect(visibleCards(ids, (m) => m !== 'inbox', new Set())).toEqual(['stat-bookings-today', 'quick-actions'])
  })
  it('drops cards switched off for the role', () => {
    expect(visibleCards(ids, () => true, new Set(['stat-bookings-today']))).toEqual(['recent-chats', 'quick-actions'])
  })
  it('keeps cards with no module', () => {
    expect(visibleCards(['quick-actions'], () => false, new Set())).toEqual(['quick-actions'])
  })
})

describe('isScopedCard', () => {
  it('is true only for booking cards', () => {
    expect(isScopedCard(cardDef('stat-no-show-rate')!)).toBe(true)
    expect(isScopedCard(cardDef('recent-chats')!)).toBe(false)
    expect(isScopedCard(cardDef('metric-new-contacts')!)).toBe(false)
  })
})

describe('card links', () => {
  const q = { fromDay: '2026-11-16', toDay: '2026-11-21', branch: 'b1' }
  it('booking cards open Appointments with the same range and branch', () => {
    expect(cardDef('stat-bookings-today')!.href!(q)).toBe('/appointments?from=2026-11-16&to=2026-11-21&branch=b1')
    expect(cardDef('stat-no-show-rate')!.href!({ ...q, branch: null })).toBe(
      '/appointments?from=2026-11-16&to=2026-11-21&status=no_show',
    )
  })
  it('other cards open their page', () => {
    expect(cardDef('recent-chats')!.href!(q)).toBe('/inbox')
    expect(cardDef('pipeline')!.href!(q)).toBe('/pipelines')
  })
})
