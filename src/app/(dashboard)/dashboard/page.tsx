"use client"

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { CalendarDays, Plus } from 'lucide-react'

import { useAuth } from '@/hooks/use-auth'
import { cardDef } from '@/lib/dashboard/cards'
import { packLayout, SECTOR_CARDS } from '@/lib/dashboard/sectors'

import { Button } from '@/components/ui/button'
import { DashboardGrid } from '@/components/dashboard/dashboard-grid'
import { useDashboardData } from '@/components/dashboard/dashboard-cards'


/**
 * Dashboard — a fixed grid of cards (the Bookings template). Customisation
 * was removed: users can no longer move, resize, hide or add cards, switch
 * templates or keep a preset, and Settings → Dashboard (default template,
 * card names and icons) is gone. Saved per-user layouts in user_layouts
 * and app_branding.dashboard are simply no longer read. Cards whose module
 * the user can't read are still never shown.
 */
export default function DashboardPage() {
  const t = useTranslations('Dashboard')
  const { profile, can } = useAuth()

  const visible = SECTOR_CARDS.clinic.filter((id) => {
    const m = cardDef(id)?.module
    return !m || can(m, 'read')
  })
  const LAYOUT = packLayout(visible)
  const data = useDashboardData(visible)

  const hour = new Date().getHours()
  const greetingKey = hour < 12 ? 'goodMorning' : hour < 17 ? 'goodAfternoon' : 'goodEvening'
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] ?? ''
  const dateLabel = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())

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

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">{t('grid.empty')}</p>
      ) : (
        <DashboardGrid layout={LAYOUT} cards={visible} data={data} />
      )}
    </div>
  )
}
