// ============================================================
// Booking assistant conversation — the state machine.
//
// No database or WhatsApp calls here: everything the bot needs comes in
// through `BookingDeps`, and what it wants to say comes back as `Reply`
// values. That keeps it unit-testable, and lets the settings page run the
// very same conversation as a live preview in the browser.
//
// Shape (every part configurable in settings.ts):
//
//   [menu: Book / Check availability]          (offerCheck)
//   → the enabled steps in the clinic's order:
//       service · doctor · date & time · name · questions
//   → [summary: Confirm / Change / Cancel]      (confirmStep)
//   → booked
//
// "Check availability" runs only the steps the free times depend on
// (service, doctor), lists the next free times, and "Book a time" carries
// on with whatever is left. Every interactive id starts with "bk:" so the
// webhook can tell our taps from a Flow's.
// ============================================================

import { fillTemplate, minutesOf, type BookingConfig, type StepId } from "./settings";
import {
  addDays,
  candidateDays,
  dayLabel,
  freeSlots,
  timeLabel,
  weekdayOf,
  zonedInstant,
  type Busy,
  type Slot,
} from "./slots";

export type Reply =
  | { kind: "text"; text: string }
  | { kind: "buttons"; body: string; buttons: { id: string; title: string }[] }
  | { kind: "list"; body: string; button: string; rows: { id: string; title: string; description?: string }[] };

/** Which prompt the customer is answering. */
export type Prompt = "menu" | "service" | "doctor" | "day" | "time" | "checked" | "name" | "question" | "confirm";

export interface BookingState {
  step: Prompt;
  mode: "book" | "check";
  /** Steps already answered. */
  done?: StepId[];
  serviceId?: string | null;
  serviceName?: string;
  duration?: number;
  /** The service's buffer in minutes (half before, half after). */
  buffer?: number;
  /** A doctor id, "any", or "none" when the clinic has no doctors. */
  doctorChoice?: string;
  day?: string;
  page?: number;
  startsAt?: string;
  endsAt?: string;
  doctorId?: string | null;
  name?: string;
  q?: number;
  answers?: Record<string, string>;
  reprompts?: number;
}

export interface BookService {
  id: string;
  name: string;
  duration_min: number;
  buffer_min?: number;
}

export interface BookDoctor {
  id: string;
  name: string;
  branch_id: string | null;
}

export interface BookInput {
  serviceName: string;
  doctorId: string | null;
  branchId: string | null;
  startsAt: Date;
  endsAt: Date;
  bufferMin: number;
  notes: string | null;
}

export interface BookingDeps {
  config: BookingConfig;
  services: BookService[];
  doctors: BookDoctor[];
  /** Which doctor offers which service (Master → Doctor services). */
  doctorServices?: { doctor_id: string; service_id: string; duration_min?: number | null }[];
  /** Doctors on leave (Master → Leaves), inclusive YYYY-MM-DD ranges. */
  leaves?: {
    doctor_id: string;
    starts_on: string;
    ends_on: string;
    leave_type?: "full" | "half_am" | "half_pm" | "late";
    late_minutes?: number | null;
  }[];
  /** The contact's saved name, if any. */
  contactName: string | null;
  now: Date;
  /** Every doctor's not-cancelled appointments overlapping [from, to). */
  busy: (from: Date, to: Date) => Promise<Busy[]>;
  /** Create the appointment; "taken" when the time is no longer free. */
  book: (input: BookInput) => Promise<"ok" | "taken">;
}

export interface Inbound {
  text?: string;
  replyId?: string;
}

export interface StepResult {
  /** null = the conversation is over (booked, cancelled, or given up). */
  state: BookingState | null;
  replies: Reply[];
  /** Save this as the contact's name. */
  saveName?: string;
}

const MAX_REPROMPTS = 3;
const LIST_ROWS = 10;
const YES_WORDS = /^(yes|y|ok|okay|confirm|confirmed|sure)$/i;
const SKIP_WORDS = /^(skip|-|no answer|none)$/i;

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const T = (deps: BookingDeps) => deps.config.texts;

// ------------------------------------------------------------ sequencing

function enabledSteps(deps: BookingDeps): StepId[] {
  return deps.config.steps.filter((s) => s.enabled).map((s) => s.id);
}

const finish = (state: BookingState, id: StepId): BookingState => ({
  ...state,
  done: [...new Set([...(state.done ?? []), id])],
});

/** Fill in what a switched-off step would have asked. */
function withDefaults(state: BookingState, deps: BookingDeps): BookingState {
  const on = enabledSteps(deps);
  let next = state;
  if (!on.includes("service") && !next.serviceName) {
    next = { ...next, serviceId: null, serviceName: deps.config.defaultService, duration: deps.config.slotMinutes, buffer: 0 };
  }
  if (!on.includes("doctor") && !next.doctorChoice) {
    next = { ...next, doctorChoice: doctorsFor(next, deps).length ? "any" : "none" };
  }
  return next;
}

/** Ask whatever comes next. */
async function advance(state: BookingState, deps: BookingDeps): Promise<StepResult> {
  const s = withDefaults(state, deps);
  for (const id of enabledSteps(deps)) {
    if (s.done?.includes(id)) continue;
    if (s.mode === "check") {
      if (id === "datetime") return toChecked(s, deps);
      if (!["service", "doctor"].includes(id)) continue;
    }
    switch (id) {
      case "service":
        return toService(s, deps);
      case "doctor":
        return toDoctor(s, deps);
      case "datetime":
        return toDay(s, deps);
      case "name":
        return toName(s, deps);
      case "questions":
        return toQuestion(s, deps);
    }
  }
  return deps.config.confirmStep ? toConfirm(s, deps) : confirm(s, deps);
}

// ------------------------------------------------------------ prompts

function menu(deps: BookingDeps): Reply {
  return {
    kind: "buttons",
    body: T(deps).welcome,
    buttons: [
      { id: "bk:book", title: T(deps).btnBook },
      { id: "bk:check", title: T(deps).btnCheck },
    ],
  };
}

async function toService(state: BookingState, deps: BookingDeps): Promise<StepResult> {
  if (deps.services.length <= 1) {
    const s = deps.services[0];
    return advance(finish(withService(state, s, deps), "service"), deps);
  }
  return {
    state: { ...state, step: "service" },
    replies: [
      {
        kind: "list",
        body: T(deps).askService,
        button: T(deps).listService,
        rows: deps.services.slice(0, LIST_ROWS).map((s) => ({
          id: `bk:svc:${s.id}`,
          title: cut(s.name, 24),
          description: fillTemplate(T(deps).serviceMinutes, { minutes: s.duration_min }),
        })),
      },
    ],
  };
}

async function toDoctor(state: BookingState, deps: BookingDeps): Promise<StepResult> {
  const doctors = doctorsFor(state, deps);
  if (doctors.length <= 1) {
    return advance(finish({ ...state, doctorChoice: doctors[0]?.id ?? "none" }, "doctor"), deps);
  }
  return {
    state: { ...state, step: "doctor" },
    replies: [
      {
        kind: "list",
        body: T(deps).askDoctor,
        button: T(deps).listDoctor,
        rows: [
          { id: "bk:doc:any", title: T(deps).anyDoctor },
          ...doctors.slice(0, LIST_ROWS - 1).map((d) => ({ id: `bk:doc:${d.id}`, title: cut(d.name, 24) })),
        ],
      },
    ],
  };
}

/** The service the customer picked, with its length and buffer. */
function withService(state: BookingState, s: BookService | undefined, deps: BookingDeps): BookingState {
  return {
    ...state,
    serviceId: s?.id ?? null,
    serviceName: s?.name ?? deps.config.defaultService,
    duration: s?.duration_min ?? deps.config.slotMinutes,
    buffer: s?.buffer_min ?? 0,
  };
}

/**
 * Doctors who offer the chosen service. A service nobody is linked to in
 * Doctor services can be booked with any doctor.
 */
function doctorsFor(state: BookingState, deps: BookingDeps): BookDoctor[] {
  const links = (deps.doctorServices ?? []).filter((l) => l.service_id === state.serviceId);
  if (!state.serviceId || links.length === 0) return deps.doctors;
  const ids = new Set(links.map((l) => l.doctor_id));
  return deps.doctors.filter((d) => ids.has(d.id));
}

/** How long the chosen service takes with this doctor: their own time, else the service's. */
function minutesWith(state: BookingState, deps: BookingDeps, doctorId: string | null): number {
  const base = state.duration ?? deps.config.slotMinutes;
  if (!doctorId || !state.serviceId) return base;
  const own = (deps.doctorServices ?? []).find((l) => l.doctor_id === doctorId && l.service_id === state.serviceId)?.duration_min;
  return own && own > 0 ? own : base;
}

function doctorIdsFor(state: BookingState, deps: BookingDeps): string[] {
  if (state.doctorChoice === "none") return [];
  if (state.doctorChoice === "any" || !state.doctorChoice) return doctorsFor(state, deps).map((d) => d.id);
  return [state.doctorChoice];
}

/**
 * When doctors are out on a calendar day, in minutes from midnight: a full
 * day, the first or second half of opening hours, or the first
 * `late_minutes` after opening.
 */
function awayOn(day: string, deps: BookingDeps): { doctorId: string; start: number; end: number }[] {
  const hours = deps.config.hours[weekdayOf(day)];
  const open = minutesOf(hours.start);
  const close = minutesOf(hours.end);
  const mid = Math.round((open + close) / 2);
  return (deps.leaves ?? [])
    .filter((l) => l.starts_on <= day && day <= l.ends_on)
    .map((l) => {
      switch (l.leave_type ?? "full") {
        case "half_am":
          return { doctorId: l.doctor_id, start: 0, end: mid };
        case "half_pm":
          return { doctorId: l.doctor_id, start: mid, end: 24 * 60 };
        case "late":
          return { doctorId: l.doctor_id, start: 0, end: open + (l.late_minutes ?? 0) };
        default:
          return { doctorId: l.doctor_id, start: 0, end: 24 * 60 };
      }
    });
}

/** Free slots per open day over the booking window (one busy query). */
async function slotsByDay(state: BookingState, deps: BookingDeps, days: string[]): Promise<Map<string, Slot[]>> {
  const out = new Map<string, Slot[]>();
  if (days.length === 0) return out;
  const tz = deps.config.timezone;
  const from = zonedInstant(days[0], 0, tz);
  const to = zonedInstant(addDays(days[days.length - 1], 1), 0, tz);
  const doctorIds = doctorIdsFor(state, deps);
  const busy = doctorIds.length ? await deps.busy(from, to) : [];
  for (const day of days) {
    out.set(
      day,
      freeSlots({
        config: deps.config,
        day,
        durationMin: state.duration ?? deps.config.slotMinutes,
        durationFor: Object.fromEntries(doctorIds.map((id) => [id, minutesWith(state, deps, id)])),
        bufferMin: state.buffer ?? 0,
        doctorIds,
        away: awayOn(day, deps),
        busy,
        now: deps.now,
      }),
    );
  }
  return out;
}

function noTimes(state: BookingState, deps: BookingDeps): StepResult {
  return {
    state: { ...state, step: "checked" },
    replies: [
      {
        kind: "buttons",
        body: fillTemplate(T(deps).noTimes, { service: state.serviceName ?? "", days: deps.config.daysAhead }),
        buttons: [
          { id: "bk:change", title: T(deps).btnChangeChoice },
          { id: "bk:done", title: T(deps).btnDone },
        ],
      },
    ],
  };
}

async function toDay(state: BookingState, deps: BookingDeps): Promise<StepResult> {
  const slots = await slotsByDay(state, deps, candidateDays(deps.config, deps.now));
  const days = [...slots].filter(([, s]) => s.length > 0).slice(0, LIST_ROWS);
  if (days.length === 0) return noTimes(state, deps);
  return {
    state: { ...state, mode: "book", step: "day" },
    replies: [
      {
        kind: "list",
        body: T(deps).askDay,
        button: T(deps).listDay,
        rows: days.map(([day, s]) => ({
          id: `bk:day:${day}`,
          title: dayLabel(day, deps.config.timezone),
          description: fillTemplate(T(deps).dayFreeCount, { count: s.length }),
        })),
      },
    ],
  };
}

async function toTime(state: BookingState, deps: BookingDeps): Promise<StepResult> {
  const day = state.day!;
  const slots = (await slotsByDay(state, deps, [day])).get(day) ?? [];
  if (slots.length === 0) {
    const days = await toDay(state, deps);
    return { ...days, replies: [{ kind: "text", text: T(deps).dayFull }, ...days.replies] };
  }
  const page = state.page ?? 0;
  const start = Math.min(page * (LIST_ROWS - 1), Math.max(0, slots.length - 1));
  const rest = slots.slice(start);
  const more = rest.length > LIST_ROWS;
  const shown = more ? rest.slice(0, LIST_ROWS - 1) : rest;
  const tz = deps.config.timezone;
  return {
    state: { ...state, step: "time", page },
    replies: [
      {
        kind: "list",
        body: [fillTemplate(T(deps).askTime, { date: dayLabel(day, tz) }), bufferNote(state, deps, "bufferNote")]
          .filter(Boolean)
          .join("\n\n"),
        button: T(deps).listTime,
        rows: [
          ...shown.map((s) => ({
            id: `bk:time:${s.start.getTime()}:${s.doctorId ?? "none"}`,
            title: timeLabel(s.start, tz),
          })),
          ...(more ? [{ id: "bk:more", title: T(deps).laterTimes }] : []),
        ],
      },
    ],
  };
}

async function toChecked(state: BookingState, deps: BookingDeps): Promise<StepResult> {
  const slots = await slotsByDay(state, deps, candidateDays(deps.config, deps.now));
  const days = [...slots].filter(([, s]) => s.length > 0).slice(0, 3);
  if (days.length === 0) return noTimes(state, deps);
  const tz = deps.config.timezone;
  const lines = days.map(([day, s]) => {
    const times = s.slice(0, 8).map((x) => timeLabel(x.start, tz));
    return `*${dayLabel(day, tz)}*: ${times.join(", ")}${s.length > 8 ? ` +${s.length - 8}` : ""}`;
  });
  const intro = fillTemplate(T(deps).checked, {
    service: state.serviceName ?? "",
    doctor: doctorName(state.doctorChoice, deps) ?? T(deps).anyDoctorName,
  });
  return {
    state: { ...state, step: "checked" },
    replies: [
      {
        kind: "buttons",
        body: `${intro}\n\n${lines.join("\n")}`,
        buttons: [
          { id: "bk:book", title: T(deps).btnBookTime },
          { id: "bk:done", title: T(deps).btnDone },
        ],
      },
    ],
  };
}

function doctorName(id: string | null | undefined, deps: BookingDeps): string | null {
  if (!id || id === "none") return null;
  if (id === "any") return T(deps).anyDoctor;
  return deps.doctors.find((d) => d.id === id)?.name ?? null;
}

async function toName(state: BookingState, deps: BookingDeps): Promise<StepResult> {
  if (deps.contactName || state.name) return advance(finish(state, "name"), deps);
  return { state: { ...state, step: "name" }, replies: [{ kind: "text", text: T(deps).askName }] };
}

async function toQuestion(state: BookingState, deps: BookingDeps): Promise<StepResult> {
  const q = state.q ?? 0;
  const question = deps.config.questions[q];
  if (!question) return advance(finish(state, "questions"), deps);
  const next: BookingState = { ...state, step: "question", q };
  const skip = question.required ? [] : [{ id: "bk:qa:skip", title: T(deps).btnSkip }];
  if (question.type === "yesno") {
    return {
      state: next,
      replies: [
        {
          kind: "buttons",
          body: question.text,
          buttons: [{ id: "bk:qa:yes", title: T(deps).btnYes }, { id: "bk:qa:no", title: T(deps).btnNo }, ...skip],
        },
      ],
    };
  }
  if (question.type === "choice") {
    return {
      state: next,
      replies: [
        {
          kind: "list",
          body: question.text,
          button: T(deps).listChoose,
          rows: [
            ...question.options.slice(0, LIST_ROWS - skip.length).map((o, i) => ({ id: `bk:qa:${i}`, title: cut(o, 24) })),
            ...skip,
          ],
        },
      ],
    };
  }
  return {
    state: next,
    replies: [
      question.required
        ? { kind: "text", text: question.text }
        : { kind: "buttons", body: question.text, buttons: skip },
    ],
  };
}

/** The buffer sentence for times / confirmations; empty when the service has none. */
function bufferNote(state: BookingState, deps: BookingDeps, key: "bufferNote" | "arriveEarly"): string {
  const buffer = state.buffer ?? 0;
  if (buffer <= 0) return "";
  return fillTemplate(T(deps)[key], {
    duration: state.duration ?? deps.config.slotMinutes,
    buffer,
    early: Math.max(1, Math.round(buffer / 2)),
  });
}

function when(state: BookingState, deps: BookingDeps) {
  const tz = deps.config.timezone;
  const start = new Date(state.startsAt!);
  return { date: dayLabel(state.day!, tz), time: timeLabel(start, tz) };
}

function toConfirm(state: BookingState, deps: BookingDeps): StepResult {
  const t = T(deps);
  const { date, time } = when(state, deps);
  const doctor = doctorName(state.doctorId ?? undefined, deps);
  const name = state.name ?? deps.contactName;
  const lines = [
    `• ${t.lblService}: ${state.serviceName}`,
    ...(doctor ? [`• ${t.lblDoctor}: ${doctor}`] : []),
    `• ${t.lblWhen}: ${date}, ${time}`,
    ...(name ? [`• ${t.lblPatient}: ${name}`] : []),
  ];
  return {
    state: { ...state, step: "confirm" },
    replies: [
      {
        kind: "buttons",
        body: `${t.summary}\n\n${lines.join("\n")}`,
        buttons: [
          { id: "bk:yes", title: t.btnConfirm },
          { id: "bk:change", title: t.btnChange },
          { id: "bk:no", title: t.btnCancel },
        ],
      },
    ],
  };
}

function notesOf(state: BookingState, deps: BookingDeps): string | null {
  const answers = deps.config.questions
    .filter((q) => state.answers?.[q.id])
    .map((q) => `${q.text}\n→ ${state.answers![q.id]}`);
  return ["Booked by the customer on WhatsApp.", ...answers].join("\n\n");
}

async function confirm(state: BookingState, deps: BookingDeps): Promise<StepResult> {
  const doctor = state.doctorId ? deps.doctors.find((d) => d.id === state.doctorId) : undefined;
  const result = await deps.book({
    serviceName: state.serviceName ?? deps.config.defaultService,
    doctorId: state.doctorId ?? null,
    branchId: doctor?.branch_id ?? null,
    startsAt: new Date(state.startsAt!),
    endsAt: new Date(state.endsAt!),
    bufferMin: state.buffer ?? 0,
    notes: notesOf(state, deps),
  });
  if (result === "taken") {
    const back: BookingState = {
      ...state,
      done: (state.done ?? []).filter((d) => d !== "datetime"),
      page: 0,
      startsAt: undefined,
      endsAt: undefined,
    };
    const again = await toTime(back, deps);
    return { ...again, replies: [{ kind: "text", text: T(deps).timeTaken }, ...again.replies] };
  }
  const { date, time } = when(state, deps);
  return {
    state: null,
    replies: [
      {
        kind: "text",
        text: [
          fillTemplate(T(deps).confirmed, {
            service: state.serviceName ?? "",
            doctor: doctor?.name ?? T(deps).anyDoctorName,
            date,
            time,
            name: state.name ?? deps.contactName ?? "",
          }),
          bufferNote(state, deps, "arriveEarly"),
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  };
}

// ------------------------------------------------------------ input

async function reprompt(state: BookingState, again: StepResult | Promise<StepResult>, deps: BookingDeps): Promise<StepResult> {
  const n = (state.reprompts ?? 0) + 1;
  if (n > MAX_REPROMPTS) return { state: null, replies: [{ kind: "text", text: T(deps).cancelled }] };
  const r = await again;
  return {
    state: r.state ? { ...r.state, reprompts: n } : null,
    replies: [{ kind: "text", text: T(deps).pleaseChoose }, ...r.replies],
  };
}

/** Re-show the current prompt (for a reprompt). */
function current(state: BookingState, deps: BookingDeps): Promise<StepResult> | StepResult {
  switch (state.step) {
    case "menu":
      return { state, replies: [menu(deps)] };
    case "service":
      return toService(state, deps);
    case "doctor":
      return toDoctor(state, deps);
    case "day":
      return toDay(state, deps);
    case "time":
      return toTime(state, deps);
    case "checked":
      return toChecked(state, deps);
    case "name":
      return toName(state, deps);
    case "question":
      return toQuestion(state, deps);
    case "confirm":
      return toConfirm(state, deps);
  }
}

/** Match a typed answer against option names (exact, then contains). */
function byName<T extends { name: string }>(items: T[], text: string): T | undefined {
  const t = text.trim().toLowerCase();
  if (!t) return undefined;
  return items.find((i) => i.name.toLowerCase() === t) ?? items.find((i) => i.name.toLowerCase().includes(t));
}

/** Start a new conversation. */
export async function startBooking(deps: BookingDeps): Promise<StepResult> {
  if (deps.config.offerCheck) return { state: { step: "menu", mode: "book" }, replies: [menu(deps)] };
  const first = await advance({ step: "menu", mode: "book" }, deps);
  return { ...first, replies: [{ kind: "text", text: T(deps).welcome }, ...first.replies] };
}

/** Handle one customer message in an ongoing conversation. */
export async function continueBooking(state: BookingState, input: Inbound, deps: BookingDeps): Promise<StepResult> {
  const id = input.replyId ?? "";
  const text = (input.text ?? "").trim();
  const ok = (r: StepResult): StepResult => (r.state ? { ...r, state: { ...r.state, reprompts: 0 } } : r);
  const cancelWords = deps.config.cancelWords;

  if (id === "bk:no" || (!id && cancelWords.includes(text.toLowerCase()))) {
    return { state: null, replies: [{ kind: "text", text: T(deps).cancelled }] };
  }
  if (id === "bk:done") return { state: null, replies: [{ kind: "text", text: T(deps).done }] };
  if (id === "bk:change") {
    const keep = (state.done ?? []).filter((d) => d === "name" || d === "questions");
    return ok(
      await advance(
        { step: "menu", mode: "book", done: keep, name: state.name, answers: state.answers, q: state.q },
        deps,
      ),
    );
  }

  switch (state.step) {
    case "menu": {
      if (id === "bk:book" || (!id && /book/i.test(text))) return ok(await advance({ ...state, mode: "book" }, deps));
      if (id === "bk:check" || (!id && /check|availab|free|slot/i.test(text))) {
        return ok(await advance({ ...state, mode: "check" }, deps));
      }
      return reprompt(state, current(state, deps), deps);
    }
    case "service": {
      const svc = id.startsWith("bk:svc:") ? deps.services.find((s) => s.id === id.slice(7)) : byName(deps.services, text);
      if (!svc) return reprompt(state, current(state, deps), deps);
      return ok(await advance(finish(withService(state, svc, deps), "service"), deps));
    }
    case "doctor": {
      let choice: string | undefined;
      if (id === "bk:doc:any" || /^any/i.test(text)) choice = "any";
      else if (id.startsWith("bk:doc:")) choice = doctorsFor(state, deps).find((d) => d.id === id.slice(7))?.id;
      else choice = byName(doctorsFor(state, deps), text.replace(/^dr\.?\s*/i, ""))?.id;
      if (!choice) return reprompt(state, current(state, deps), deps);
      return ok(await advance(finish({ ...state, doctorChoice: choice }, "doctor"), deps));
    }
    case "checked": {
      if (id === "bk:book" || /book/i.test(text)) return ok(await advance({ ...state, mode: "book" }, deps));
      return reprompt(state, current(state, deps), deps);
    }
    case "day": {
      const day = id.startsWith("bk:day:") ? id.slice(7) : "";
      if (!candidateDays(deps.config, deps.now).includes(day)) return reprompt(state, current(state, deps), deps);
      return ok(await toTime({ ...state, day, page: 0 }, deps));
    }
    case "time": {
      if (id === "bk:more") return ok(await toTime({ ...state, page: (state.page ?? 0) + 1 }, deps));
      const m = /^bk:time:(\d+):(.+)$/.exec(id);
      if (!m) return reprompt(state, current(state, deps), deps);
      const start = new Date(Number(m[1]));
      const doctorId = m[2] === "none" ? null : m[2];
      if (doctorId && !doctorIdsFor(state, deps).includes(doctorId)) return reprompt(state, current(state, deps), deps);
      const minutes = minutesWith(state, deps, doctorId);
      const end = new Date(start.getTime() + minutes * 60_000);
      return ok(
        await advance(
          finish({ ...state, duration: minutes, startsAt: start.toISOString(), endsAt: end.toISOString(), doctorId }, "datetime"),
          deps,
        ),
      );
    }
    case "name": {
      const name = text.replace(/\s+/g, " ").slice(0, 100);
      if (name.length < 2) return reprompt(state, current(state, deps), deps);
      return { ...ok(await advance(finish({ ...state, name }, "name"), deps)), saveName: name };
    }
    case "question": {
      const q = state.q ?? 0;
      const question = deps.config.questions[q];
      if (!question) return ok(await advance(finish(state, "questions"), deps));
      let answer: string | null | undefined;
      if (!question.required && (id === "bk:qa:skip" || (!id && SKIP_WORDS.test(text)))) answer = null;
      else if (question.type === "yesno") {
        if (id === "bk:qa:yes" || (!id && /^(yes|y)$/i.test(text))) answer = T(deps).btnYes;
        else if (id === "bk:qa:no" || (!id && /^(no|n)$/i.test(text))) answer = T(deps).btnNo;
      } else if (question.type === "choice") {
        const m = /^bk:qa:(\d+)$/.exec(id);
        answer = m
          ? question.options[Number(m[1])]
          : question.options.find((o) => o.toLowerCase() === text.toLowerCase());
      } else if (text && !id) {
        answer = text.slice(0, 1000);
      }
      if (answer === undefined) return reprompt(state, current(state, deps), deps);
      const answers = answer === null ? state.answers : { ...(state.answers ?? {}), [question.id]: answer };
      return ok(await advance({ ...state, answers, q: q + 1 }, deps));
    }
    case "confirm": {
      if (id === "bk:yes" || (!id && YES_WORDS.test(text))) return confirm(state, deps);
      return reprompt(state, current(state, deps), deps);
    }
  }
}
