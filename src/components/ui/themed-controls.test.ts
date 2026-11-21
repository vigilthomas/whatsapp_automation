import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * House rule: every select, dropdown and date/time picker uses the
 * themed components (NativeSelect / Select, DateInput / TimeInput) so it
 * follows the brand colours and dark mode. The browser's own `<select>`
 * list and date/time pickers can't be themed. Only components/ui (where
 * the themed versions are built) may use the raw elements.
 */
const SRC = join(__dirname, '..', '..')
const RAW = /<select\b|type=["'](date|time|datetime-local|month|week)["']/

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return name === 'node_modules' ? [] : files(p)
    return p.endsWith('.tsx') && !p.endsWith('.test.tsx') ? [p] : []
  })
}

describe('themed form controls', () => {
  it('no raw <select> or date/time inputs outside components/ui', () => {
    const offenders = files(SRC)
      .filter((p) => !p.split(sep).join('/').includes('/components/ui/'))
      .filter((p) => RAW.test(readFileSync(p, 'utf8')))
      .map((p) => relative(SRC, p))
    expect(offenders).toEqual([])
  })
})
