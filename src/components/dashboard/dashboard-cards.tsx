"use client";

/**
 * The dashboard's card catalogue rendered: which component each card id
 * shows and the data it needs (lib/dashboard/cards.ts holds the ids and
 * sizes, lib/dashboard/sectors.ts which cards each business type shows).
 *
 * Data follows the filter bar: a date range in the business timezone and
 * an optional branch. Everything reads through the browser's RLS-scoped
 * client, so the role's data scope (058/063) already applies. Only the
 * groups the visible cards need are loaded, each settling on its own so
 * a slow query never blanks the others. Number cards also load the
 * previous period of the same length for the ▲/▼ comparison.
 *
 * On "Today" the data refreshes every 60 s and when the tab comes back
 * into view (front-desk screens stay open all day); other ranges don't.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Briefcase,
  CalendarCheck,
  Coins,
  Handshake,
  MessageCircle,
  MessageSquare,
  PieChart,
  Send,
  UserCheck,
  UserPlus,
  UserX,
  Users,
  UsersRound,
  Wallet,
} from "lucide-react";

import type { Appointment } from "@/lib/appointments/model";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { formatCurrency } from "@/lib/currency";
import { loadRecentConversations, type DoctorLoad, type RecentConversation } from "@/lib/dashboard/clinic-queries";
import { loadActivity, loadMetrics, loadPipelineDonut, loadResponseTime } from "@/lib/dashboard/queries";
import type { ActivityItem, MetricsBundle, PipelineDonutData, ResponseTimeSummary } from "@/lib/dashboard/types";
import {
  countBy,
  estimatedTakings,
  messageSeries,
  noShowRate,
  returningClients,
  trendPoints,
  utilisation,
  type ApptRow,
} from "@/lib/dashboard/metrics";
import { percentChange, previousRange, type DateRange } from "@/lib/dashboard/range";
import {
  countCreatedIn,
  loadAppointmentsIn,
  loadBookingHours,
  loadBroadcastResults,
  loadCompletedCountByContact,
  loadDayAppointments,
  loadDealsSummary,
  loadMessagesIn,
  loadPointInTimeCounts,
  loadServicePrices,
  loadStaff,
  type BookingHours,
  type BroadcastResults,
  type DealsSummary,
  type PointInTimeCounts,
  type StaffRow,
} from "@/lib/dashboard/range-queries";

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
import { BroadcastResultsCard, RankList } from "@/components/dashboard/range-widgets";

type Group =
  | "appts"
  | "returning"
  | "prices"
  | "staff"
  | "day"
  | "counts"
  | "newContacts"
  | "convos"
  | "activity"
  | "metrics"
  | "messages"
  | "pipeline"
  | "response"
  | "deals"
  | "broadcasts";

const GROUPS_OF: Record<string, Group[]> = {
  "stat-bookings-today": ["appts"],
  "stat-pending": ["appts"],
  "stat-no-show-rate": ["appts"],
  "stat-takings": ["appts", "prices"],
  "stat-utilisation": ["appts", "staff"],
  "stat-returning": ["appts", "returning"],
  "bookings-trend": ["appts"],
  "staff-bookings": ["appts", "staff"],
  "top-services": ["appts"],
  "today-bookings": ["day"],
  "staff-availability": ["day", "staff"],
  "stat-open-chats": ["counts"],
  "stat-customers": ["counts"],
  "metric-new-contacts": ["newContacts"],
  "metric-active-chats": ["metrics"],
  "metric-messages-sent": ["metrics"],
  "recent-chats": ["convos"],
  "conversations-chart": ["messages"],
  "response-time": ["response"],
  "metric-open-deals": ["deals"],
  "stat-pipeline-value": ["deals"],
  "stat-deals-won-lost": ["deals"],
  pipeline: ["pipeline"],
  "broadcast-results": ["broadcasts"],
  activity: ["activity"],
};

export interface DashboardData {
  range: DateRange | null;
  appts: ApptRow[] | null;
  prevAppts: ApptRow[] | null;
  completedByContact: Map<string, number> | null;
  prevCompletedByContact: Map<string, number> | null;
  prices: Map<string, number> | null;
  staff: StaffRow[] | null;
  day: Appointment[] | null;
  counts: PointInTimeCounts | null;
  newContacts: { cur: number; prev: number } | null;
  convos: RecentConversation[] | null;
  activity: ActivityItem[] | null;
  metrics: MetricsBundle | null;
  messages: { at: string; incoming: boolean }[] | null;
  pipeline: PipelineDonutData | null;
  response: ResponseTimeSummary | null;
  deals: { cur: DealsSummary; prev: DealsSummary } | null;
  broadcasts: BroadcastResults | null;
  hours: BookingHours | null;
  loading: Record<Group, boolean>;
}

type Loaded = Omit<DashboardData, "range" | "hours" | "loading">;

const EMPTY: Loaded = {
  appts: null,
  prevAppts: null,
  completedByContact: null,
  prevCompletedByContact: null,
  prices: null,
  staff: null,
  day: null,
  counts: null,
  newContacts: null,
  convos: null,
  activity: null,
  metrics: null,
  messages: null,
  pipeline: null,
  response: null,
  deals: null,
  broadcasts: null,
};

const ALL_GROUPS = [...new Set(Object.values(GROUPS_OF).flat())];
const allLoading = (v: boolean) => Object.fromEntries(ALL_GROUPS.map((g) => [g, v])) as Record<Group, boolean>;

/** Business timezone and opening hours, loaded once (null while loading). */
export function useBookingHours(): BookingHours | null {
  const db = useRef(createClient()).current;
  const [hours, setHours] = useState<BookingHours | null>(null);
  useEffect(() => {
    let live = true;
    void loadBookingHours(db).then((h) => live && setHours(h));
    return () => {
      live = false;
    };
  }, [db]);
  return hours;
}

/** Load what the visible cards need for the range and branch. */
export function useDashboardData(
  cards: readonly string[],
  range: DateRange | null,
  branch: string | null,
  hours: BookingHours | null,
): DashboardData {
  const db = useRef(createClient()).current;
  const [state, setState] = useState<Loaded>(EMPTY);
  const [loading, setLoading] = useState(() => allLoading(true));
  const [tick, setTick] = useState(0);
  const request = useRef(0);
  const lastKey = useRef("");

  const groupKey = [...new Set(cards.flatMap((c) => GROUPS_OF[c] ?? []))].sort().join(",");
  const rangeKey = range ? `${range.fromDay}|${range.toDay}|${range.tz}` : "";

  // Live on Today: every 60 s and when the tab is shown again.
  const isToday = range?.preset === "today";
  useEffect(() => {
    if (!isToday) return;
    const bump = () => setTick((n) => n + 1);
    const onVisible = () => document.visibilityState === "visible" && bump();
    const id = window.setInterval(bump, 60_000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", bump);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", bump);
    };
  }, [isToday]);

  const set = useCallback(<K extends keyof Loaded>(id: number, k: K, v: Loaded[K]) => {
    if (id === request.current) setState((s) => ({ ...s, [k]: v }));
  }, []);

  useEffect(() => {
    if (!range) return;
    const id = ++request.current;
    const groups = new Set((groupKey ? groupKey.split(",") : []) as Group[]);
    // A filter change shows spinners; a live refresh keeps the numbers up.
    const key = `${groupKey}#${rangeKey}#${branch ?? ""}`;
    const fresh = key !== lastKey.current;
    lastKey.current = key;
    if (fresh) {
      setState(EMPTY);
      setLoading(allLoading(true));
    }
    const done = (g: Group) => {
      if (id === request.current) setLoading((l) => ({ ...l, [g]: false }));
    };
    const run = (g: Group, job: () => Promise<void>) => {
      if (!groups.has(g)) return done(g);
      job()
        .catch((err) => console.error(`[dashboard] ${g} failed:`, err))
        .finally(() => done(g));
    };
    const prev = previousRange(range);

    run("appts", async () => {
      const [cur, before] = await Promise.all([loadAppointmentsIn(db, range, branch), loadAppointmentsIn(db, prev, branch)]);
      set(id, "appts", cur);
      set(id, "prevAppts", before);
      if (groups.has("returning")) {
        const ids = (rows: ApptRow[]) => rows.map((r) => r.contact_id).filter((c): c is string => !!c);
        const [a, b] = await Promise.all([
          loadCompletedCountByContact(db, ids(cur)),
          loadCompletedCountByContact(db, ids(before)),
        ]);
        set(id, "completedByContact", a);
        set(id, "prevCompletedByContact", b);
      }
    });
    run("returning", async () => {}); // loaded with appts
    run("prices", async () => set(id, "prices", await loadServicePrices(db)));
    run("staff", async () => set(id, "staff", await loadStaff(db, branch)));
    run("day", async () => set(id, "day", await loadDayAppointments(db, range, branch)));
    run("counts", async () => set(id, "counts", await loadPointInTimeCounts(db)));
    run("newContacts", async () => {
      const [cur, before] = await Promise.all([countCreatedIn(db, "contacts", range), countCreatedIn(db, "contacts", prev)]);
      set(id, "newContacts", { cur, prev: before });
    });
    run("convos", async () => set(id, "convos", await loadRecentConversations(db)));
    run("activity", async () => set(id, "activity", await loadActivity(db, 50)));
    run("metrics", async () => set(id, "metrics", await loadMetrics(db)));
    run("messages", async () => set(id, "messages", await loadMessagesIn(db, range)));
    run("pipeline", async () => set(id, "pipeline", await loadPipelineDonut(db)));
    run("response", async () => set(id, "response", await loadResponseTime(db)));
    run("deals", async () => {
      const [cur, before] = await Promise.all([loadDealsSummary(db, range), loadDealsSummary(db, prev)]);
      set(id, "deals", { cur, prev: before });
    });
    run("broadcasts", async () => set(id, "broadcasts", await loadBroadcastResults(db, range)));
    // `range` is represented by rangeKey; `tick` re-runs the same request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupKey, rangeKey, branch, tick, db, set]);

  return { ...state, range, hours, loading };
}

// ------------------------------------------------------------ rendering

type Trend = { pct: number; up: boolean; good?: boolean } | null;

/** ▲/▼ vs the previous period; null when there's nothing to compare with. */
function trendOf(cur: number | null | undefined, prev: number | null | undefined, upIsGood = true): Trend {
  if (cur == null || prev == null) return null;
  const pct = percentChange(cur, prev);
  if (pct === null) return null;
  const up = pct >= 0;
  return { pct: Math.abs(pct), up, good: upIsGood ? up : !up };
}

function useVsLabel(range: DateRange | null): string {
  const t = useTranslations("Dashboard.range");
  if (!range) return "";
  if (range.preset === "today") return t("vsYesterday");
  if (range.preset === "week") return t("vsLastWeek");
  return t("vsPrevious", { days: range.days });
}

const join = (...parts: (string | undefined | false | null)[]) => parts.filter(Boolean).join(" · ");

/** One card's content. Title, icon, tag and link come from the grid (useCardMeta). */
export function DashboardCard({ id, data }: { id: string; data: DashboardData }) {
  const t = useTranslations("Dashboard.clinic");
  const tp = useTranslations("Dashboard.page");
  const tc = useTranslations("Dashboard.cards");
  const tr = useTranslations("Dashboard.range");
  const { defaultCurrency } = useAuth();
  const L = data.loading;
  const vs = useVsLabel(data.range);
  const range = data.range;

  const appts = data.appts;
  const prev = data.prevAppts;
  const wait = (ready: boolean, v: () => string | number) => (ready ? v() : "…");
  const live = (rows: ApptRow[] | null) => (rows ?? []).filter((a) => a.status !== "cancelled");

  const staffNames = useMemo(() => new Map((data.staff ?? []).map((s) => [s.id, s.name])), [data.staff]);
  const doctors: DoctorLoad[] | null = useMemo(() => {
    if (!data.staff || !data.day) return null;
    const counts = new Map<string, number>();
    for (const a of data.day) if (a.doctor_id && a.status !== "cancelled") counts.set(a.doctor_id, (counts.get(a.doctor_id) ?? 0) + 1);
    return data.staff.map((s) => ({ id: s.id, name: s.name, speciality: s.speciality, booked: counts.get(s.id) ?? 0 }));
  }, [data.staff, data.day]);

  const apptsReady = !L.appts && !!appts;

  switch (id) {
    case "stat-bookings-today": {
      const cur = live(appts);
      return (
        <StatTile
          icon={CalendarCheck}
          label={tc(id, { range: "" })}
          value={wait(apptsReady, () => cur.length)}
          trend={apptsReady ? trendOf(cur.length, live(prev).length) : null}
          sub={apptsReady ? join(t("viaWhatsAppCount", { count: cur.filter((a) => a.source === "whatsapp").length }), vs) : undefined}
          subTone="primary"
        />
      );
    }
    case "stat-pending": {
      const n = (rows: ApptRow[] | null) => (rows ?? []).filter((a) => a.status === "scheduled").length;
      return (
        <StatTile
          icon={UserCheck}
          tone="info"
          label={tc(id)}
          value={wait(apptsReady, () => n(appts))}
          sub={apptsReady ? t("pendingHint") : undefined}
          subTone="amber"
        />
      );
    }
    case "stat-no-show-rate": {
      const rate = appts ? noShowRate(appts) : null;
      const missed = (appts ?? []).filter((a) => a.status === "no_show").length;
      return (
        <StatTile
          icon={UserX}
          tone="warn"
          label={tc(id)}
          value={wait(apptsReady, () => (rate === null ? "—" : `${rate}%`))}
          trend={apptsReady && prev ? trendOf(rate, noShowRate(prev), false) : null}
          sub={apptsReady ? join(tr("noShows", { count: missed }), rate !== null && vs) : undefined}
        />
      );
    }
    case "stat-takings": {
      const ready = apptsReady && !L.prices && !!data.prices;
      const cur = ready ? estimatedTakings(appts!, data.prices!) : null;
      const before = ready && prev ? estimatedTakings(prev, data.prices!) : null;
      if (ready && cur === null) return <StatTile icon={Wallet} label={tc(id)} value="—" sub={tr("noPrices")} />;
      return (
        <StatTile
          icon={Wallet}
          label={tc(id)}
          value={wait(ready, () => formatCurrency(cur ?? 0, defaultCurrency))}
          trend={ready ? trendOf(cur, before) : null}
          sub={ready ? join(tr("estimated"), vs) : undefined}
        />
      );
    }
    case "stat-utilisation": {
      const ready = apptsReady && !L.staff && !!data.staff && !!data.hours && !!range;
      const n = data.staff?.length ?? 0;
      const cur = ready ? utilisation(appts!, data.hours!.hours, range!, n) : null;
      const before = ready && prev ? utilisation(prev, data.hours!.hours, previousRange(range!), n) : null;
      return (
        <StatTile
          icon={PieChart}
          label={tc(id)}
          value={wait(ready, () => (cur === null ? "—" : `${cur}%`))}
          trend={ready ? trendOf(cur, before) : null}
          sub={ready ? (cur === null ? tr("noHours") : join(tr("ofOpenHours"), vs)) : undefined}
        />
      );
    }
    case "stat-returning": {
      const ready = apptsReady && !!data.completedByContact;
      const cur = ready ? returningClients(appts!, data.completedByContact!) : null;
      const before = ready && prev && data.prevCompletedByContact ? returningClients(prev, data.prevCompletedByContact) : null;
      return (
        <StatTile
          icon={UsersRound}
          label={tc(id)}
          value={wait(ready, () => cur ?? 0)}
          trend={ready ? trendOf(cur, before) : null}
          sub={ready ? join(tr("twoPlusVisits"), vs) : undefined}
        />
      );
    }
    case "today-bookings":
      return <TodayAppointments items={data.day} loading={L.day} />;
    case "staff-availability":
      return <DoctorAvailability doctors={doctors} loading={L.day || L.staff} />;
    case "bookings-trend":
      return <AppointmentsTrend points={apptsReady && range ? trendPoints(appts!, range) : null} loading={L.appts} />;
    case "staff-bookings":
      return (
        <RankList
          title={tc(id)}
          hrefLabel={t("viewCalendar")}
          loading={L.appts || L.staff}
          rows={
            apptsReady && data.staff
              ? countBy(live(appts), (a) => a.doctor_id).map((r) => ({ label: staffNames.get(r.key) ?? "—", count: r.count }))
              : null
          }
        />
      );
    case "top-services":
      return (
        <RankList
          title={tc(id)}
          hrefLabel={t("viewAll")}
          loading={L.appts}
          rows={
            apptsReady
              ? countBy(live(appts), (a) => a.service?.trim() || null)
                  .slice(0, 5)
                  .map((r) => ({ label: r.key, count: r.count }))
              : null
          }
        />
      );
    case "stat-open-chats":
      return (
        <StatTile
          icon={MessageCircle}
          label={tc(id)}
          value={wait(!L.counts && !!data.counts, () => data.counts!.openChats)}
          sub={data.counts ? t("openConversations") : undefined}
        />
      );
    case "stat-customers":
      return (
        <StatTile
          icon={Users}
          label={tc(id)}
          value={wait(!L.counts && !!data.counts, () => data.counts!.customersTotal.toLocaleString())}
          sub={data.counts ? t("patientsHint") : undefined}
        />
      );
    case "metric-new-contacts": {
      const n = data.newContacts;
      return (
        <StatTile
          icon={UserPlus}
          label={tc(id, { range: "" })}
          value={wait(!L.newContacts && !!n, () => n!.cur.toLocaleString())}
          trend={n ? trendOf(n.cur, n.prev) : null}
          sub={n ? vs : undefined}
        />
      );
    }
    case "metric-active-chats": {
      const m = data.metrics;
      return <MetricCard title={tc(id)} value={m ? m.activeConversations.current.toLocaleString() : "…"} icon={MessageSquare} />;
    }
    case "metric-messages-sent": {
      const m = data.metrics;
      return <MetricCard title={tc(id)} value={m ? m.messagesSentToday.current.toLocaleString() : "…"} icon={Send} />;
    }
    case "metric-open-deals": {
      const d = data.deals?.cur;
      return (
        <StatTile
          icon={Briefcase}
          label={tc(id)}
          value={wait(!L.deals && !!d, () => formatCurrency(d!.openValue, defaultCurrency))}
          sub={d ? tp("openDeals", { count: d.openCount }) : undefined}
        />
      );
    }
    case "stat-pipeline-value": {
      const d = data.deals?.cur;
      return (
        <StatTile
          icon={Coins}
          label={tc(id)}
          value={wait(!L.deals && !!d, () => formatCurrency(d!.openValue, defaultCurrency))}
          sub={d ? tp("openDeals", { count: d.openCount }) : undefined}
        />
      );
    }
    case "stat-deals-won-lost": {
      const d = data.deals;
      return (
        <StatTile
          icon={Handshake}
          label={tc(id)}
          value={wait(!L.deals && !!d, () => d!.cur.won)}
          trend={d ? trendOf(d.cur.won, d.prev.won) : null}
          sub={d ? join(tr("wonLost", { won: d.cur.won, lost: d.cur.lost }), vs) : undefined}
          subTone="primary"
        />
      );
    }
    case "recent-chats":
      return <WhatsAppConversations items={data.convos} loading={L.convos} />;
    case "conversations-chart":
      return (
        <ConversationsChart
          points={data.messages && range ? messageSeries(data.messages, range) : null}
          loading={L.messages}
        />
      );
    case "pipeline":
      return <PipelineDonut data={data.pipeline} loading={L.pipeline} currency={defaultCurrency} />;
    case "response-time":
      return <ResponseTimeChart data={data.response} loading={L.response} />;
    case "broadcast-results":
      return <BroadcastResultsCard data={data.broadcasts} loading={L.broadcasts} />;
    case "activity":
      return <ActivityFeed items={data.activity} loading={L.activity} />;
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
