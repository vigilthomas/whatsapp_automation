"use client"

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { CalendarDays, CalendarCheck, MessageCircle, Plus, UserCheck, Users } from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/use-auth'
import { loadActivity } from '@/lib/dashboard/queries'
import type { ActivityItem } from '@/lib/dashboard/types'
import {
  loadAppointmentsTrend,
  loadClinicToday,
  loadDoctorLoad,
  loadRecentConversations,
  type ClinicTodayBundle,
  type DoctorLoad,
  type RecentConversation,
  type TrendPoint,
} from '@/lib/dashboard/clinic-queries'

import { Button } from '@/components/ui/button'
import { ActivityFeed } from '@/components/dashboard/activity-feed'
import {
  AppointmentsTrend,
  DoctorAvailability,
  StatTile,
  TodayAppointments,
  WhatsAppConversations,
} from '@/components/dashboard/clinic-widgets'

/**
 * Clinic dashboard — the "what's happening today" landing from the
 * reference design: greeting + date, four headline tiles, today's
 * appointments, doctor load, recent activity, recent WhatsApp
 * conversations and a 7-day appointments trend.
 *
 * The reference also shows call handling and an AI receptionist
 * panel; those features don't exist yet, so their tiles are not
 * rendered rather than shown with placeholder numbers.
 */
export default function DashboardPage() {
  const t = useTranslations('Dashboard.clinic')
  const tAppt = useTranslations('Appointments')
  const { profile } = useAuth()

  const [today, setToday] = useState<ClinicTodayBundle | null>(null)
  const [todayLoading, setTodayLoading] = useState(true)
  const [doctors, setDoctors] = useState<DoctorLoad[] | null>(null)
  const [doctorsLoading, setDoctorsLoading] = useState(true)
  const [convos, setConvos] = useState<RecentConversation[] | null>(null)
  const [convosLoading, setConvosLoading] = useState(true)
  const [trend, setTrend] = useState<TrendPoint[] | null>(null)
  const [trendLoading, setTrendLoading] = useState(true)
  const [activity, setActivity] = useState<ActivityItem[] | null>(null)
  const [activityLoading, setActivityLoading] = useState(true)

  const loadAll = useCallback(() => {
    const db = createClient()

    // Each widget settles on its own so a slow query never blanks the
    // others. Doctor load depends on today's appointments, so it
    // chains off that one.
    void loadClinicToday(db)
      .then((b) => {
        setToday(b)
        return loadDoctorLoad(db, b.today)
      })
      .then((d) => setDoctors(d))
      .catch((err) => console.error('[dashboard] today failed:', err))
      .finally(() => {
        setTodayLoading(false)
        setDoctorsLoading(false)
      })

    void loadRecentConversations(db)
      .then((c) => setConvos(c))
      .catch((err) => console.error('[dashboard] conversations failed:', err))
      .finally(() => setConvosLoading(false))

    void loadAppointmentsTrend(db, 7)
      .then((p) => setTrend(p))
      .catch((err) => console.error('[dashboard] trend failed:', err))
      .finally(() => setTrendLoading(false))

    void loadActivity(db, 50)
      .then((a) => setActivity(a))
      .catch((err) => console.error('[dashboard] activity failed:', err))
      .finally(() => setActivityLoading(false))
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const hour = new Date().getHours()
  const greetingKey = hour < 12 ? 'goodMorning' : hour < 17 ? 'goodAfternoon' : 'goodEvening'
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] ?? ''
  const dateLabel = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())

  const appts = today?.today ?? []
  const live = appts.filter((a) => a.status !== 'cancelled')
  const bookedByAi = live.filter((a) => a.source === 'ai').length
  const pending = live.filter((a) => a.status === 'scheduled').length

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {t(greetingKey, { name: firstName })} 👋
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm">
            <CalendarDays className="size-4 text-muted-foreground" />
            <span className="font-medium text-foreground">{dateLabel}</span>
          </div>
          <Button size="lg" render={<Link href="/appointments" />}>
            <Plus className="size-4" />
            {tAppt('actions.add')}
          </Button>
        </div>
      </div>

      {/* Headline tiles */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          icon={CalendarCheck}
          label={t('appointmentsToday')}
          value={todayLoading ? '…' : live.length}
          sub={todayLoading ? undefined : t('bookedByAiCount', { count: bookedByAi })}
          subTone="primary"
        />
        <StatTile
          icon={UserCheck}
          label={t('pendingConfirmations')}
          value={todayLoading ? '…' : pending}
          sub={todayLoading ? undefined : t('pendingHint')}
          subTone="amber"
        />
        <StatTile
          icon={MessageCircle}
          label={t('whatsappChats')}
          value={todayLoading ? '…' : (today?.openConversations ?? 0)}
          sub={todayLoading ? undefined : t('openConversations')}
        />
        <StatTile
          icon={Users}
          label={t('patients')}
          value={todayLoading ? '…' : (today?.patientsTotal ?? 0).toLocaleString()}
          sub={todayLoading ? undefined : t('patientsHint')}
        />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-1">
          <TodayAppointments items={today?.today ?? null} loading={todayLoading} />
        </div>
        <div className="space-y-4 xl:col-span-1">
          <DoctorAvailability doctors={doctors} loading={doctorsLoading} />
          <ActivityFeed items={activity} loading={activityLoading} />
        </div>
        <div className="space-y-4 xl:col-span-1">
          <WhatsAppConversations items={convos} loading={convosLoading} />
          <AppointmentsTrend points={trend} loading={trendLoading} />
        </div>
      </div>
    </div>
  )
}
