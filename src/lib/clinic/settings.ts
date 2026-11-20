// ============================================================
// Clinic settings — opening hours, holidays and closed dates.
// Pure, unit-testable, no I/O.
//
// Stored on `clinic_settings` (migration 060), one row per account,
// edited in Settings → Clinic (module `settings-clinic`). Every reader
// goes through `parseClinicSettings`, so a missing row, a half-filled
// document or one written by a newer build still gives sane values.
//
//   hours        weekday (0 = Sunday … 6 = Saturday) → open?, start, end
//   holidays     a named day off; `yearly` repeats it every year on the
//                same month and day (e.g. 25 Dec), otherwise just that date
//   closures     a one-off closed period, from → to inclusive (renovation,
//                staff training, a long weekend)
//
// Who follows them:
//   - Add appointment (appointment-dialog.tsx): no slots on a closed day,
//     slots only inside the day's hours.
//   - WhatsApp booking assistant (booking/runner.ts): never offers a
//     closed day, and only times inside both its own hours and these.
// Staff can still type a custom time on a closed day on purpose; the
// dialog warns instead of blocking.
// ============================================================

export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface DayHours {
  open: boolean;
  /** "HH:MM", 24-hour, clinic local time. */
  start: string;
  end: string;
}

export interface Holiday {
  id: string;
  /** yyyy-mm-dd. For a yearly holiday only the month and day matter. */
  date: string;
  name: string;
  yearly: boolean;
}

export interface Closure {
  id: string;
  /** yyyy-mm-dd, inclusive. */
  from: string;
  to: string;
  reason: string;
}

export interface ClinicSettings {
  hours: Record<Weekday, DayHours>;
  holidays: Holiday[];
  closures: Closure[];
}

export const CLINIC_LIMITS = {
  holidays: 100,
  closures: 100,
  nameLength: 80,
} as const;

const day = (open: boolean): DayHours => ({ open, start: "09:00", end: "18:00" });

/** Monday to Saturday 09:00–18:00, Sunday closed: the hours the calendar always assumed. */
export const DEFAULT_CLINIC_SETTINGS: ClinicSettings = {
  hours: { 0: day(false), 1: day(true), 2: day(true), 3: day(true), 4: day(true), 5: day(true), 6: day(true) },
  holidays: [],
  closures: [],
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const ID = /^[A-Za-z0-9_-]{1,40}$/;

export const isTime = (v: unknown): v is string => typeof v === "string" && TIME.test(v);
export const isDate = (v: unknown): v is string => typeof v === "string" && DATE.test(v);

/** "HH:MM" → minutes from midnight. */
export function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

const text = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, CLINIC_LIMITS.nameLength) : "");
const idOf = (v: unknown, fallback: string) => (typeof v === "string" && ID.test(v) ? v : fallback);

/** Coerce the stored document; anything missing or malformed takes its default. */
export function parseClinicSettings(raw: unknown): ClinicSettings {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rawHours = o.hours && typeof o.hours === "object" ? (o.hours as Record<string, unknown>) : {};
  const hours = {} as Record<Weekday, DayHours>;
  for (const w of WEEKDAYS) {
    const d = rawHours[w] && typeof rawHours[w] === "object" ? (rawHours[w] as Record<string, unknown>) : {};
    const fallback = DEFAULT_CLINIC_SETTINGS.hours[w];
    const start = isTime(d.start) ? d.start : fallback.start;
    const end = isTime(d.end) ? d.end : fallback.end;
    // A day that ends before it starts can't hold an appointment: treat it as closed.
    hours[w] = { open: (typeof d.open === "boolean" ? d.open : fallback.open) && minutesOf(end) > minutesOf(start), start, end };
  }

  const holidays: Holiday[] = [];
  for (const [i, h] of (Array.isArray(o.holidays) ? o.holidays : []).entries()) {
    if (!h || typeof h !== "object") continue;
    const r = h as Record<string, unknown>;
    if (!isDate(r.date)) continue;
    holidays.push({ id: idOf(r.id, `h${i}`), date: r.date, name: text(r.name), yearly: r.yearly === true });
    if (holidays.length >= CLINIC_LIMITS.holidays) break;
  }
  holidays.sort((a, b) => a.date.slice(5).localeCompare(b.date.slice(5)) || a.date.localeCompare(b.date));

  const closures: Closure[] = [];
  for (const [i, c] of (Array.isArray(o.closures) ? o.closures : []).entries()) {
    if (!c || typeof c !== "object") continue;
    const r = c as Record<string, unknown>;
    if (!isDate(r.from)) continue;
    const to = isDate(r.to) && r.to >= r.from ? r.to : r.from;
    closures.push({ id: idOf(r.id, `c${i}`), from: r.from, to, reason: text(r.reason) });
    if (closures.length >= CLINIC_LIMITS.closures) break;
  }
  closures.sort((a, b) => a.from.localeCompare(b.from));

  return { hours, holidays, closures };
}

/** Weekday of a yyyy-mm-dd calendar day (no time zone involved). */
export function weekdayOf(date: string): Weekday {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() as Weekday;
}

export type DayClosure = { kind: "weekly" } | { kind: "holiday"; name: string } | { kind: "closed"; reason: string };

/** Why the clinic is closed on `date`, or null when it's open. */
export function closureOn(settings: ClinicSettings, date: string): DayClosure | null {
  const holiday = settings.holidays.find((h) => (h.yearly ? h.date.slice(5) === date.slice(5) : h.date === date));
  if (holiday) return { kind: "holiday", name: holiday.name };
  const closure = settings.closures.find((c) => date >= c.from && date <= c.to);
  if (closure) return { kind: "closed", reason: closure.reason };
  if (!settings.hours[weekdayOf(date)].open) return { kind: "weekly" };
  return null;
}

/** Opening window on `date` in minutes from midnight, or null when closed. */
export function hoursOn(settings: ClinicSettings, date: string): { open: number; close: number } | null {
  if (closureOn(settings, date)) return null;
  const h = settings.hours[weekdayOf(date)];
  return { open: minutesOf(h.start), close: minutesOf(h.end) };
}

/** Earliest opening and latest closing across the week — the calendar's visible hours. */
export function weekSpan(settings: ClinicSettings): { startHour: number; endHour: number } | null {
  const open = WEEKDAYS.map((w) => settings.hours[w]).filter((h) => h.open);
  if (!open.length) return null;
  const start = Math.min(...open.map((h) => minutesOf(h.start)));
  const end = Math.max(...open.map((h) => minutesOf(h.end)));
  return { startHour: Math.floor(start / 60), endHour: Math.ceil(end / 60) };
}
