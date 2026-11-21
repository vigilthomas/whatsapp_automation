"use client"

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { CalendarDays, Plus } from 'lucide-react'

import { useAuth } from '@/hooks/use-auth'
import { useBranding } from '@/hooks/use-branding'
import { scopeOf } from '@/lib/auth/permissions'
import { localDay } from '@/lib/booking/slots'
import { cardDef, isScopedCard } from '@/lib/dashboard/cards'
import { branchChoices, clampBranch, filtersToQuery, parseFilters, type BranchOption, type DashboardFilters } from '@/lib/dashboard/filters'
import { resolveRange } from '@/lib/dashboard/range'
import { packLayout, SECTOR_CARDS, visibleCards } from '@/lib/dashboard/sectors'
import { createClient } from '@/lib/supabase/client'
import { defaultSector, isSector, parseVocabulary } from '@/lib/vocabulary'

import { Button } from '@/components/ui/button'
import { DashboardGrid } from '@/components/dashboard/dashboard-grid'
import { FilterBar } from '@/components/dashboard/filter-bar'
import { useBookingHours, useDashboardData } from '@/components/dashboard/dashboard-cards'

/**
 * Dashboard — one per business type (Settings → Business type), for the
 * date range and branch in the filter bar (URL state, Today by default).
 *
 * Which cards show = the business type's list (lib/dashboard/sectors.ts)
 * ∩ modules the viewer can read ∩ cards not switched off for their role
 * in Access Control → Dashboard. Whose numbers they are is the role's
 * data scope, applied by RLS; cards it can't narrow (chats, contacts,
 * deals, broadcasts) say "Whole business" when the viewer's booking
 * scope isn't All, so nobody mistakes them for their own.
 */
export default function DashboardPage() {
  // useSearchParams() needs a Suspense boundary for the static build.
  return (
    <Suspense fallback={null}>
      <Dashboard />
    </Suspense>
  )
}

function Dashboard() {
  const t = useTranslations('Dashboard')
  const { user, profile, can, permissions, dashboardDisabled } = useAuth()
  const { branding } = useBranding()
  const pathname = usePathname()
  const params = useSearchParams()
  const hours = useBookingHours()

  const sector = useMemo(() => {
    const s = parseVocabulary(branding.vocabulary).sector
    return isSector(s) ? s : defaultSector()
  }, [branding.vocabulary])

  // Branches the viewer's booking scope allows, and their own branch.
  const [branches, setBranches] = useState<BranchOption[]>([])
  const [myBranch, setMyBranch] = useState<string | null>(null)
  const db = useRef(createClient()).current
  useEffect(() => {
    let live = true
    void db
      .from('branches')
      .select('id, name')
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('name')
      .then(({ data }) => live && setBranches((data ?? []) as BranchOption[]))
    if (user?.id) {
      void db
        .from('profiles')
        .select('branch_id')
        .eq('user_id', user.id)
        .maybeSingle()
        .then(({ data }) => live && setMyBranch((data as { branch_id?: string | null } | null)?.branch_id ?? null))
    }
    return () => {
      live = false
    }
  }, [db, user?.id])

  const scope = scopeOf(permissions, 'appointments')
  const choices = useMemo(() => branchChoices(scope, myBranch, branches), [scope, myBranch, branches])

  const filters = useMemo(() => parseFilters(new URLSearchParams(params.toString())), [params])
  const branch = clampBranch(filters, choices.options)
  const tz = hours?.tz ?? null
  // Today in the business timezone; part of the memo key so the range
  // rolls over at the business's midnight (the live refresh re-renders).
  const todayKey = tz ? localDay(new Date(), tz) : ''
  const range = useMemo(
    () => (tz ? resolveRange(filters.preset, new Date(), tz, { from: filters.from, to: filters.to }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- todayKey stands in for "now"
    [tz, filters.preset, filters.from, filters.to, todayKey],
  )

  const setFilters = (f: DashboardFilters) => {
    const q = filtersToQuery(f)
    // A no-op replace still hands out a new searchParams object; never loop on it.
    if (q === filtersToQuery({ ...filters, branch })) return
    // Shallow: Next syncs useSearchParams with history.replaceState, so
    // no server round trip is needed to change a client-side filter.
    window.history.replaceState(null, '', q ? `${pathname}?${q}` : pathname)
  }

  const visible = useMemo(
    () => visibleCards(SECTOR_CARDS[sector], (m) => can(m, 'read'), dashboardDisabled),
    [sector, can, dashboardDisabled],
  )
  const layout = useMemo(() => packLayout(visible), [visible])
  const data = useDashboardData(visible, range, branch, hours)

  const hour = new Date().getHours()
  const greetingKey = hour < 12 ? 'goodMorning' : hour < 17 ? 'goodAfternoon' : 'goodEvening'
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] ?? ''
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(tz ? { timeZone: tz } : {}),
  }).format(new Date())

  const dayLabel = range
    ? range.preset === 'today'
      ? t('range.today')
      : t('range.onDay', {
          day: new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
            new Date(`${range.fromDay}T00:00:00Z`),
          ),
        })
    : ''
  const titleParams = { range: range ? t(`range.${range.preset}`) : '', day: dayLabel }

  const tagFor = (id: string): string | undefined => {
    if (scope.type === 'all') return undefined
    const def = cardDef(id)
    if (!def?.module) return undefined
    if (!isScopedCard(def)) return t('range.wholeBusiness')
    return scope.type === 'own' ? t('range.yourBookings') : t('range.yourBranch')
  }

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <h1 className="font-heading text-[26px] leading-tight font-semibold tracking-[-0.01em] text-foreground">
          {t(`clinic.${greetingKey}`, { name: firstName })} <span className="font-sans">👋</span>
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <div className="hidden items-center gap-2.5 border-r border-border pr-3.5 sm:flex">
            <span className="flex size-9 items-center justify-center rounded-[9px] bg-[#E9EEF4] text-navy dark:bg-sunken dark:text-foreground">
              <CalendarDays className="size-[18px]" strokeWidth={1.75} />
            </span>
            <span className="text-[13.5px] font-semibold text-foreground">{dateLabel}</span>
          </div>
          {can('appointments', 'write') && (
            <Button size="lg" render={<Link href="/appointments?new=1" />}>
              <Plus className="size-4" strokeWidth={2.2} />
              {t('grid.addBooking')}
            </Button>
          )}
        </div>
      </div>

      <FilterBar
        key={`${filters.preset}|${filters.from ?? ''}|${filters.to ?? ''}`}
        filters={{ ...filters, branch }}
        range={range}
        today={todayKey || null}
        branches={choices}
        onChange={setFilters}
      />

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">{t('grid.empty')}</p>
      ) : (
        <DashboardGrid
          layout={layout}
          cards={visible}
          data={data}
          link={{ fromDay: range?.fromDay ?? '', toDay: range?.toDay ?? '', branch }}
          titleParams={titleParams}
          tagFor={tagFor}
        />
      )}
    </div>
  )
}
