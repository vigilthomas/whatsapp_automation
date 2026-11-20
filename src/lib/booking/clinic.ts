// ============================================================
// The booking assistant honours Settings → Clinic (migration 060).
// Pure, unit-testable, no I/O.
//
// The assistant keeps its own hours (Automations → Booking), but it never
// offers a time the clinic itself is shut:
//   - a day closed in Clinic (weekly day off, holiday, closed dates) is
//     dropped entirely;
//   - on an open day the bookable window is the overlap of both sets of
//     hours (the later opening, the earlier closing). No overlap = closed.
// Clinic hours are read in the assistant's own time zone, the clinic's
// local time either way.
// ============================================================

import { closureOn, minutesOf, WEEKDAYS, type ClinicSettings } from "@/lib/clinic/settings";
import type { BookingConfig, DayHours } from "./settings";

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** A copy of `config` narrowed to when the clinic is open. `days` are the calendar days the assistant may offer. */
export function withClinic(config: BookingConfig, clinic: ClinicSettings, days: readonly string[]): BookingConfig {
  const hours = {} as BookingConfig["hours"];
  for (const w of WEEKDAYS) {
    const bot = config.hours[w];
    const own = clinic.hours[w];
    const open = Math.max(minutesOf(bot.start), minutesOf(own.start));
    const close = Math.min(minutesOf(bot.end), minutesOf(own.end));
    const day: DayHours = { open: bot.open && own.open && close > open, start: hhmm(open), end: hhmm(close) };
    hours[w] = day.open ? day : { ...bot, open: false };
  }
  const closedDays = days.filter((d) => {
    const c = closureOn(clinic, d);
    return !!c && c.kind !== "weekly"; // weekly days off are already in `hours`
  });
  return { ...config, hours, closedDays: [...(config.closedDays ?? []), ...closedDays] };
}
