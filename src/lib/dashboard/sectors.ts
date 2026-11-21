import type { ModuleId } from '@/lib/auth/module-access'
import type { Sector } from '@/lib/vocabulary'
import { BREAKPOINT_IDS, cardDef, COLS, deriveLayout, type DashboardLayout, type GridItem } from './cards'

/**
 * One dashboard per business type (Settings → Business type,
 * app_branding.vocabulary.sector). Changing the type changes the
 * dashboard on the next render — nothing is stored per sector.
 *
 * The order here is the reading order; `packLayout` flows the cards a
 * viewer may see left→right into 12 columns, so a card hidden by
 * permissions or a role's switch leaves no hole.
 */
/**
 * Every business type shows the same dashboard (chosen 2026-11-21): four
 * number tiles, the bookings line chart, the current patients table and
 * the upcoming appointments column. Wording follows the business type
 * through the vocabulary ([[Customers]], [[Staff]]…). The older cards
 * stay in the catalogue (cards.ts) for later use.
 */
const DEFAULT_CARDS = [
  'stat-takings',
  'stat-customers',
  'metric-new-contacts',
  'stat-completed',
  'bookings-line',
  'patients-table',
  'upcoming-appointments',
] as const

export const SECTOR_CARDS: Record<Sector, readonly string[]> = {
  clinic: DEFAULT_CARDS,
  salon: DEFAULT_CARDS,
  agency: DEFAULT_CARDS,
  general: DEFAULT_CARDS,
}

/** Shelf-pack cards left→right into `cols` columns, scaling 12-column widths. */
function shelf(ids: readonly string[], cols: number): GridItem[] {
  const out: GridItem[] = []
  let x = 0
  let y = 0
  let rowH = 0
  for (const id of ids) {
    const def = cardDef(id)
    if (!def) continue
    const w = Math.min(cols, Math.max(1, Math.round((def.w * cols) / COLS.lg)))
    if (x + w > cols) {
      x = 0
      y += rowH
      rowH = 0
    }
    out.push({ i: id, x, y, w, h: def.h })
    x += w
    rowH = Math.max(rowH, def.h)
  }
  return out
}

const bottom = (items: GridItem[]) => items.reduce((m, it) => Math.max(m, it.y + it.h), 0)

/**
 * Flow cards into rows of 12 columns, then derive the smaller screens.
 * A visible rail card (Upcoming appointments) takes the right 4 columns
 * from the top, as tall as the rest; the others pack into the 8 beside
 * it. Smaller screens put the rail full width after everything else.
 */
export function packLayout(ids: readonly string[]): DashboardLayout {
  const rail = ids.filter((id) => cardDef(id)?.rail)
  const main = ids.filter((id) => !cardDef(id)?.rail)
  const railW = 4
  const mainCols = rail.length ? COLS.lg - railW : COLS.lg

  const lg = shelf(main, mainCols)
  const h = bottom(lg)
  rail.forEach((id, i) => {
    const def = cardDef(id)!
    lg.push({ i: id, x: mainCols, y: i === 0 ? 0 : bottom(lg.filter((it) => it.x >= mainCols)), w: railW, h: Math.max(def.h, h) })
  })

  // Smaller screens: the main cards at their 12-column sizes, then the rail.
  const stacked = shelf(main, COLS.lg)
  let y = bottom(stacked)
  for (const id of rail) {
    const def = cardDef(id)!
    stacked.push({ i: id, x: 0, y, w: COLS.lg, h: def.h })
    y += def.h
  }
  const layouts: DashboardLayout['layouts'] = { lg }
  for (const bp of BREAKPOINT_IDS) if (bp !== 'lg') layouts[bp] = deriveLayout(stacked, COLS[bp])
  return { cards: lg.map((it) => it.i), layouts }
}

export function sectorLayout(sector: Sector): DashboardLayout {
  return packLayout(SECTOR_CARDS[sector])
}

/** In the sector's list, readable by the role, and not switched off for it. */
export function visibleCards(
  ids: readonly string[],
  can: (m: ModuleId) => boolean,
  disabled: ReadonlySet<string>,
  /**
   * False while the profile is loading: `can()` answers yes to reads then
   * (so pages don't flash "no access"), and chats/contacts/deals are only
   * gated here, not by RLS, so nothing may render or load until it's known.
   */
  ready = true,
): string[] {
  if (!ready) return []
  return ids.filter((id) => {
    if (disabled.has(id)) return false
    const m = cardDef(id)?.module
    return !m || can(m)
  })
}
