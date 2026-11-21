import { describe, expect, it } from 'vitest'
import { SECTORS } from '@/lib/vocabulary'
import { CARD_IDS, cardDef, isScopedCard } from './cards'
import { packLayout, SECTOR_CARDS, sectorLayout, visibleCards } from './sectors'

describe('SECTOR_CARDS', () => {
  it('only names cards that exist', () => {
    for (const s of SECTORS) for (const id of SECTOR_CARDS[s]) expect(CARD_IDS).toContain(id)
  })
  it('gives every business type the same layout: four tiles, chart, patients table, upcoming rail', () => {
    for (const s of SECTORS) {
      expect(SECTOR_CARDS[s]).toEqual([
        'stat-takings',
        'stat-customers',
        'metric-new-contacts',
        'stat-completed',
        'bookings-line',
        'patients-table',
        'upcoming-appointments',
      ])
    }
  })
})

describe('sectorLayout / packLayout', () => {
  it('fits every card inside 12 columns without overlaps', () => {
    for (const s of SECTORS) {
      const lg = sectorLayout(s).layouts.lg!
      expect([...lg.map((it) => it.i)].sort()).toEqual([...SECTOR_CARDS[s]].sort())
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
  it('shows nothing until permissions have loaded (can() answers yes while loading)', () => {
    expect(visibleCards(ids, () => true, new Set(), false)).toEqual([])
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

describe('packLayout — right rail', () => {
  const ids = ['stat-takings', 'stat-customers', 'metric-new-contacts', 'stat-completed', 'bookings-line', 'patients-table', 'upcoming-appointments']

  it('keeps the upcoming column on the right, as tall as everything beside it', () => {
    const lg = packLayout(ids).layouts.lg!
    const at = (id: string) => lg.find((it) => it.i === id)!
    expect(['stat-takings', 'stat-customers', 'metric-new-contacts', 'stat-completed'].map((id) => [at(id).x, at(id).w])).toEqual([
      [0, 2],
      [2, 2],
      [4, 2],
      [6, 2],
    ])
    expect(at('bookings-line')).toMatchObject({ x: 0, w: 8 })
    expect(at('patients-table')).toMatchObject({ x: 0, w: 8 })
    const mainBottom = Math.max(...lg.filter((it) => it.i !== 'upcoming-appointments').map((it) => it.y + it.h))
    expect(at('upcoming-appointments')).toMatchObject({ x: 8, y: 0, w: 4, h: mainBottom })
  })
  it('uses the full width when the rail is switched off', () => {
    const lg = packLayout(ids.filter((id) => id !== 'upcoming-appointments')).layouts.lg!
    expect(lg.find((it) => it.i === 'bookings-line')).toMatchObject({ x: 0, w: 12 })
    expect(lg.find((it) => it.i === 'stat-completed')).toMatchObject({ x: 9, w: 3 })
  })
  it('puts the rail after the rest on smaller screens', () => {
    const sm = packLayout(ids).layouts.sm!
    const rail = sm.find((it) => it.i === 'upcoming-appointments')!
    expect(rail.x).toBe(0)
    expect(rail.y).toBe(Math.max(...sm.filter((it) => it !== rail).map((it) => it.y + it.h)))
  })
})
