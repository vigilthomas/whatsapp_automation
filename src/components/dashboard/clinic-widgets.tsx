"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  Loader2,
  Plus,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { chipTone, patientLabel, type Appointment, type ChipTone } from "@/lib/appointments/model";
import type { DoctorLoad, RecentConversation, TrendPoint } from "@/lib/dashboard/clinic-queries";
import { WORK_END_HOUR, WORK_START_HOUR } from "@/components/appointments/appointment-calendar";
import { BarChart } from "@/components/tremor/bar-chart";
import { Badge } from "@/components/ui/badge";
import { useAiStatus } from "@/hooks/use-ai-status";

// Widgets for the clinic dashboard, one per card in the reference
// layout (public/Main-html). Each is presentational: the page loads
// the data. Card anatomy follows the reference `.card` + `.card-h`:
// 16px radius, hairline border, 18/20px header, rows divided by lines.

/** Appointment chip tone → reference badge variant. */
const TONE_VARIANT: Record<ChipTone, "info" | "success" | "warn" | "neutral"> = {
  blue: "info",
  green: "success",
  amber: "warn",
  grey: "neutral",
};

/** Deterministic avatar colour from the reference `.a1`–`.a6` set. */
const AVATAR_COLORS = ["#0E9F9A", "#3E6FB5", "#D98A3B", "#7A6FD9", "#C25573", "#2F8F6A"];
export function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
export function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join("") || "?"
  );
}

export function CardShell({
  title,
  href,
  hrefLabel,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  href?: string;
  hrefLabel?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={cn(
        "flex flex-col rounded-2xl border border-border bg-card shadow-card",
        className,
      )}
    >
      <div className="flex items-center justify-between px-5 pt-[18px] pb-3.5">
        <h3 className="font-heading text-[15px] font-semibold text-foreground">{title}</h3>
        {action ??
          (href && hrefLabel ? (
            <Link
              href={href}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-teal-700 hover:text-teal"
            >
              {hrefLabel} <ArrowRight className="size-3.5" strokeWidth={1.75} />
            </Link>
          ) : null)}
      </div>
      <div className={cn("flex flex-1 flex-col", bodyClassName)}>{children}</div>
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
  tone = "mint",
  trend,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  subTone?: "muted" | "primary" | "amber";
  /** Icon box tint (reference `.icon-box.mint` / `.info` / `.warn`). */
  tone?: "mint" | "info" | "warn";
  /** Optional trend pill, e.g. { pct: 20, up: true }. */
  trend?: { pct: number; up: boolean } | null;
}) {
  return (
    <div className="flex items-start gap-3.5 rounded-2xl border border-border bg-card p-5 shadow-card">
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-[11px]",
          tone === "mint" && "bg-mint text-teal-700",
          tone === "info" && "bg-info-bg text-info-fg",
          tone === "warn" && "bg-warn-bg text-warn-fg",
        )}
      >
        <Icon className="size-5" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] text-muted-foreground">{label}</p>
          {trend ? (
            <span
              className={cn(
                "inline-flex h-[22px] items-center gap-0.5 rounded-full px-2 text-[11.5px] font-bold",
                trend.up ? "bg-success-bg text-success-fg" : "bg-warn-bg text-warn-fg",
              )}
            >
              {trend.up ? (
                <ArrowUpRight className="size-3" strokeWidth={2.2} />
              ) : (
                <ArrowDownRight className="size-3" strokeWidth={2.2} />
              )}
              {trend.pct}%
            </span>
          ) : null}
        </div>
        <p className="mt-1.5 mb-1 font-heading text-[30px] leading-[1.05] font-semibold tabular-nums text-foreground">
          {value}
        </p>
        {sub ? (
          <p
            className={cn(
              "text-xs",
              subTone === "primary" && "text-teal-700",
              subTone === "amber" && "text-warn-fg",
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
        <p className="border-t border-border py-8 text-center text-sm text-muted-foreground">
          {t("noAppointmentsToday")}
        </p>
      ) : (
        <ul>
          {items.map((a) => {
            const label =
              a.status === "scheduled" && a.source === "ai" ? tAppt("bookedByAi") : tStatus(a.status);
            return (
              <li key={a.id} className="flex items-center gap-4 border-t border-border px-5 py-3">
                <span className="min-w-[72px] shrink-0 text-sm font-medium text-muted-foreground tabular-nums">
                  {timeFmt.format(new Date(a.starts_at))}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{patientLabel(a.contact)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {a.service}
                    {a.doctor ? ` · ${a.doctor.name}` : ""}
                  </p>
                </div>
                <Badge variant={TONE_VARIANT[chipTone(a)]}>{label}</Badge>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-auto border-t border-border px-5 py-3.5">
        <Link
          href="/appointments"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-teal-700 hover:text-teal"
        >
          <Plus className="size-3.5" strokeWidth={2.2} /> {tAppt("actions.add")}
        </Link>
      </div>
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
        <p className="px-5 pb-5 text-center text-sm text-muted-foreground">
          {t("noDoctors")}{" "}
          <Link href="/master/doctors" className="font-semibold text-teal-700 hover:underline">
            {t("addDoctors")}
          </Link>
        </p>
      ) : (
        <ul className="flex flex-col gap-3.5 px-5 pt-1 pb-[18px]">
          {doctors.map((d) => {
            const pct = Math.min(100, Math.round((d.booked / capacity) * 100));
            return (
              <li key={d.id} className="flex items-center gap-3">
                <span
                  className="flex size-10 shrink-0 items-center justify-center rounded-xl text-[13px] font-bold text-white"
                  style={{ background: avatarColor(d.id) }}
                >
                  {initialsOf(d.name)}
                </span>
                <div className="w-[130px] min-w-0">
                  <p className="truncate text-[13.5px] font-semibold text-foreground">{d.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{d.speciality ?? "—"}</p>
                </div>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken">
                  <div className="h-full rounded-full bg-teal" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-[60px] shrink-0 text-right text-xs text-muted-foreground tabular-nums">
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
        <p className="border-t border-border py-6 text-center text-sm text-muted-foreground">
          {t("noConversations")}
        </p>
      ) : (
        <ul>
          {items.map((c) => (
            <li key={c.id} className="border-t border-border">
              <Link href={`/inbox?c=${c.id}`} className="flex items-center gap-3 px-5 py-[11px] hover:bg-card-2">
                <span
                  className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ background: avatarColor(c.id) }}
                >
                  {initialsOf(c.contactName)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[13.5px] font-semibold text-foreground">{c.contactName}</p>
                    <span className="shrink-0 text-[11px] text-muted-foreground/80">{ago(c.lastMessageAt)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs text-muted-foreground">{c.lastMessage ?? ""}</p>
                    {c.unread > 0 ? (
                      <Badge variant="success">{t("unread", { count: c.unread })}</Badge>
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

/**
 * AI Receptionist panel (reference: the highlighted card with the
 * teal halo). Reads the account's AI config; shows whether the
 * assistant is live, whether it auto-replies, and today's AI-booked
 * count. Links into the AI Agents page.
 */
export function AiReceptionistCard({ bookedByAi, loading }: { bookedByAi: number; loading: boolean }) {
  const t = useTranslations("Dashboard.ai");
  const ai = useAiStatus();
  const live = ai.loaded && ai.active;

  return (
    <section className="rounded-2xl border border-[#CDEDE9] bg-card p-5 shadow-[0_0_0_4px_rgba(14,159,154,.06),var(--sh-sm)] dark:border-teal/40">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-heading text-[15px] font-semibold text-foreground">{t("title")}</h3>
        <div className="flex items-center gap-2">
          {!ai.loaded ? null : live ? (
            <Badge variant="success">
              <i className="size-[7px] rounded-full bg-current" />
              {ai.autoReply ? t("autoReplying") : t("online")}
            </Badge>
          ) : (
            <Badge variant="neutral">{t("off")}</Badge>
          )}
          <Link href="/agents" aria-label={t("configure")} className="text-muted-foreground/80 hover:text-foreground">
            <ChevronRight className="size-4" strokeWidth={1.75} />
          </Link>
        </div>
      </div>
      <div className="mb-3.5 flex items-center gap-3.5">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-[11px] bg-mint text-teal-700",
            live && "ai-pulse",
          )}
        >
          <Sparkles className="relative size-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {loading ? "…" : t("bookedToday", { count: bookedByAi })}
          </p>
          <p className="text-[13px] text-muted-foreground">
            {!ai.loaded ? "…" : live ? (ai.autoReply ? t("handling") : t("draftsOnly")) : t("setupHint")}
          </p>
        </div>
      </div>
      <Link
        href="/agents"
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input bg-card px-3 text-[12.5px] font-semibold text-foreground hover:bg-sunken"
      >
        {live ? t("openPlayground") : t("setUp")}
        <ArrowRight className="size-3.5" strokeWidth={1.75} />
      </Link>
    </section>
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
    <CardShell title={t("appointmentsTrend")} bodyClassName="px-5 pb-[18px]">
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
