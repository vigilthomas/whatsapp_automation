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
export const SECTOR_CARDS: Record<Sector, readonly string[]> = {
  clinic: [
    'stat-bookings-today',
    'stat-pending',
    'stat-no-show-rate',
    'metric-new-contacts',
    'today-bookings',
    'staff-availability',
    'bookings-trend',
    'recent-chats',
  ],
  salon: [
    'stat-bookings-today',
    'stat-takings',
    'stat-utilisation',
    'stat-returning',
    'stat-no-show-rate',
    'staff-bookings',
    'top-services',
    'today-bookings',
    'recent-chats',
  ],
  agency: [
    'stat-pipeline-value',
    'stat-deals-won-lost',
    'stat-bookings-today',
    'response-time',
    'pipeline',
    'broadcast-results',
    'recent-chats',
  ],
  general: [
    'stat-bookings-today',
    'metric-new-contacts',
    'stat-open-chats',
    'metric-open-deals',
    'today-bookings',
    'conversations-chart',
    'activity',
  ],
}

/** Flow cards into rows of 12 columns, then derive the smaller screens. */
export function packLayout(ids: readonly string[]): DashboardLayout {
  const lg: GridItem[] = []
  let x = 0
  let y = 0
  let rowH = 0
  for (const id of ids) {
    const def = cardDef(id)
    if (!def) continue
    const w = Math.min(COLS.lg, def.w)
    if (x + w > COLS.lg) {
      x = 0
      y += rowH
      rowH = 0
    }
    lg.push({ i: id, x, y, w, h: def.h })
    x += w
    rowH = Math.max(rowH, def.h)
  }
  const layouts: DashboardLayout['layouts'] = { lg }
  for (const bp of BREAKPOINT_IDS) if (bp !== 'lg') layouts[bp] = deriveLayout(lg, COLS[bp])
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
): string[] {
  return ids.filter((id) => {
    if (disabled.has(id)) return false
    const m = cardDef(id)?.module
    return !m || can(m)
  })
}
