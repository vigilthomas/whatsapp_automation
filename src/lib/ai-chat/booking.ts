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
//   find_times { service, stylist?, date? }   → free times, by day
//   book       { service, stylist?, start, name? } → the appointment
//
// `start` is "YYYY-MM-DD HH:MM" in the business's own time zone. A book
// call for a time that isn't free fails with the free times that day, so
// the model can offer those instead.
// ============================================================

import { doctorsFor, slotsByDay, withService, type BookDoctor, type BookingDeps, type BookingState } from "@/lib/booking/engine";
import { hhmm } from "@/lib/booking/schedule";
import { minutesOf } from "@/lib/booking/settings";
import { candidateDays, dayLabel, timeLabel, zonedInstant, type Slot } from "@/lib/booking/slots";

export const TOOL_NAMES = ["find_times", "book"] as const;
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
}

/** What the model gets back, as JSON. */
export type ToolResult = { ok: true; [key: string]: unknown } | { ok: false; error: string; [key: string]: unknown };

/** Times listed per day; enough to choose from without flooding the prompt. */
const MAX_TIMES_PER_DAY = 12;
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

export async function findTimes(deps: BookingDeps, call: ToolCall): Promise<ToolResult> {
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
    const slots = byDay.get(day) ?? [];
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
      error: call.date ? `No free times on ${call.date}.` : "No free times in the booking window.",
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

/** Run one tool call. Never throws: a failure is a result the model can explain. */
export async function runTool(deps: BookingDeps, call: ToolCall): Promise<ToolResult> {
  try {
    return call.tool === "book" ? await bookTime(deps, call) : await findTimes(deps, call);
  } catch (err) {
    console.error(`[ai-chat] ${call.tool} failed:`, err);
    return { ok: false, error: "The booking system had a problem. Hand the chat to staff." };
  }
}
