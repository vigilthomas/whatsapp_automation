"use client"

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Bookmark, BookmarkCheck, CalendarDays, Check, LayoutDashboard, Plus, RotateCcw, SlidersHorizontal } from 'lucide-react'

import { useAuth } from '@/hooks/use-auth'
import { useBranding } from '@/hooks/use-branding'
import { useDashboardLayout } from '@/hooks/use-dashboard-layout'
import { BRAND_ICON_KEYS } from '@/lib/branding-icon-keys'
import { BRAND_ICONS } from '@/lib/branding-icons'
import {
  CARDS,
  DASHBOARD_TEMPLATES,
  cardDef,
  parseDashboardSettings,
  type DashboardTemplate,
} from '@/lib/dashboard/cards'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { DashboardGrid } from '@/components/dashboard/dashboard-grid'
import { useDashboardData } from '@/components/dashboard/dashboard-cards'
import { cn } from '@/lib/utils'

/**
 * Dashboard — a grid of cards each user arranges for themselves: move,
 * resize, hide, add back, switch between the two templates (Bookings,
 * Modern) and keep one preset. Card names and icons, and the template a
 * new user starts from, are set in Settings → Dashboard. Cards whose
 * module the user can't read are never shown or offered.
 */
export default function DashboardPage() {
  const t = useTranslations('Dashboard')
  const { profile, can } = useAuth()
  const { branding } = useBranding()
  const confirm = useConfirm()
  const settings = useMemo(() => parseDashboardSettings(branding.dashboard, BRAND_ICON_KEYS), [branding.dashboard])
  const dash = useDashboardLayout(settings.template ?? 'classic')
  const [editing, setEditing] = useState(false)

  const allowed = (id: string) => {
    const m = cardDef(id)?.module
    return !m || can(m, 'read')
  }
  const visible = dash.layout.cards.filter(allowed)
  const hidden = CARDS.map((c) => c.id).filter((id) => allowed(id) && !dash.layout.cards.includes(id))
  const data = useDashboardData(visible)

  const hour = new Date().getHours()
  const greetingKey = hour < 12 ? 'goodMorning' : hour < 17 ? 'goodAfternoon' : 'goodEvening'
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] ?? ''
  const dateLabel = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())
  const titleOf = (id: string) => settings.cards?.[id]?.title || t(`cards.${id}`)

  const pickTemplate = async (tpl: DashboardTemplate) => {
    if (tpl === dash.layout.template) return
    const ok = await confirm({
      title: t('grid.switchTitle', { name: t(`grid.templates.${tpl}`) }),
      description: t('grid.switchDesc'),
      confirmLabel: t('grid.switchConfirm'),
    })
    if (ok) dash.setTemplate(tpl)
  }

  const savePreset = async () => {
    await dash.savePreset()
    toast.success(t('grid.presetSaved'))
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
          <Button variant={editing ? 'default' : 'outline'} size="lg" onClick={() => setEditing((e) => !e)}>
            {editing ? <Check className="size-4" /> : <SlidersHorizontal className="size-4" />}
            {editing ? t('grid.done') : t('grid.customise')}
          </Button>
          {!editing && can('appointments', 'write') && (
            <Button size="lg" render={<Link href="/appointments?new=1" />}>
              <Plus className="size-4" strokeWidth={2.2} />
              {t('grid.addBooking')}
            </Button>
          )}
        </div>
      </div>

      {editing && (
        <div className="flex flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/[0.04] p-4">
          <p className="text-sm text-muted-foreground">{t('grid.editing')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <div role="radiogroup" aria-label={t('grid.template')} className="flex flex-wrap gap-1.5 rounded-xl bg-muted/70 p-1">
              {DASHBOARD_TEMPLATES.map((tpl) => {
                const on = dash.layout.template === tpl
                return (
                  <button
                    key={tpl}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    title={t(`grid.templateDesc.${tpl}`)}
                    onClick={() => void pickTemplate(tpl)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                      on ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <LayoutDashboard className="size-3.5" />
                    {t(`grid.templates.${tpl}`)}
                  </button>
                )
              })}
            </div>

            <Popover>
              <PopoverTrigger render={<Button variant="outline" size="sm" />}>
                <Plus className="size-4" /> {t('grid.addCard')}
                {hidden.length > 0 && <span className="rounded-full bg-primary/10 px-1.5 text-xs text-primary">{hidden.length}</span>}
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 gap-0.5 p-2">
                {hidden.length === 0 ? (
                  <p className="px-2 py-2 text-sm text-muted-foreground">{t('grid.noHidden')}</p>
                ) : (
                  hidden.map((id) => {
                    const Icon = BRAND_ICONS[settings.cards?.[id]?.icon || cardDef(id)!.icon]
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => dash.show(id)}
                        className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm text-popover-foreground hover:bg-muted"
                      >
                        {Icon && <Icon className="size-4 text-muted-foreground" />}
                        <span className="flex-1">{titleOf(id)}</span>
                        <Plus className="size-3.5 text-muted-foreground" />
                      </button>
                    )
                  })
                )}
              </PopoverContent>
            </Popover>

            <span className="mx-1 hidden h-6 w-px bg-border sm:block" />
            <Button variant="ghost" size="sm" onClick={() => void savePreset()}>
              <Bookmark className="size-4" /> {dash.hasPreset ? t('grid.updatePreset') : t('grid.savePreset')}
            </Button>
            <Button variant="ghost" size="sm" disabled={!dash.hasPreset || dash.onPreset} onClick={dash.applyPreset}>
              <BookmarkCheck className="size-4" /> {dash.onPreset ? t('grid.usingPreset') : t('grid.applyPreset')}
            </Button>
            <Button variant="ghost" size="sm" onClick={dash.reset}>
              <RotateCcw className="size-4" /> {t('grid.resetTemplate')}
            </Button>
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">{t('grid.empty')}</p>
      ) : (
        <DashboardGrid
          layout={dash.layout}
          cards={visible}
          settings={settings}
          data={data}
          editing={editing}
          onMove={dash.move}
          onHide={dash.hide}
        />
      )}
    </div>
  )
}
