// ============================================================
// AI assistant — booking tools. No I/O of its own: everything goes
// through BookingDeps (src/lib/booking/runner.ts → loadDeps), so it is
// unit-testable with fake deps.
//
// The AI books through the booking assistant's own engine, never around
// it: free times come from `slotsByDay` (opening hours, holidays, leaves,
// existing appointments, each service's buffer, the stylist's own time
// for the service), and saving goes through `deps.book`, which re-checks
// the time right before inserting. So the model can only ever offer and
// book times that are actually free — it never computes availability
// itself.
//
//   find_times      { service, stylist?, date?, after?, appointment? } → free times, by day
//   book            { service, stylist?, start, name? }        → the appointment
//   my_appointments {}                                         → this chat's own bookings
//   cancel          { appointment }                            → cancels one of them
//   reschedule      { appointment, start, stylist? }           → moves one of them
//
// Security: the customer is the WhatsApp sender (the webhook's contact),
// never someone the model names. `my_appointments` takes no arguments and
// `deps.own` is built for that one contact, so the model can't ask for
// anyone else's bookings; cancel/reschedule only act on an id that is in
// that same list (and the database update filters by contact again), so
// an id typed by the customer or invented by the model does nothing.
//
// `start` is "YYYY-MM-DD HH:MM" in the business's own time zone. A book
// call for a time that isn't free fails with the free times that day, so
// the model can offer those instead.
// ============================================================

import { doctorsFor, slotsByDay, withService, type BookDoctor, type BookingDeps, type BookingState } from "@/lib/booking/engine";
import { hhmm } from "@/lib/booking/schedule";
import { minutesOf } from "@/lib/booking/settings";
import { candidateDays, dayLabel, timeLabel, zonedInstant, type Busy, type Slot } from "@/lib/booking/slots";

export const TOOL_NAMES = ["find_times", "book", "my_appointments", "cancel", "reschedule"] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export interface ToolCall {
  tool: ToolName;
  service: string;
  /** A stylist's name, or "" / "any" for whoever is free. */
  stylist: string;
  /** find_times: "YYYY-MM-DD" or "" for the next open days. */
  date: string;
  /** book: "YYYY-MM-DD HH:MM", local time. */
  start: string;
  /** book: the customer's name, when they gave one. */
  name: string;
  /** cancel / reschedule (and find_times while rescheduling): an id from my_appointments. */
  appointment: string;
  /** find_times: "HH:MM" — list times from this time of day on ("" = from opening). */
  after: string;
}

/** One of the sender's own appointments, as the loader returns it. */
export interface OwnAppointment {
  id: string;
  service: string | null;
  doctor_id: string | null;
  branch_id: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
}

/**
 * The sender's own bookings. Built for ONE contact (runner.ts): `list`
 * returns only that contact's appointments (from 30 days back on), and
 * `cancel` / `move` filter by that contact again in the database.
 */
export interface CustomerBookings {
  list: () => Promise<OwnAppointment[]>;
  cancel: (id: string) => Promise<"ok" | "gone">;
  move: (
    id: string,
    to: { startsAt: Date; endsAt: Date; doctorId: string | null; branchId: string | null; bufferMin: number },
  ) => Promise<"ok" | "taken" | "gone">;
}

/** Booking deps plus the sender's own bookings (absent → those actions fail safely). */
export type AiDeps = BookingDeps & { own?: CustomerBookings };

const ACTIVE = new Set(["scheduled", "confirmed"]);

/** What the model gets back, as JSON. */
export type ToolResult = { ok: true; [key: string]: unknown } | { ok: false; error: string; [key: string]: unknown };

/** Times listed per day; enough to choose from without flooding the prompt (and a small model's token budget). */
const MAX_TIMES_PER_DAY = 8;
const HHMM = /^\d{2}:\d{2}$/;
/** Days returned when the customer didn't name one. */
const DAYS_WHEN_UNSPECIFIED = 3;
const ANY = /^(any|anyone|any stylist|any doctor|no preference|)$/i;

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Exact name first, then a unique partial match ("anjali" → "Anjali Menon"). */
export function matchByName<T extends { name: string }>(items: readonly T[], wanted: string): T | undefined {
  const w = norm(wanted);
  if (!w) return undefined;
  const exact = items.find((i) => norm(i.name) === w);
  if (exact) return exact;
  const partial = items.filter((i) => norm(i.name).includes(w) || w.includes(norm(i.name)));
  return partial.length === 1 ? partial[0] : undefined;
}

interface Resolved {
  state: BookingState;
  stylist: BookDoctor | null;
}

/** Service + stylist → engine state, or an error the model can act on. */
function resolve(deps: BookingDeps, call: ToolCall): Resolved | ToolResult {
  const service = matchByName(deps.services, call.service);
  if (!service) {
    return { ok: false, error: "Unknown service. Use one of these exact names.", services: deps.services.map((s) => s.name) };
  }
  const state = withService({ step: "time", mode: "book" }, service, deps);
  const offering = doctorsFor(state, deps);
  if (ANY.test(call.stylist.trim())) {
    return { state: { ...state, doctorChoice: deps.doctors.length ? "any" : "none" }, stylist: null };
  }
  const stylist = matchByName(offering, call.stylist);
  if (!stylist) {
    return {
      ok: false,
      error: `No stylist by that name offers ${service.name}. Use one of these, or "any".`,
      stylists: offering.map((d) => d.name),
    };
  }
  return { state: { ...state, doctorChoice: stylist.id }, stylist };
}

const isResult = (r: Resolved | ToolResult): r is ToolResult => "ok" in r;

/** "HH:MM" of a slot in the business's zone. */
function localTime(slot: Slot, day: string, deps: BookingDeps): string {
  return hhmm(Math.round((slot.start.getTime() - zonedInstant(day, 0, deps.config.timezone).getTime()) / 60_000));
}

function stylistName(id: string | null, deps: BookingDeps): string | null {
  return id ? (deps.doctors.find((d) => d.id === id)?.name ?? null) : null;
}

/** Deps whose busy list ignores one appointment — the one being moved. */
function without(deps: BookingDeps, appointmentId: string): BookingDeps {
  if (!appointmentId) return deps;
  return { ...deps, busy: async (from, to) => (await deps.busy(from, to)).filter((b: Busy) => b.id !== appointmentId) };
}

export async function findTimes(deps: BookingDeps, call: ToolCall): Promise<ToolResult> {
  // While rescheduling, the booking being moved doesn't block its own new time.
  deps = without(deps, call.appointment);
  const r = resolve(deps, call);
  if (isResult(r)) return r;
  const open = candidateDays(deps.config, deps.now);
  if (open.length === 0) return { ok: false, error: "There are no open days to book in the booking window." };

  let days: string[];
  if (call.date) {
    if (!open.includes(call.date)) {
      return { ok: false, error: `${call.date} is closed or outside the booking window.`, openDays: open.slice(0, 7) };
    }
    days = [call.date];
  } else {
    days = open;
  }

  const byDay = await slotsByDay(r.state, deps, days);
  const out: { date: string; label: string; times: { time: string; stylist: string | null }[] }[] = [];
  for (const day of days) {
    const from = HHMM.test(call.after) ? call.after : "";
    const slots = (byDay.get(day) ?? []).filter((s) => !from || localTime(s, day, deps) >= from);
    if (slots.length === 0) continue;
    out.push({
      date: day,
      label: dayLabel(day, deps.config.timezone),
      times: slots.slice(0, MAX_TIMES_PER_DAY).map((s) => ({ time: localTime(s, day, deps), stylist: stylistName(s.doctorId, deps) })),
    });
    if (!call.date && out.length >= DAYS_WHEN_UNSPECIFIED) break;
  }
  if (out.length === 0) {
    return {
      ok: false,
      error: call.date
        ? `No free times on ${call.date}${HHMM.test(call.after) ? ` from ${call.after}` : ""}.`
        : "No free times in the booking window.",
      openDays: call.date ? open.filter((d) => d !== call.date).slice(0, 7) : [],
    };
  }
  return { ok: true, service: r.state.serviceName, stylist: r.stylist?.name ?? "any", days: out };
}

const START = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})$/;

export async function bookTime(deps: BookingDeps, call: ToolCall): Promise<ToolResult> {
  const r = resolve(deps, call);
  if (isResult(r)) return r;
  const m = START.exec(call.start.trim());
  if (!m) return { ok: false, error: 'start must be "YYYY-MM-DD HH:MM" from a find_times result.' };
  const [, day, time] = m;
  if (!candidateDays(deps.config, deps.now).includes(day)) {
    return { ok: false, error: `${day} is closed or outside the booking window.` };
  }

  const slots = (await slotsByDay(r.state, deps, [day])).get(day) ?? [];
  const wanted = zonedInstant(day, minutesOf(time), deps.config.timezone).getTime();
  const slot = slots.find((s) => s.start.getTime() === wanted);
  if (!slot) {
    return {
      ok: false,
      error: `${day} ${time} is not free. Offer one of these instead.`,
      freeTimes: slots.slice(0, MAX_TIMES_PER_DAY).map((s) => ({ time: localTime(s, day, deps), stylist: stylistName(s.doctorId, deps) })),
    };
  }

  const stylist = slot.doctorId ? deps.doctors.find((d) => d.id === slot.doctorId) : undefined;
  const result = await deps.book({
    serviceName: r.state.serviceName ?? deps.config.defaultService,
    doctorId: slot.doctorId,
    branchId: stylist?.branch_id ?? null,
    startsAt: slot.start,
    endsAt: slot.end,
    bufferMin: r.state.buffer ?? 0,
    notes: "Booked by the AI assistant on WhatsApp.",
  });
  if (result === "taken") return { ok: false, error: "Someone just took that time. Check free times again and offer others." };
  return {
    ok: true,
    booked: {
      service: r.state.serviceName,
      stylist: stylist?.name ?? null,
      date: dayLabel(day, deps.config.timezone),
      time: timeLabel(slot.start, deps.config.timezone),
    },
  };
}

// ------------------------------------------------------------ the customer's own bookings

/** How an own appointment is shown to the model (and so to the customer). */
function describeOwn(a: OwnAppointment, deps: BookingDeps) {
  const start = new Date(a.starts_at);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: deps.config.timezone }).format(start);
  return {
    id: a.id,
    service: a.service,
    stylist: stylistName(a.doctor_id, deps),
    date: dayLabel(day, deps.config.timezone),
    time: timeLabel(start, deps.config.timezone),
    status: a.status,
  };
}

const isUpcoming = (a: OwnAppointment, now: Date) => ACTIVE.has(a.status) && Date.parse(a.starts_at) > now.getTime();

const NOT_YOURS =
  "That is not one of this customer's upcoming appointments. Only use an id from the my_appointments result for this chat.";
const CHANGED = "That appointment changed meanwhile. Call my_appointments again.";

export async function myAppointments(deps: AiDeps): Promise<ToolResult> {
  if (!deps.own) return { ok: false, error: "Appointments can't be looked up right now. Hand the chat to staff." };
  const all = await deps.own.list();
  const upcoming = all.filter((a) => isUpcoming(a, deps.now)).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const past = all
    .filter((a) => !upcoming.includes(a))
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at))
    .slice(0, 5);
  return {
    ok: true,
    note: "Only this WhatsApp number's own appointments. status: scheduled/confirmed = booked, completed = attended, no_show = missed, cancelled = cancelled.",
    upcoming: upcoming.slice(0, 10).map((a) => describeOwn(a, deps)),
    past: past.map((a) => describeOwn(a, deps)),
  };
}

/** The sender's own upcoming appointment with this id, or null. */
async function ownUpcoming(deps: AiDeps, id: string): Promise<OwnAppointment | null> {
  if (!deps.own || !id.trim()) return null;
  const a = (await deps.own.list()).find((x) => x.id === id.trim());
  return a && isUpcoming(a, deps.now) ? a : null;
}

export async function cancelAppointment(deps: AiDeps, call: ToolCall): Promise<ToolResult> {
  const a = await ownUpcoming(deps, call.appointment);
  if (!a || !deps.own) return { ok: false, error: NOT_YOURS };
  if ((await deps.own.cancel(a.id)) !== "ok") return { ok: false, error: CHANGED };
  const d = describeOwn(a, deps);
  return { ok: true, cancelled: { service: d.service, stylist: d.stylist, date: d.date, time: d.time } };
}

export async function rescheduleAppointment(deps: AiDeps, call: ToolCall): Promise<ToolResult> {
  const a = await ownUpcoming(deps, call.appointment);
  if (!a || !deps.own) return { ok: false, error: NOT_YOURS };
  const free = without(deps, a.id);
  // Same service; the same stylist unless the customer asked for another.
  const r = resolve(free, {
    ...call,
    service: a.service ?? "",
    stylist: call.stylist.trim() || stylistName(a.doctor_id, deps) || "any",
  });
  if (isResult(r)) {
    return r.ok ? r : { ...r, error: `${r.error} (Rescheduling keeps the service; for another service, book a new appointment.)` };
  }
  const m = START.exec(call.start.trim());
  if (!m) return { ok: false, error: 'start must be "YYYY-MM-DD HH:MM" from a find_times result.' };
  const [, day, time] = m;
  if (!candidateDays(deps.config, deps.now).includes(day)) {
    return { ok: false, error: `${day} is closed or outside the booking window.` };
  }
  const slots = (await slotsByDay(r.state, free, [day])).get(day) ?? [];
  const wanted = zonedInstant(day, minutesOf(time), deps.config.timezone).getTime();
  const slot = slots.find((s) => s.start.getTime() === wanted);
  if (!slot) {
    return {
      ok: false,
      error: `${day} ${time} is not free. Offer one of these instead.`,
      freeTimes: slots.slice(0, MAX_TIMES_PER_DAY).map((s) => ({ time: localTime(s, day, deps), stylist: stylistName(s.doctorId, deps) })),
    };
  }
  const stylist = slot.doctorId ? deps.doctors.find((d) => d.id === slot.doctorId) : undefined;
  const moved = await deps.own.move(a.id, {
    startsAt: slot.start,
    endsAt: slot.end,
    doctorId: slot.doctorId,
    branchId: stylist?.branch_id ?? a.branch_id,
    bufferMin: r.state.buffer ?? 0,
  });
  if (moved === "taken") return { ok: false, error: "Someone just took that time. Check free times again and offer others." };
  if (moved === "gone") return { ok: false, error: CHANGED };
  const was = describeOwn(a, deps);
  return {
    ok: true,
    moved: {
      service: a.service,
      stylist: stylist?.name ?? null,
      date: dayLabel(day, deps.config.timezone),
      time: timeLabel(slot.start, deps.config.timezone),
      was: { date: was.date, time: was.time },
    },
  };
}

/** Run one tool call. Never throws: a failure is a result the model can explain. */
export async function runTool(deps: AiDeps, call: ToolCall): Promise<ToolResult> {
  try {
    switch (call.tool) {
      case "book":
        return await bookTime(deps, call);
      case "my_appointments":
        return await myAppointments(deps);
      case "cancel":
        return await cancelAppointment(deps, call);
      case "reschedule":
        return await rescheduleAppointment(deps, call);
      default:
        return await findTimes(deps, call);
    }
  } catch (err) {
    console.error(`[ai-chat] ${call.tool} failed:`, err);
    return { ok: false, error: "The booking system had a problem. Hand the chat to staff." };
  }
}
