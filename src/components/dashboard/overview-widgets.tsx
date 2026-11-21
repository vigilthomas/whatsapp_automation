"use client";

/**
 * The dashboard's main cards (every business type): the bookings line
 * chart, the current patients table and the upcoming appointments
 * column. Colours come from the theme tokens (primary, mint, warn…), so
 * they follow Settings → Branding and dark mode.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronLeft, ChevronRight, Eye, Loader2, Plus, Search } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { addDays, localDay } from "@/lib/booking/slots";
import { formatClock } from "@/lib/dashboard/date-utils";
import { groupByDay, searchRows, visitNumber, weekOf } from "@/lib/dashboard/list-helpers";
import { loadCompletedCountByContact, loadUpcoming, type ListAppointment } from "@/lib/dashboard/range-queries";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { avatarColor, CardShell, initialsOf } from "@/components/dashboard/clinic-widgets";

function Spinner() {
  return (
    <div className="flex flex-1 items-center justify-center py-8">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  );
}

function Avatar({ name, seed }: { name: string; seed: string }) {
  return (
    <span
      className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
      style={{ background: avatarColor(seed) }}
    >
      {initialsOf(name)}
    </span>
  );
}

const dayLabel = (day: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(undefined, { ...opts, timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));

// ------------------------------------------------------------ line chart

export function BookingsLineCard({
  points,
  loading,
}: {
  points: { label: string; total: number }[] | null;
  loading: boolean;
}) {
  const t = useTranslations("Dashboard.overview");
  return (
    <CardShell title="" bodyClassName="px-3 pb-4">
      {loading || !points ? (
        <Spinner />
      ) : (
        <div className="h-full min-h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 16, right: 16, bottom: 0, left: -12 }}>
              <defs>
                <linearGradient id="bookingsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--color-border)" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
                interval="preserveStartEnd"
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
                width={40}
              />
              <Tooltip
                cursor={{ stroke: "var(--color-primary)", strokeDasharray: "4 4" }}
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <div className="rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background shadow-card">
                      {t("bookingsCount", { count: Number(payload[0].value) })}
                    </div>
                  ) : null
                }
              />
              <Area
                type="monotone"
                dataKey="total"
                stroke="var(--color-primary)"
                strokeWidth={2.5}
                fill="url(#bookingsFill)"
                activeDot={{ r: 5, fill: "var(--color-primary)", stroke: "var(--color-card)", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </CardShell>
  );
}

// ------------------------------------------------------------ patients table

const PAGE_SIZE = 5;

export function PatientsTable({
  rows,
  completed,
  loading,
  tz,
  canAdd,
}: {
  rows: ListAppointment[] | null;
  /** Completed visits ever, per contact. */
  completed: Map<string, number> | null;
  loading: boolean;
  tz: string | null;
  canAdd: boolean;
}) {
  const t = useTranslations("Dashboard.overview");
  const tStatus = useTranslations("Appointments.status");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => searchRows(rows ?? [], query), [rows, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const shown = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
  const today = tz ? localDay(new Date(), tz) : "";

  const pageList = useMemo(() => {
    const out: (number | "…")[] = [];
    for (let i = 0; i < pages; i++) {
      if (i === 0 || i === pages - 1 || Math.abs(i - current) <= 1) out.push(i);
      else if (out[out.length - 1] !== "…") out.push("…");
    }
    return out;
  }, [pages, current]);

  return (
    <CardShell
      title=""
      bodyClassName="px-5 pb-4"
      action={
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder={t("search")}
              aria-label={t("search")}
              className="h-8 w-[160px] pl-8 text-[13px]"
            />
          </div>
          {canAdd ? (
            <Link
              href="/appointments?new=1"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-primary/40 px-3 text-[13px] font-medium text-primary hover:bg-primary/5"
            >
              <Plus className="size-3.5" strokeWidth={2.2} /> {t("add")}
            </Link>
          ) : null}
        </div>
      }
    >
      {loading || !rows ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{query ? t("noMatches") : t("noPatients")}</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl">
            <table className="w-full min-w-[560px] text-left text-[13px]">
              <thead>
                <tr className="bg-primary text-[12px] text-primary-foreground">
                  <th className="rounded-l-lg px-3 py-2 font-medium">{t("colPatient")}</th>
                  <th className="px-3 py-2 font-medium">{t("colService")}</th>
                  <th className="px-3 py-2 font-medium">{t("colDate")}</th>
                  <th className="px-3 py-2 font-medium">{t("colTime")}</th>
                  <th className="px-3 py-2 font-medium">{t("colStaff")}</th>
                  <th className="rounded-r-lg px-3 py-2" aria-label={t("open")} />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const name = r.contact?.name || r.contact?.phone || "—";
                  const day = tz ? localDay(new Date(r.starts_at), tz) : r.starts_at.slice(0, 10);
                  const visits = visitNumber(r.status, (r.contact_id && completed?.get(r.contact_id)) || 0);
                  return (
                    <tr key={r.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={name} seed={r.contact_id ?? r.id} />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">{name}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {completed ? t("visit", { n: visits }) : tStatus(r.status as never)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-foreground">{r.service || "—"}</td>
                      <td className="px-3 py-2.5 text-foreground">
                        {day === today ? t("today") : dayLabel(day, { day: "numeric", month: "short" })}
                      </td>
                      <td className="px-3 py-2.5 text-foreground tabular-nums">{formatClock(r.starts_at, tz)}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{r.doctor?.name ?? "—"}</td>
                      <td className="px-3 py-2.5 text-right">
                        {r.contact_id ? (
                          <Link
                            href={`/contacts/${r.contact_id}`}
                            aria-label={t("open")}
                            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <Eye className="size-4" strokeWidth={1.75} />
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pages > 1 ? (
            <nav className="mt-3 flex items-center justify-center gap-1" aria-label={t("pages")}>
              <button
                type="button"
                onClick={() => setPage(current - 1)}
                disabled={current === 0}
                aria-label={t("previous")}
                className="flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-40"
              >
                <ChevronLeft className="size-4" />
              </button>
              {pageList.map((p, i) =>
                p === "…" ? (
                  <span key={`gap-${i}`} className="px-1.5 text-sm text-muted-foreground">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPage(p)}
                    aria-current={p === current ? "page" : undefined}
                    className={cn(
                      "flex size-8 items-center justify-center rounded-lg text-[13px] font-medium",
                      p === current ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
                    )}
                  >
                    {p + 1}
                  </button>
                ),
              )}
              <button
                type="button"
                onClick={() => setPage(current + 1)}
                disabled={current >= pages - 1}
                aria-label={t("next")}
                className="flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-40"
              >
                <ChevronRight className="size-4" />
              </button>
            </nav>
          ) : null}
        </>
      )}
    </CardShell>
  );
}

// ------------------------------------------------------------ upcoming rail

/**
 * Upcoming appointments: a Monday–Sunday strip (arrows move a week), and
 * the booked appointments for 7 days from the picked day, grouped by day.
 * Loads on its own (it doesn't follow the range filter: it's always
 * "what's coming"), narrowed to the filter's branch. "New" marks a
 * patient with no completed visit yet.
 */
export function UpcomingRail({ tz, branch }: { tz: string | null; branch: string | null }) {
  const t = useTranslations("Dashboard.overview");
  const db = useRef(createClient()).current;
  const today = tz ? localDay(new Date(), tz) : null;
  const [picked, setPicked] = useState<string | null>(null);
  const day = picked ?? today;
  const [rows, setRows] = useState<ListAppointment[] | null>(null);
  const [completed, setCompleted] = useState<Map<string, number>>(new Map());
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!tz || !day) return;
    let live = true;
    setRows(null);
    setFailed(false);
    void (async () => {
      try {
        const list = await loadUpcoming(db, day, tz, branch);
        const ids = list.map((r) => r.contact_id).filter((c): c is string => !!c);
        const counts = await loadCompletedCountByContact(db, ids);
        if (!live) return;
        setRows(list);
        setCompleted(counts);
      } catch (err) {
        console.error("[dashboard] upcoming failed:", err);
        if (live) setFailed(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [db, tz, day, branch]);

  const week = day ? weekOf(day) : [];
  // Only what's still to come: bookings earlier today have passed.
  const groups = useMemo(() => {
    if (!rows || !tz) return [];
    const now = Date.now();
    return groupByDay(
      rows.filter((r) => new Date(r.starts_at).getTime() >= now),
      tz,
    );
  }, [rows, tz]);
  const heading = (d: string) => {
    const date = dayLabel(d, { day: "numeric", month: "short" });
    if (d === today) return t("todayOn", { date });
    if (today && d === addDays(today, 1)) return t("tomorrowOn", { date });
    return dayLabel(d, { weekday: "long", day: "numeric", month: "short" });
  };

  return (
    <CardShell title="" bodyClassName="px-4 pb-4">
      {!day ? (
        <Spinner />
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setPicked(addDays(day, -7))}
              aria-label={t("previousWeek")}
              className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="text-sm font-semibold text-foreground">{dayLabel(day, { month: "long", year: "numeric" })}</span>
            <button
              type="button"
              onClick={() => setPicked(addDays(day, 7))}
              aria-label={t("nextWeek")}
              className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
          <div className="mb-4 grid grid-cols-7 gap-1.5">
            {week.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setPicked(d)}
                aria-pressed={d === day}
                className={cn(
                  "flex flex-col items-center rounded-xl border py-2 transition-colors",
                  d === day
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-foreground hover:bg-muted",
                )}
              >
                <span className="text-[11px] text-muted-foreground">{dayLabel(d, { weekday: "short" })}</span>
                <span className="text-sm font-semibold tabular-nums">{Number(d.slice(8))}</span>
              </button>
            ))}
          </div>
          {failed ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("loadFailed")}</p>
          ) : !rows ? (
            <Spinner />
          ) : groups.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("nothingUpcoming")}</p>
          ) : (
            <div className="flex flex-col gap-4">
              {groups.map((g) => (
                <div key={g.day}>
                  <p className="mb-2 text-[13px] font-semibold text-primary">{heading(g.day)}</p>
                  <ul className="flex flex-col gap-2">
                    {g.items.map((r) => {
                      const name = r.contact?.name || r.contact?.phone || "—";
                      const isNew = !!r.contact_id && !completed.get(r.contact_id);
                      return (
                        <li key={r.id} className="flex items-center gap-3">
                          <span className="w-[64px] shrink-0 text-[13px] font-medium text-foreground tabular-nums">
                            {formatClock(r.starts_at, tz)}
                          </span>
                          <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl bg-muted/60 px-3 py-2.5">
                            <Avatar name={name} seed={r.contact_id ?? r.id} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13px] font-semibold text-foreground">{name}</p>
                              <p className="truncate text-[11.5px] text-muted-foreground">
                                {r.service || "—"}
                                {r.doctor ? ` · ${r.doctor.name}` : ""}
                              </p>
                            </div>
                            {isNew ? (
                              <span className="shrink-0 rounded-full bg-warn-bg px-2 py-0.5 text-[10.5px] font-semibold text-warn-fg">
                                {t("newPatient")}
                              </span>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </CardShell>
  );
}
