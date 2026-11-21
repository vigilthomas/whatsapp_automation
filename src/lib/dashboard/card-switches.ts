import { CARD_IDS } from './cards'

/**
 * A role's dashboard card switches (designations.dashboard_cards, 069).
 *
 * Stored as the cards switched OFF, not the ones on: NULL / missing /
 * junk means every card is on, so existing roles keep their dashboard,
 * new cards appear without a data migration, and changing the business
 * type doesn't leave a role with nothing.
 *
 * This decides what the dashboard shows, not what data the role can
 * read — module permissions and data scope do that.
 */
export interface DashboardCardSwitches {
  disabled: string[]
}

const KNOWN = new Set(CARD_IDS)

export function parseDashboardCards(raw: unknown): DashboardCardSwitches {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { disabled: [] }
  const list = (raw as { disabled?: unknown }).disabled
  if (!Array.isArray(list)) return { disabled: [] }
  const out: string[] = []
  for (const id of list) {
    if (typeof id === 'string' && KNOWN.has(id) && !out.includes(id)) out.push(id)
  }
  return { disabled: out }
}
