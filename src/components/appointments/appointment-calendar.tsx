"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  bucketByDayHour,
  chipSubtitle,
  chipTone,
  hourRange,
  isSameLocalDay,
  weekDays,
  type Appointment,
  type ChipTone,
} from "@/lib/appointments/model";

/** Columns per week. Mon–Fri matches the reference design. */
export const CALENDAR_DAYS = 5;
/** Default working window rendered when nothing falls outside it. */
export const WORK_START_HOUR = 9;
export const WORK_END_HOUR = 18;

// Chip palette — mirrors the reference: blue upcoming, green done /
// AI-booked, amber attention, grey cancelled. Light defaults with
// dark variants so the grid reads in both modes.
const TONE: Record<ChipTone, { chip: string; title: string; sub: string }> = {
  blue: {
    chip: "border-l-blue-500 bg-blue-50 dark:bg-blue-950/40",
    title: "text-blue-900 dark:text-blue-100",
    sub: "text-blue-700/80 dark:text-blue-300/80",
  },
  green: {
    chip: "border-l-emerald-500 bg-emerald-50 dark:bg-emerald-950/40",
    title: "text-emerald-900 dark:text-emerald-100",
    sub: "text-emerald-700/80 dark:text-emerald-300/80",
  },
  amber: {
    chip: "border-l-amber-500 bg-amber-50 dark:bg-amber-950/40",
    title: "text-amber-900 dark:text-amber-100",
    sub: "text-amber-700/80 dark:text-amber-300/80",
  },
  grey: {
    chip: "border-l-slate-400 bg-muted",
    title: "text-muted-foreground line-through",
    sub: "text-muted-foreground",
  },
};

export type CalendarAction =
  | "edit"
  | "reschedule"
  | "cancel"
  | "confirm"
  | "complete"
  | "noShow"
  | "changeDoctor";

interface Props {
  weekStart: Date;
  appointments: Appointment[];
  loading?: boolean;
  /** Shown after "Weekly schedule ·" — the doctor filter, or "All doctors". */
  subject: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Kept for API compatibility; the page now renders the action bar
   *  (AppointmentActions) beneath whichever view is showing. */
  onAdd?: () => void;
  onAction?: (action: CalendarAction, appointment: Appointment) => void;
  canEdit: boolean;
  /** Click on an empty hour cell — pre-fills the add dialog. */
  onSlotClick?: (start: Date) => void;
}

/**
 * Weekly schedule grid, matching the reference design: a card with a
 * time column, one column per weekday with "Mon / 13 Jan" headers and
 * chips per hour row. Selection is lifted to the page, which renders
 * the shared action bar underneath.
 */
export function AppointmentCalendar({
  weekStart,
  appointments,
  loading,
  subject,
  selectedId,
  onSelect,
  canEdit,
  onSlotClick,
}: Props) {
  const t = useTranslations("Appointments");
  const tStatus = useTranslations("Appointments.status");

  const days = useMemo(() => weekDays(weekStart, CALENDAR_DAYS), [weekStart]);
  const hours = useMemo(
    () => hourRange(appointments, WORK_START_HOUR, WORK_END_HOUR),
    [appointments],
  );
  const buckets = useMemo(() => bucketByDayHour(appointments, days), [appointments, days]);
  const today = new Date();

  const statusLabels = {
    scheduled: tStatus("scheduled"),
    confirmed: tStatus("confirmed"),
    completed: tStatus("completed"),
    cancelled: tStatus("cancelled"),
    no_show: tStatus("no_show"),
    bookedByAi: t("bookedByAi"),
  };

  const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "short" });
  const dateFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
  const hourFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });


  return (
    <div className="rounded-2xl border border-border bg-card shadow-card">
      <div className="flex items-center gap-3 px-5 pt-[18px] pb-3.5">
        <h3 className="font-heading text-[15px] font-semibold text-foreground">
          {t("weeklySchedule")} · {subject}
        </h3>
        <span className="ml-auto inline-flex h-[22px] items-center rounded-full bg-neutral-bg px-2.5 text-[11.5px] font-semibold text-neutral-fg">
          {dateFmt.format(days[0])} – {dateFmt.format(days[days.length - 1])}
        </span>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto p-4">
        <div className="relative min-w-[720px] overflow-hidden rounded-xl border border-border">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-card/60">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          )}
          <table className="w-full table-fixed border-collapse text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="w-16 border-b border-border" />
                {days.map((d) => {
                  const isToday = isSameLocalDay(d, today);
                  return (
                    <th
                      key={d.toISOString()}
                      className={cn(
                        "border-b border-l border-border px-2 py-2 text-center font-medium",
                        isToday ? "text-primary" : "text-foreground",
                      )}
                    >
                      <div className="text-sm">{dayFmt.format(d)}</div>
                      <div className="text-xs font-normal text-muted-foreground">
                        {dateFmt.format(d)}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {hours.map((h) => (
                <tr key={h} className="align-top">
                  <td className="border-b border-border px-2 py-2 text-right text-xs text-muted-foreground">
                    {hourFmt.format(new Date(2000, 0, 1, h))}
                  </td>
                  {days.map((d, di) => {
                    const items = buckets.get(`${di}:${h}`) ?? [];
                    const slotStart = new Date(d);
                    slotStart.setHours(h, 0, 0, 0);
                    return (
                      <td
                        key={di}
                        onClick={() =>
                          canEdit && items.length === 0 && onSlotClick?.(slotStart)
                        }
                        className={cn(
                          "h-14 border-b border-l border-border p-1",
                          canEdit && items.length === 0 && onSlotClick
                            ? "cursor-pointer hover:bg-muted/40"
                            : "",
                        )}
                      >
                        <div className="flex flex-col gap-1">
                          {items.map((a) => {
                            const tone = TONE[chipTone(a)];
                            const isSel = a.id === selectedId;
                            return (
                              <button
                                key={a.id}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSelect(isSel ? null : a.id);
                                }}
                                aria-pressed={isSel}
                                className={cn(
                                  "w-full rounded-md border border-transparent border-l-[3px] px-2 py-1 text-left transition-shadow",
                                  tone.chip,
                                  isSel && "ring-2 ring-primary ring-offset-1 ring-offset-card",
                                )}
                              >
                                <div className={cn("truncate text-xs font-semibold", tone.title)}>
                                  {a.service}
                                </div>
                                <div className={cn("truncate text-[11px]", tone.sub)}>
                                  {chipSubtitle(a, statusLabels)}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
