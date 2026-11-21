import type { DataScope } from '@/lib/auth/permissions'
import { isDay, RANGE_PRESETS, type RangePreset } from './range'

/**
 * Dashboard filter state — kept in the URL only (`?range=&from=&to=&branch=`)
 * so a refresh or a shared link keeps it, and nothing is saved per user.
 *
 * The branch list is limited by the viewer's appointments data scope.
 * Picking a branch only ever narrows what RLS already returns, so a
 * crafted `?branch=` can't widen anything; `clampBranch` drops one the
 * viewer can't pick so the UI doesn't show a filter it can't explain.
 */

export interface DashboardFilters {
  preset: RangePreset
  from?: string
  to?: string
  branch: string | null
}

export interface BranchOption {
  id: string
  name: string
}

export function parseFilters(params: URLSearchParams): DashboardFilters {
  const raw = params.get('range')
  const preset = (RANGE_PRESETS as readonly string[]).includes(raw ?? '') ? (raw as RangePreset) : 'today'
  const out: DashboardFilters = { preset, branch: params.get('branch') || null }
  if (preset === 'custom') {
    const from = params.get('from')
    const to = params.get('to')
    if (isDay(from)) out.from = from
    if (isDay(to)) out.to = to
  }
  // Keep key order stable for equality checks: preset, from, to, branch.
  const { branch, ...rest } = out
  return { ...rest, branch }
}

export function filtersToQuery(f: DashboardFilters): string {
  const p = new URLSearchParams()
  if (f.preset !== 'today') p.set('range', f.preset)
  if (f.preset === 'custom') {
    if (f.from) p.set('from', f.from)
    if (f.to) p.set('to', f.to)
  }
  if (f.branch) p.set('branch', f.branch)
  return p.toString()
}

export function branchChoices(
  scope: DataScope,
  myBranchId: string | null,
  all: BranchOption[],
): { options: BranchOption[]; showAll: boolean; hidden: boolean } {
  let options: BranchOption[]
  let showAll: boolean
  switch (scope.type) {
    case 'branch':
      // Fail closed like data scope does: no branch set → no choices.
      options = all.filter((b) => b.id === myBranchId)
      showAll = false
      break
    case 'custom': {
      const picked = new Set(scope.branches ?? [])
      options = all.filter((b) => picked.has(b.id))
      showAll = options.length > 1
      break
    }
    case 'own':
      // Own bookings only — a branch filter adds nothing.
      return { options: [], showAll: false, hidden: true }
    case 'all':
    default:
      options = all
      showAll = true
  }
  return { options, showAll, hidden: options.length <= 1 }
}

export function clampBranch(f: DashboardFilters, options: BranchOption[]): string | null {
  return f.branch && options.some((o) => o.id === f.branch) ? f.branch : null
}
