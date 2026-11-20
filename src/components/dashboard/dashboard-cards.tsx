"use client";

/**
 * The dashboard's card catalogue rendered: which component each card id
 * shows and the data it needs (lib/dashboard/cards.ts holds the ids,
 * sizes and templates).
 *
 * Data is loaded per group, and only for cards that are on the user's
 * dashboard: hiding the deals cards means the pipeline query never runs.
 * Each group settles on its own, so a slow query never blanks the others.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarCheck, Briefcase, MessageCircle, MessageSquare, Send, UserCheck, UserPlus, Users } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { formatCurrency } from "@/lib/currency";
import {
  loadAppointmentsTrend,
  loadClinicToday,
  loadDoctorLoad,
  loadRecentConversations,
  type ClinicTodayBundle,
  type DoctorLoad,
  type RecentConversation,
  type TrendPoint,
} from "@/lib/dashboard/clinic-queries";
import { loadActivity, loadConversationsSeries, loadMetrics, loadPipelineDonut, loadResponseTime } from "@/lib/dashboard/queries";
import type {
  ActivityItem,
  ConversationsSeriesPoint,
  MetricsBundle,
  PipelineDonutData,
  ResponseTimeSummary,
} from "@/lib/dashboard/types";

import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { ConversationsChart } from "@/components/dashboard/conversations-chart";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PipelineDonut } from "@/components/dashboard/pipeline-donut";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { ResponseTimeChart } from "@/components/dashboard/response-time-chart";
import {
  AppointmentsTrend,
  CardShell,
  DoctorAvailability,
  StatTile,
  TodayAppointments,
  WhatsAppConversations,
} from "@/components/dashboard/clinic-widgets";

type Group = "today" | "convos" | "trend" | "activity" | "metrics" | "series" | "pipeline" | "response";

const GROUP_OF: Record<string, Group> = {
  "stat-bookings-today": "today",
  "stat-open-chats": "today",
  "stat-customers": "today",
  "stat-pending": "today",
  "today-bookings": "today",
  "staff-availability": "today",
  "recent-chats": "convos",
  "bookings-trend": "trend",
  activity: "activity",
  "metric-active-chats": "metrics",
  "metric-new-contacts": "metrics",
  "metric-messages-sent": "metrics",
  "metric-open-deals": "metrics",
  "conversations-chart": "series",
  pipeline: "pipeline",
  "response-time": "response",
};

type RangeDays = 7 | 30 | 90;

export interface DashboardData {
  today: ClinicTodayBundle | null;
  doctors: DoctorLoad[] | null;
  convos: RecentConversation[] | null;
  trend: TrendPoint[] | null;
  activity: ActivityItem[] | null;
  metrics: MetricsBundle | null;
  series: Record<RangeDays, ConversationsSeriesPoint[] | null>;
  range: RangeDays;
  setRange: (r: RangeDays) => void;
  pipeline: PipelineDonutData | null;
  response: ResponseTimeSummary | null;
  loading: Record<Group, boolean>;
}

const ALL_LOADING: Record<Group, boolean> = {
  today: true, convos: true, trend: true, activity: true, metrics: true, series: true, pipeline: true, response: true,
};

/** Load what the visible cards need, once per group. */
export function useDashboardData(cards: readonly string[]): DashboardData {
  const db = useRef(createClient()).current;
  const started = useRef(new Set<Group>());
  const [loading, setLoading] = useState(ALL_LOADING);
  const [today, setToday] = useState<ClinicTodayBundle | null>(null);
  const [doctors, setDoctors] = useState<DoctorLoad[] | null>(null);
  const [convos, setConvos] = useState<RecentConversation[] | null>(null);
  const [trend, setTrend] = useState<TrendPoint[] | null>(null);
  const [activity, setActivity] = useState<ActivityItem[] | null>(null);
  const [metrics, setMetrics] = useState<MetricsBundle | null>(null);
  const [series, setSeries] = useState<Record<RangeDays, ConversationsSeriesPoint[] | null>>({ 7: null, 30: null, 90: null });
  const [range, setRangeState] = useState<RangeDays>(30);
  const [pipeline, setPipeline] = useState<PipelineDonutData | null>(null);
  const [response, setResponse] = useState<ResponseTimeSummary | null>(null);

  const done = useCallback((g: Group) => setLoading((l) => ({ ...l, [g]: false })), []);
  const key = [...new Set(cards.map((c) => GROUP_OF[c]).filter(Boolean))].sort().join(",");

  useEffect(() => {
    const groups = key ? (key.split(",") as Group[]) : [];
    for (const g of groups) {
      if (started.current.has(g)) continue;
      started.current.add(g);
      const fail = (err: unknown) => console.error(`[dashboard] ${g} failed:`, err);
      switch (g) {
        case "today":
          void loadClinicToday(db)
            .then((b) => {
              setToday(b);
              return loadDoctorLoad(db, b.today);
            })
            .then(setDoctors)
            .catch(fail)
            .finally(() => done(g));
          break;
        case "convos":
          void loadRecentConversations(db).then(setConvos).catch(fail).finally(() => done(g));
          break;
        case "trend":
          void loadAppointmentsTrend(db, 7).then(setTrend).catch(fail).finally(() => done(g));
          break;
        case "activity":
          void loadActivity(db, 50).then(setActivity).catch(fail).finally(() => done(g));
          break;
        case "metrics":
          void loadMetrics(db).then(setMetrics).catch(fail).finally(() => done(g));
          break;
        case "series":
          void loadConversationsSeries(db, 30)
            .then((s) => setSeries((p) => ({ ...p, 30: s })))
            .catch(fail)
            .finally(() => done(g));
          break;
        case "pipeline":
          void loadPipelineDonut(db).then(setPipeline).catch(fail).finally(() => done(g));
          break;
        case "response":
          void loadResponseTime(db).then(setResponse).catch(fail).finally(() => done(g));
          break;
      }
    }
  }, [key, db, done]);

  const setRange = useCallback(
    (r: RangeDays) => {
      setRangeState(r);
      if (series[r] !== null) return;
      setLoading((l) => ({ ...l, series: true }));
      loadConversationsSeries(db, r)
        .then((s) => setSeries((p) => ({ ...p, [r]: s })))
        .catch((err) => console.error("[dashboard] series failed:", err))
        .finally(() => done("series"));
    },
    [db, series, done],
  );

  return { today, doctors, convos, trend, activity, metrics, series, range, setRange, pipeline, response, loading };
}

function deltaLabel(delta: number, suffix: string, noChange: string): string {
  if (delta === 0) return noChange;
  return `${delta > 0 ? "+" : ""}${delta.toLocaleString()} ${suffix}`;
}

/** One card's content. Title and icon come from the grid (useCardMeta). */
export function DashboardCard({ id, data }: { id: string; data: DashboardData }) {
  const t = useTranslations("Dashboard.clinic");
  const tp = useTranslations("Dashboard.page");
  const tc = useTranslations("Dashboard.cards");
  const { defaultCurrency } = useAuth();
  const L = data.loading;

  const live = (data.today?.today ?? []).filter((a) => a.status !== "cancelled");
  const wait = (v: string | number) => (L.today ? "…" : v);
  const m = data.metrics;

  switch (id) {
    case "stat-bookings-today":
      return (
        <StatTile
          icon={CalendarCheck}
          label={tc(id)}
          value={wait(live.length)}
          sub={L.today ? undefined : t("viaWhatsAppCount", { count: live.filter((a) => a.source === "whatsapp").length })}
          subTone="primary"
        />
      );
    case "stat-open-chats":
      return <StatTile icon={MessageCircle} label={tc(id)} value={wait(data.today?.openConversations ?? 0)} sub={L.today ? undefined : t("openConversations")} />;
    case "stat-customers":
      return (
        <StatTile icon={Users} label={tc(id)} value={wait((data.today?.patientsTotal ?? 0).toLocaleString())} sub={L.today ? undefined : t("patientsHint")} />
      );
    case "stat-pending":
      return (
        <StatTile
          icon={UserCheck}
          tone="info"
          label={tc(id)}
          value={wait(live.filter((a) => a.status === "scheduled").length)}
          sub={L.today ? undefined : t("pendingHint")}
          subTone="amber"
        />
      );
    case "today-bookings":
      return <TodayAppointments items={data.today?.today ?? null} loading={L.today} />;
    case "staff-availability":
      return <DoctorAvailability doctors={data.doctors} loading={L.today} />;
    case "recent-chats":
      return <WhatsAppConversations items={data.convos} loading={L.convos} />;
    case "bookings-trend":
      return <AppointmentsTrend points={data.trend} loading={L.trend} />;
    case "activity":
      return <ActivityFeed items={data.activity} loading={L.activity} />;
    case "metric-active-chats":
      return (
        <MetricCard
          title={tc(id)}
          value={m ? m.activeConversations.current.toLocaleString() : "…"}
          icon={MessageSquare}
          delta={m ? { sign: m.activeConversations.previous, label: deltaLabel(m.activeConversations.previous, tp("newTodayVsYesterday"), tp("noChange", { suffix: tp("newTodayVsYesterday") })) } : undefined}
        />
      );
    case "metric-new-contacts": {
      const d = m ? m.newContactsToday.current - m.newContactsToday.previous : 0;
      return (
        <MetricCard
          title={tc(id)}
          value={m ? m.newContactsToday.current.toLocaleString() : "…"}
          icon={UserPlus}
          delta={m ? { sign: d, label: deltaLabel(d, tp("vsYesterday"), tp("noChange", { suffix: tp("vsYesterday") })) } : undefined}
        />
      );
    }
    case "metric-messages-sent": {
      const d = m ? m.messagesSentToday.current - m.messagesSentToday.previous : 0;
      return (
        <MetricCard
          title={tc(id)}
          value={m ? m.messagesSentToday.current.toLocaleString() : "…"}
          icon={Send}
          delta={m ? { sign: d, label: deltaLabel(d, tp("vsYesterday"), tp("noChange", { suffix: tp("vsYesterday") })) } : undefined}
        />
      );
    }
    case "metric-open-deals":
      return (
        <MetricCard
          title={tc(id)}
          value={m ? formatCurrency(m.openDealsValue, defaultCurrency) : "…"}
          icon={Briefcase}
          subtitle={m ? tp("openDeals", { count: m.openDealsCount }) : undefined}
        />
      );
    case "conversations-chart":
      return <ConversationsChart series={data.series} loading={L.series} range={data.range} onRangeChange={data.setRange} />;
    case "pipeline":
      return <PipelineDonut data={data.pipeline} loading={L.pipeline} currency={defaultCurrency} />;
    case "response-time":
      return <ResponseTimeChart data={data.response} loading={L.response} />;
    case "quick-actions":
      return (
        <CardShell title={tc(id)} bodyClassName="px-5 pb-5">
          <QuickActions />
        </CardShell>
      );
    default:
      return null;
  }
}
