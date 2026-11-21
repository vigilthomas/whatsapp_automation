import { describe, expect, it } from 'vitest'
import { bucketFor, MAX_RANGE_DAYS, percentChange, previousRange, resolveRange } from './range'

const SAT = new Date('2026-11-21T10:00:00Z') // Saturday
const UTC = 'UTC'

describe('resolveRange', () => {
  it('uses the business timezone for today, not the browser', () => {
    const r = resolveRange('today', new Date('2026-11-21T23:30:00Z'), 'Asia/Kolkata')
    expect(r.fromDay).toBe('2026-11-22')
    expect(r.toDay).toBe('2026-11-22')
    expect(r.days).toBe(1)
    expect(r.from.toISOString()).toBe('2026-11-21T18:30:00.000Z')
    expect(r.to.toISOString()).toBe('2026-11-22T18:30:00.000Z')
  })

  it('starts the week on Monday', () => {
    const r = resolveRange('week', SAT, UTC)
    expect(r.fromDay).toBe('2026-11-16')
    expect(r.toDay).toBe('2026-11-21')
    expect(resolveRange('week', new Date('2026-11-16T05:00:00Z'), UTC).fromDay).toBe('2026-11-16')
    expect(resolveRange('week', new Date('2026-11-22T05:00:00Z'), UTC).fromDay).toBe('2026-11-16')
  })

  it('resolves month, last30 and yesterday', () => {
    expect(resolveRange('month', SAT, UTC).fromDay).toBe('2026-11-01')
    const l = resolveRange('last30', SAT, UTC)
    expect(l.days).toBe(30)
    expect(l.toDay).toBe('2026-11-21')
    expect(l.fromDay).toBe('2026-10-23')
    const y = resolveRange('yesterday', SAT, UTC)
    expect([y.fromDay, y.toDay, y.days]).toEqual(['2026-11-20', '2026-11-20', 1])
  })

  it('swaps a custom range given backwards', () => {
    const r = resolveRange('custom', SAT, UTC, { from: '2026-11-10', to: '2026-11-01' })
    expect([r.fromDay, r.toDay, r.days]).toEqual(['2026-11-01', '2026-11-10', 10])
  })

  it('falls back to today when a custom date is missing or invalid', () => {
    const r = resolveRange('custom', SAT, UTC, { from: '2026-11-10' })
    expect([r.preset, r.fromDay, r.toDay]).toEqual(['today', '2026-11-21', '2026-11-21'])
    expect(resolveRange('custom', SAT, UTC, { from: 'nope', to: '2026-11-01' }).preset).toBe('today')
  })

  it('clamps a custom range to 366 days ending at `to`', () => {
    const r = resolveRange('custom', SAT, UTC, { from: '2020-01-01', to: '2026-11-21' })
    expect(r.days).toBe(MAX_RANGE_DAYS)
    expect(r.toDay).toBe('2026-11-21')
    expect(r.fromDay).toBe('2025-11-21')
  })
})

describe('previousRange', () => {
  it('today → yesterday', () => {
    const p = previousRange(resolveRange('today', SAT, UTC))
    expect([p.fromDay, p.toDay, p.days]).toEqual(['2026-11-20', '2026-11-20', 1])
  })
  it('a 6-day week so far → the 6 days before it', () => {
    const p = previousRange(resolveRange('week', SAT, UTC))
    expect([p.fromDay, p.toDay, p.days]).toEqual(['2026-11-10', '2026-11-15', 6])
  })
})

describe('bucketFor', () => {
  const span = (days: number) =>
    resolveRange('custom', SAT, UTC, { from: '2026-01-01', to: addDaysUtc('2026-01-01', days - 1) })
  it('day ≤ 31, week ≤ 182, month above', () => {
    expect(bucketFor(span(31))).toBe('day')
    expect(bucketFor(span(32))).toBe('week')
    expect(bucketFor(span(182))).toBe('week')
    expect(bucketFor(span(183))).toBe('month')
  })
})

describe('percentChange', () => {
  it('is relative to the previous value, null when it was 0', () => {
    expect(percentChange(12, 10)).toBe(20)
    expect(percentChange(5, 0)).toBeNull()
    expect(percentChange(0, 4)).toBe(-100)
    expect(percentChange(0, 0)).toBeNull()
  })
})

function addDaysUtc(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}
