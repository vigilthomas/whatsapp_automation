"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Loader2, Plus, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { chipTone, patientLabel, type Appointment, type ChipTone } from "@/lib/appointments/model";
import type { DoctorLoad, RecentConversation, TrendPoint } from "@/lib/dashboard/clinic-queries";
import { WORK_END_HOUR, WORK_START_HOUR } from "@/components/appointments/appointment-calendar";
import { BarChart } from "@/components/tremor/bar-chart";

// Widgets for the clinic dashboard, one per card in the reference
// layout. Each is presentational: the page loads the data.

const BADGE: Record<ChipTone, string> = {
  blue: "bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
  green: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  amber: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  grey: "bg-muted text-muted-foreground",
};

function CardShell({
  title,
  href,
  hrefLabel,
  children,
  className,
}: {
  title: string;
  href?: string;
  hrefLabel?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col rounded-2xl border border-border bg-card p-5", className)}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {href && hrefLabel ? (
          <Link href={href} className="flex items-center gap-1 text-sm text-primary hover:underline">
            {hrefLabel} <ArrowRight className="size-3.5" />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Spinner() {
  return (
    <div className="flex flex-1 items-center justify-center py-8">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  );
}

// ---------------------------------------------------------------

export function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  subTone = "muted",
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  subTone?: "muted" | "primary" | "amber";
}) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-border bg-card p-5">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-3xl font-bold tabular-nums text-foreground">{value}</p>
        {sub ? (
          <p
            className={cn(
              "mt-1 text-sm",
              subTone === "primary" && "text-primary",
              subTone === "amber" && "text-amber-600 dark:text-amber-400",
              subTone === "muted" && "text-muted-foreground",
            )}
          >
            {sub}
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------

export function TodayAppointments({
  items,
  loading,
}: {
  items: Appointment[] | null;
  loading: boolean;
}) {
  const t = useTranslations("Dashboard.clinic");
  const tStatus = useTranslations("Appointments.status");
  const tAppt = useTranslations("Appointments");
  const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

  return (
    <CardShell title={t("todaysAppointments")} href="/appointments" hrefLabel={t("viewAll")} className="h-full">
      {loading || !items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t("noAppointmentsToday")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((a) => {
            const label =
              a.status === "scheduled" && a.source === "ai" ? tAppt("bookedByAi") : tStatus(a.status);
            return (
              <li key={a.id} className="flex items-center gap-4 py-3">
                <span className="w-20 shrink-0 text-sm text-muted-foreground tabular-nums">
                  {timeFmt.format(new Date(a.starts_at))}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{patientLabel(a.contact)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {a.service}
                    {a.doctor ? ` · ${a.doctor.name}` : ""}
                  </p>
                </div>
                <span className={cn("shrink-0 rounded-md px-2 py-1 text-xs font-medium", BADGE[chipTone(a)])}>
                  {label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <Link
        href="/appointments"
        className="mt-auto flex items-center gap-1.5 pt-4 text-sm font-medium text-primary hover:underline"
      >
        <Plus className="size-4" /> {tAppt("actions.add")}
      </Link>
    </CardShell>
  );
}

// ---------------------------------------------------------------

export function DoctorAvailability({
  doctors,
  loading,
}: {
  doctors: DoctorLoad[] | null;
  loading: boolean;
}) {
  const t = useTranslations("Dashboard.clinic");
  const capacity = WORK_END_HOUR - WORK_START_HOUR;

  return (
    <CardShell title={t("doctorAvailability")} href="/appointments" hrefLabel={t("viewCalendar")}>
      {loading || !doctors ? (
        <Spinner />
      ) : doctors.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t("noDoctors")}{" "}
          <Link href="/master/doctors" className="text-primary hover:underline">
            {t("addDoctors")}
          </Link>
        </p>
      ) : (
        <ul className="space-y-4">
          {doctors.map((d) => {
            const pct = Math.min(100, Math.round((d.booked / capacity) * 100));
            return (
              <li key={d.id} className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {d.name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 w-36">
                  <p className="truncate text-sm font-medium text-foreground">{d.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{d.speciality ?? "—"}</p>
                </div>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-16 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                  {t("slots", { booked: d.booked, total: capacity })}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </CardShell>
  );
}

// ---------------------------------------------------------------

export function WhatsAppConversations({
  items,
  loading,
}: {
  items: RecentConversation[] | null;
  loading: boolean;
}) {
  const t = useTranslations("Dashboard.clinic");
  // Captured once per mount so render stays pure (react-hooks/purity);
  // the list re-fetches on navigation anyway.
  const [now] = useState(() => Date.now());
  const rel = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const ago = (iso: string | null) => {
    if (!iso) return "";
    const mins = Math.round((now - new Date(iso).getTime()) / 60000);
    if (mins < 60) return rel.format(-mins, "minute");
    if (mins < 60 * 24) return rel.format(-Math.round(mins / 60), "hour");
    return rel.format(-Math.round(mins / 1440), "day");
  };

  return (
    <CardShell title={t("whatsappConversations")} href="/inbox" hrefLabel={t("viewAll")}>
      {loading || !items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t("noConversations")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((c) => (
            <li key={c.id}>
              <Link href={`/inbox?c=${c.id}`} className="flex items-center gap-3 py-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {c.contactName
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((w) => w.charAt(0).toUpperCase())
                    .join("")}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-foreground">{c.contactName}</p>
                    <span className="shrink-0 text-xs text-muted-foreground">{ago(c.lastMessageAt)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs text-muted-foreground">{c.lastMessage ?? ""}</p>
                    {c.unread > 0 ? (
                      <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        {t("unread", { count: c.unread })}
                      </span>
                    ) : null}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

// ---------------------------------------------------------------

export function AppointmentsTrend({
  points,
  loading,
}: {
  points: TrendPoint[] | null;
  loading: boolean;
}) {
  const t = useTranslations("Dashboard.clinic");
  const data = (points ?? []).map((p) => ({
    day: p.label,
    [t("inClinic")]: p.inClinic,
    [t("bookedByAi")]: p.bookedByAi,
    [t("cancelled")]: p.cancelled,
  }));

  return (
    <CardShell title={t("appointmentsTrend")}>
      {loading || !points ? (
        <Spinner />
      ) : (
        <BarChart
          className="h-56"
          data={data}
          index="day"
          categories={[t("inClinic"), t("bookedByAi"), t("cancelled")]}
          colors={["emerald", "blue", "pink"]}
          type="stacked"
          showLegend
          legendPosition="right"
          allowDecimals={false}
          yAxisWidth={28}
        />
      )}
    </CardShell>
  );
}
