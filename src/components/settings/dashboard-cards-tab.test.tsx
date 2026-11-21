import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'

import messages from '../../../messages/en.json'
import { DashboardCardsTab } from './dashboard-cards-tab'

const render = (disabled: string[]) =>
  renderToStaticMarkup(
    React.createElement(
      NextIntlClientProvider,
      { locale: 'en', messages, timeZone: 'UTC' },
      React.createElement(DashboardCardsTab, {
        sector: 'clinic',
        disabled,
        canRead: () => false,
        moduleName: (m: string) => m,
        editable: true,
        onToggle: () => {},
      }),
    ),
  )

/** The switch markup for one card, found by its aria-label. */
const switchFor = (html: string, label: string) => {
  const at = html.indexOf(`aria-label="${label}"`)
  const start = html.lastIndexOf('<', at)
  return html.slice(start, html.indexOf('>', at) + 1)
}

describe('DashboardCardsTab', () => {
  it('lets an admin switch a card even before the role can read its module', () => {
    const html = render([])
    const sw = switchFor(html, 'Pending confirmations')
    expect(sw).toContain('aria-checked="true"')
    expect(sw).not.toMatch(/data-disabled|aria-disabled="true"/)
    expect(html).toContain('Needs appointments → Read')
  })
  it('shows a switched-off card as off', () => {
    expect(switchFor(render(['stat-pending']), 'Pending confirmations')).toContain('aria-checked="false"')
  })
})
