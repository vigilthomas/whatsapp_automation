"use client";

/**
 * DateInput / TimeInput — themed drop-ins for `<input type="date">` and
 * `<input type="time">`.
 *
 * The browser's own pickers can't be themed (they ignore the brand
 * colours and dark mode), so these render a field-like button that opens
 * a Popover in the app's colours. They keep the native contract so call
 * sites only change the tag name:
 *
 *   value:    "YYYY-MM-DD" / "HH:MM" ("" = empty)
 *   onChange: receives `{ target: { value } }`, like the native event
 *   min/max:  same string formats, enforced in the picker
 *
 * Dates are handled as plain local calendar days (no time zone math):
 * the value is built from year/month/day parts, never via toISOString,
 * which would shift a day for users east/west of UTC.
 */
import * as React from "react";
import {
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type ValueChangeEvent = { target: { value: string; name?: string }; currentTarget: { value: string; name?: string } };

const pad = (n: number) => String(n).padStart(2, "0");
/** "YYYY-MM-DD" for a local date. */
export const toDateValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Local Date at noon for a "YYYY-MM-DD" value (noon avoids DST edge cases), or null. */
export function parseDateValue(v: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v ?? "");
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  return Number.isNaN(d.getTime()) ? null : d;
}

const fieldClass =
  "flex h-9 w-full min-w-0 items-center gap-2 rounded-lg border border-input bg-card px-2.5 text-left text-sm text-foreground outline-none transition-colors hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30";

function emit(onChange: ((e: ValueChangeEvent) => void) | undefined, value: string, name?: string) {
  onChange?.({ target: { value, name }, currentTarget: { value, name } });
}

interface BaseProps {
  value?: string | null;
  onChange?: (event: ValueChangeEvent) => void;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  id?: string;
  placeholder?: string;
  min?: string;
  max?: string;
  "aria-label"?: string;
  autoFocus?: boolean;
  /** Show a clear (×) button when there is a value. Defaults to `!required`. */
  clearable?: boolean;
}

/* ───────────────────────────── Calendar ───────────────────────────── */

export function Calendar({
  value,
  onSelect,
  min,
  max,
}: {
  value: Date | null;
  onSelect: (d: Date) => void;
  min?: Date | null;
  max?: Date | null;
}) {
  const [month, setMonth] = React.useState(() => startOfMonth(value ?? new Date()));
  const today = toDateValue(new Date());
  const selected = value ? toDateValue(value) : "";
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekdays = Array.from({ length: 7 }, (_, i) => format(new Date(weekStart.getTime() + i * 86400000), "EEEEEE"));

  const days: Date[] = [];
  for (
    let d = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    d <= endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 12)
  ) {
    days.push(d);
  }
  const minV = min ? toDateValue(min) : "";
  const maxV = max ? toDateValue(max) : "";

  return (
    <div className="w-[17rem] select-none">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonth((m) => addMonths(m, -1))}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Previous month"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-sm font-semibold text-foreground">{format(month, "MMMM yyyy")}</span>
        <button
          type="button"
          onClick={() => setMonth((m) => addMonths(m, 1))}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Next month"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {weekdays.map((w) => (
          <span key={w} className="py-1 text-[11px] font-medium text-muted-foreground uppercase">
            {w}
          </span>
        ))}
        {days.map((d) => {
          const v = toDateValue(d);
          const out = (minV && v < minV) || (maxV && v > maxV);
          const isSel = v === selected;
          return (
            <button
              key={v}
              type="button"
              disabled={!!out}
              onClick={() => onSelect(d)}
              className={cn(
                "flex h-8 items-center justify-center rounded-md text-sm transition-colors",
                isSameMonth(d, month) ? "text-foreground" : "text-muted-foreground/50",
                v === today && !isSel && "font-semibold text-primary ring-1 ring-primary/40",
                isSel ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                out && "cursor-not-allowed opacity-30 hover:bg-transparent",
              )}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ───────────────────────────── DateInput ───────────────────────────── */

export function DateInput({
  value,
  onChange,
  className,
  disabled,
  required,
  name,
  id,
  placeholder = "Pick a date",
  min,
  max,
  clearable,
  autoFocus,
  ...aria
}: BaseProps) {
  const [open, setOpen] = React.useState(false);
  const date = parseDateValue(value);
  const canClear = (clearable ?? !required) && !!date && !disabled;
  const todayV = toDateValue(new Date());
  const todayAllowed = (!min || todayV >= min) && (!max || todayV <= max);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button type="button" id={id} disabled={disabled} autoFocus={autoFocus} className={cn(fieldClass, className)} {...aria} />
        }
      >
        <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
        <span className={cn("flex-1 truncate", !date && "text-muted-foreground")}>
          {date ? format(date, "d MMM yyyy") : placeholder}
        </span>
        {canClear ? (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Clear date"
            onClick={(e) => {
              e.stopPropagation();
              emit(onChange, "", name);
            }}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3">
        <Calendar
          value={date}
          min={parseDateValue(min)}
          max={parseDateValue(max)}
          onSelect={(d) => {
            emit(onChange, toDateValue(d), name);
            setOpen(false);
          }}
        />
        <div className="flex justify-between border-t border-border pt-2">
          <button
            type="button"
            disabled={!todayAllowed}
            onClick={() => {
              emit(onChange, todayV, name);
              setOpen(false);
            }}
            className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-40"
          >
            Today
          </button>
          {!required ? (
            <button
              type="button"
              onClick={() => {
                emit(onChange, "", name);
                setOpen(false);
              }}
              className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Clear
            </button>
          ) : null}
        </div>
      </PopoverContent>
      {/* Keeps native form validation (`required`) and form posts working. */}
      {name || required ? (
        <input
          tabIndex={-1}
          aria-hidden
          className="sr-only"
          name={name}
          value={value ?? ""}
          required={required}
          onChange={() => {}}
        />
      ) : null}
    </Popover>
  );
}

/* ───────────────────────────── TimeInput ───────────────────────────── */

const parseTime = (v: string | null | undefined) => {
  const m = /^(\d{2}):(\d{2})/.exec(v ?? "");
  return m ? { h: Number(m[1]), m: Number(m[2]) } : null;
};

export function TimeInput({
  value,
  onChange,
  className,
  disabled,
  required,
  name,
  id,
  placeholder = "--:--",
  min,
  max,
  clearable,
  /** Minute step, like the native `step` attribute but in minutes. Default 5. */
  minuteStep = 5,
  autoFocus,
  ...aria
}: BaseProps & { minuteStep?: number }) {
  const [open, setOpen] = React.useState(false);
  const t = parseTime(value);
  const canClear = (clearable ?? !required) && !!t && !disabled;
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => i * minuteStep);
  // Keep an existing off-step value (e.g. 10:07) selectable.
  if (t && !minutes.includes(t.m)) {
    minutes.push(t.m);
    minutes.sort((a, b) => a - b);
  }
  const inRange = (v: string) => (!min || v >= min) && (!max || v <= max);
  const set = (h: number, m: number) => emit(onChange, `${pad(h)}:${pad(m)}`, name);

  const hourRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    // Bring the chosen hour into view when the popover opens.
    requestAnimationFrame(() => {
      hourRef.current?.querySelector("[data-selected=true]")?.scrollIntoView({ block: "center" });
    });
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button type="button" id={id} disabled={disabled} autoFocus={autoFocus} className={cn(fieldClass, className)} {...aria} />
        }
      >
        <Clock className="size-4 shrink-0 text-muted-foreground" />
        <span className={cn("flex-1 truncate tabular-nums", !t && "text-muted-foreground")}>
          {t ? `${pad(t.h)}:${pad(t.m)}` : placeholder}
        </span>
        {canClear ? (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Clear time"
            onClick={(e) => {
              e.stopPropagation();
              emit(onChange, "", name);
            }}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <div className="flex gap-1">
          <div ref={hourRef} className="flex max-h-56 w-14 flex-col gap-0.5 overflow-y-auto pr-1">
            {hours.map((h) => (
              <button
                key={h}
                type="button"
                data-selected={t?.h === h}
                disabled={!inRange(`${pad(h)}:59`) && !inRange(`${pad(h)}:00`)}
                onClick={() => set(h, t?.m ?? 0)}
                className={cn(
                  "rounded-md py-1 text-sm tabular-nums transition-colors disabled:opacity-30",
                  t?.h === h ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
                )}
              >
                {pad(h)}
              </button>
            ))}
          </div>
          <div className="flex max-h-56 w-14 flex-col gap-0.5 overflow-y-auto border-l border-border pl-1">
            {minutes.map((m) => {
              const h = t?.h ?? 9;
              return (
                <button
                  key={m}
                  type="button"
                  disabled={!inRange(`${pad(h)}:${pad(m)}`)}
                  onClick={() => {
                    set(h, m);
                    setOpen(false);
                  }}
                  className={cn(
                    "rounded-md py-1 text-sm tabular-nums transition-colors disabled:opacity-30",
                    t?.m === m ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
                  )}
                >
                  {pad(m)}
                </button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
      {name || required ? (
        <input
          tabIndex={-1}
          aria-hidden
          className="sr-only"
          name={name}
          value={value ?? ""}
          required={required}
          onChange={() => {}}
        />
      ) : null}
    </Popover>
  );
}
