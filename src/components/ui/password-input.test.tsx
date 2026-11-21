import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'
import { NextIntlClientProvider } from 'next-intl'

import messages from '../../../messages/en.json'
import { PasswordInput } from './password-input'

describe('PasswordInput', () => {
  it('starts hidden with an eye button to show it', () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
        <PasswordInput id="pw" value="secret" onChange={() => {}} />
      </NextIntlClientProvider>,
    )
    expect(html).toMatch(/<input[^>]*type="password"/)
    expect(html).toMatch(/<button[^>]*type="button"[^>]*aria-label="Show password"/)
  })
})

/** House rule: every password field has the show/hide eye (PasswordInput). */
describe('password fields', () => {
  const SRC = join(__dirname, '..', '..')
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) return files(p)
      return p.endsWith('.tsx') && !p.endsWith('.test.tsx') ? [p] : []
    })
  it('no raw type="password" outside components/ui', () => {
    const offenders = files(SRC)
      .filter((p) => !p.split(sep).join('/').includes('/components/ui/'))
      .filter((p) => /type=["']password["']/.test(readFileSync(p, 'utf8')))
    expect(offenders).toEqual([])
  })
})
