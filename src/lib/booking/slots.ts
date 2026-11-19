// ============================================================
// Free-slot finder for the booking assistant — pure, no I/O.
//
// Opening hours are in the clinic's time zone; everything else is UTC
// instants. A slot is a start time on the slot grid (opening time +
// n × slotMinutes) whose whole service duration fits before closing,
// is at least `minNotice` away, and doesn't overlap any of the doctor's
// existing (not cancelled) appointments.
// ============================================================

import { dynamicStarts, type Block } from "./schedule";
import { minutesOf, type BookingConfig, type Weekday } from "./settings";

export interface Busy {
  doctor_id: string | null;
  starts_at: string;
  ends_at: string;
  /** Buffer of the booked service, in minutes (half before, half after). */
  buffer_min?: number;
}

export interface Slot {
  start: Date;
  end: Date;
  /** A doctor free for the whole slot; null when the clinic has no doctors. */
  doctorId: string | null;
}

/** The wall-clock parts of an instant in a zone. */
function partsIn(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  });
  const p: Record<string, string> = {};
  for (const { type, value } of fmt.formatToParts(date)) p[type] = value;
  return p;
}

/** Offset of `timeZone` from UTC at `date`, in ms (IST → +5h30m). */
function offsetMs(date: Date, timeZone: string): number {
  const p = partsIn(date, timeZone);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUtc - (date.getTime() - date.getMilliseconds());
}

/** "YYYY-MM-DD" of `date` in the zone. */
export function localDay(date: Date, timeZone: string): string {
  const p = partsIn(date, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}


/** Weekday of a "YYYY-MM-DD" calendar day (zone-independent). */
export function weekdayOf(day: string): Weekday {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() as Weekday;
}

/** The instant a wall-clock time on a calendar day happens in the zone. */
export function zonedInstant(day: string, minutes: number, timeZone: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  const first = guess - offsetMs(new Date(guess), timeZone);
  // Second pass settles a DST change between the guess and the answer.
  return new Date(guess - offsetMs(new Date(first), timeZone));
}

/** Calendar day `n` days after `day`. */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** The bookable calendar days from today, open ones only. */
export function candidateDays(config: BookingConfig, now: Date): string[] {
  const today = localDay(now, config.timezone);
  const out: string[] = [];
  for (let i = 0; i < config.daysAhead; i++) {
    const day = addDays(today, i);
    if (config.hours[weekdayOf(day)].open) out.push(day);
  }
  return out;
}

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && bStart < aEnd;

/**
 * Free slots on one day for a service of `durationMin` with `bufferMin`.
 *
 * Times follow the dynamic rules in schedule.ts: a gap of
 * `config.slotMinutes` when nothing is in the way, otherwise straight
 * after the doctor's previous booking plus half of each buffer.
 *
 * `doctorIds` are the doctors that may take it (one chosen doctor, or
 * every doctor for "any doctor"); `away` are times a doctor is out that
 * day (leave, half day, late coming), in minutes from midnight.
 * With "any doctor" a time is offered when someone is free, and the first
 * free doctor is returned with it. With no doctors at all, slots are only
 * limited by opening hours.
 */
export function freeSlots({
  config,
  day,
  durationMin,
  bufferMin = 0,
  doctorIds,
  away = [],
  durationFor = {},
  busy,
  now,
}: {
  config: BookingConfig;
  day: string;
  durationMin: number;
  /** A doctor's own time for this service, when it differs from `durationMin`. */
  durationFor?: Readonly<Record<string, number>>;
  bufferMin?: number;
  doctorIds: readonly string[];
  away?: readonly { doctorId: string; start: number; end: number }[];
  busy: readonly Busy[];
  now: Date;
}): Slot[] {
  const hours = config.hours[weekdayOf(day)];
  if (!hours.open) return [];
  const tz = config.timezone;
  const dayStart = zonedInstant(day, 0, tz).getTime();
  const toMin = (iso: string) => (Date.parse(iso) - dayStart) / 60_000;
  const earliest = (now.getTime() + config.minNoticeMinutes * 60_000 - dayStart) / 60_000;
  const base = {
    open: minutesOf(hours.start),
    close: minutesOf(hours.end),
    durationMin,
    bufferMin,
    gapMin: config.slotMinutes,
    earliest,
  };
  const at = (m: number, minutes = durationMin) => {
    const start = zonedInstant(day, Math.round(m), tz);
    return { start, end: new Date(start.getTime() + minutes * 60_000) };
  };

  if (doctorIds.length === 0) {
    return dynamicStarts({ ...base, blocks: [] }).map((m) => ({ ...at(m), doctorId: null }));
  }

  const byStart = new Map<number, Slot>();
  for (const id of doctorIds) {
    const blocks: Block[] = [
      ...busy
        .filter((b) => b.doctor_id === id)
        .map((b) => ({ start: toMin(b.starts_at), end: toMin(b.ends_at), bufferMin: b.buffer_min ?? 0 })),
      ...away.filter((a) => a.doctorId === id).map((a) => ({ start: a.start, end: a.end, bufferMin: 0 })),
    ];
    const minutes = durationFor[id] ?? durationMin;
    for (const m of dynamicStarts({ ...base, durationMin: minutes, blocks })) {
      const slot = { ...at(m, minutes), doctorId: id };
      if (!byStart.has(slot.start.getTime())) byStart.set(slot.start.getTime(), slot);
    }
  }
  return [...byStart.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Whether `doctorId` is free from `start` to `end` (with buffers) given `busy`. */
export function isFree(
  doctorId: string | null,
  start: Date,
  end: Date,
  busy: readonly Busy[],
  bufferMin = 0,
): boolean {
  if (!doctorId) return true;
  const half = (bufferMin / 2) * 60_000;
  return !busy.some((b) => {
    if (b.doctor_id !== doctorId) return false;
    const theirs = ((b.buffer_min ?? 0) / 2) * 60_000;
    return overlaps(start.getTime() - half, end.getTime() + half, Date.parse(b.starts_at) - theirs, Date.parse(b.ends_at) + theirs);
  });
}

/** "Mon 24 Nov" in the zone. */
export function dayLabel(day: string, timeZone: string): string {
  const noon = zonedInstant(day, 12 * 60, timeZone);
  return new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", day: "numeric", month: "short" }).format(noon);
}

/** "10:30 am" in the zone. */
export function timeLabel(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(date).toLowerCase();
}
