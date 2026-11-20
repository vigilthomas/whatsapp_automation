// ============================================================
// Booking assistant settings — pure, unit-testable, no I/O.
//
// Stored as `booking_settings.enabled` + `booking_settings.config`
// (migration 053). Everything is parsed defensively and defaulted, so a
// half-filled or older document still gives a working bot.
//
// What a clinic can change:
//   - when it starts (trigger words) and how to stop (cancel words)
//   - opening hours, slot grid, booking window, notice
//   - which steps run and in what order (service, doctor, date & time,
//     name, questions), the Check availability option, the summary
//   - its own questions: free text, yes/no or a list of choices,
//     required or optional
//   - every message, button and list label the customer sees
// ============================================================

/** 0 = Sunday … 6 = Saturday (same as Date#getDay). */
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface DayHours {
  open: boolean;
  /** "HH:MM", 24-hour, clinic local time. */
  start: string;
  end: string;
}

// ------------------------------------------------------------ questions

export const QUESTION_TYPES = ["text", "yesno", "choice"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export interface BookingQuestion {
  id: string;
  text: string;
  type: QuestionType;
  /** Choices for `choice` (shown as a list). */
  options: string[];
  /** Optional questions get a Skip button / row. */
  required: boolean;
}

// ------------------------------------------------------------ steps

/** The steps a clinic can arrange. Date & time can't be switched off. */
export const STEP_IDS = ["service", "doctor", "datetime", "name", "questions"] as const;
export type StepId = (typeof STEP_IDS)[number];

export interface StepSetting {
  id: StepId;
  enabled: boolean;
}

/** Steps whose answers decide which times are free: they must come before date & time. */
export const BEFORE_DATETIME: readonly StepId[] = ["service", "doctor"];

// ------------------------------------------------------------ texts

/**
 * Every customer-facing text, with its default and the most WhatsApp
 * allows (buttons 20 characters, list rows 24, list button 20).
 * Placeholders in {braces} are filled in by the bot.
 */
export const TEXTS = {
  welcome: { default: "Hello! I can book an appointment for you or show you the free times. What would you like to do?", max: 1000 },
  btnBook: { default: "Book appointment", max: 20 },
  btnCheck: { default: "Check availability", max: 20 },

  askService: { default: "Which service would you like?", max: 1000 },
  listService: { default: "Choose service", max: 20 },
  serviceMinutes: { default: "{minutes} min", max: 72 },

  askDoctor: { default: "Which doctor would you like to see?", max: 1000 },
  listDoctor: { default: "Choose doctor", max: 20 },
  anyDoctor: { default: "Any available doctor", max: 24 },

  askDay: { default: "Which day suits you?", max: 1000 },
  listDay: { default: "Choose day", max: 20 },
  dayFreeCount: { default: "{count} free times", max: 72 },
  askTime: { default: "Free times on {date}:", max: 1000 },
  listTime: { default: "Choose time", max: 20 },
  laterTimes: { default: "Later times →", max: 24 },
  bufferNote: {
    default: "Each visit takes about {duration} min, and we keep {buffer} min free around it so we can get ready for you.",
    max: 500,
  },

  checked: { default: "Next free times for {service} with {doctor}:", max: 500 },
  btnBookTime: { default: "Book a time", max: 20 },
  btnDone: { default: "Done", max: 20 },
  done: { default: "Okay! Send BOOK any time to book an appointment.", max: 1000 },

  noTimes: { default: "Sorry, there are no free times for {service} in the next {days} days.", max: 1000 },
  btnChangeChoice: { default: "Change choice", max: 20 },
  dayFull: { default: "Sorry, that day has just filled up.", max: 1000 },
  timeTaken: { default: "Sorry, that time was just taken. Please pick another one.", max: 1000 },

  askName: { default: "What is the patient's full name?", max: 1000 },
  btnYes: { default: "Yes", max: 20 },
  btnNo: { default: "No", max: 20 },
  btnSkip: { default: "Skip", max: 20 },
  listChoose: { default: "Choose", max: 20 },

  summary: { default: "Please check your booking:", max: 500 },
  lblService: { default: "Service", max: 40 },
  lblDoctor: { default: "Doctor", max: 40 },
  lblWhen: { default: "When", max: 40 },
  lblPatient: { default: "Patient", max: 40 },
  btnConfirm: { default: "Confirm", max: 20 },
  btnChange: { default: "Change", max: 20 },
  btnCancel: { default: "Cancel", max: 20 },

  confirmed: {
    default:
      "Your appointment is booked ✅\n{service} with {doctor}\n{date} at {time}\n\nReply here if you need to change it and we'll help you.",
    max: 1000,
  },
  arriveEarly: { default: "Please arrive {early} min early so we can start on time.", max: 500 },
  cancelled: { default: "No problem — nothing was booked. Send BOOK any time to start again.", max: 1000 },
  pleaseChoose: { default: "Please choose one of the options below.", max: 500 },
  anyDoctorName: { default: "our doctor", max: 40 },
} as const;

export type TextKey = keyof typeof TEXTS;
export type BookingTexts = Record<TextKey, string>;
export const TEXT_KEYS = Object.keys(TEXTS) as TextKey[];

// ------------------------------------------------------------ config

export interface BookingConfig {
  /** A message containing one of these words starts the assistant. */
  keywords: string[];
  /** Typing one of these (the whole message) stops it. */
  cancelWords: string[];
  /** IANA zone the opening hours are in, e.g. "Asia/Kolkata". */
  timezone: string;
  hours: Record<Weekday, DayHours>;
  /** Gap between offered start times, in minutes. */
  slotMinutes: number;
  /** How many days ahead customers may book (today counts as day 1). */
  daysAhead: number;
  /** Earliest bookable time: this many minutes from now. */
  minNoticeMinutes: number;
  /** Offer "Check availability" next to "Book appointment" at the start. */
  offerCheck: boolean;
  /** Show the summary with Confirm / Change / Cancel before booking. */
  confirmStep: boolean;
  /** Order and on/off of the steps. */
  steps: StepSetting[];
  /** Service name used when the service step is off (or there are no services). */
  defaultService: string;
  /** The clinic's own questions; answers go into the appointment notes. */
  questions: BookingQuestion[];
  texts: BookingTexts;
  /**
   * Calendar days (yyyy-mm-dd) the clinic is shut — holidays and closed
   * dates from Settings → Clinic, filled in at run time by `withClinic`
   * (booking/clinic.ts). Never stored.
   */
  closedDays?: readonly string[];
}

export interface BookingSettings extends BookingConfig {
  enabled: boolean;
}

export const LIMITS = {
  keywords: 20,
  keywordLength: 40,
  questions: 10,
  questionLength: 300,
  /** Choice rows: WhatsApp lists hold 10, one may be Skip. */
  options: 10,
  optionLength: 24,
  slotMinutes: { min: 5, max: 240 },
  daysAhead: { min: 1, max: 60 },
  minNoticeMinutes: { min: 0, max: 7 * 24 * 60 },
} as const;

const weekday = (open: boolean): DayHours => ({ open, start: "09:00", end: "18:00" });

export const DEFAULT_TEXTS = Object.fromEntries(TEXT_KEYS.map((k) => [k, TEXTS[k].default])) as BookingTexts;

export const DEFAULT_STEPS: StepSetting[] = STEP_IDS.map((id) => ({ id, enabled: true }));

export const DEFAULT_CONFIG: BookingConfig = {
  keywords: ["book", "booking", "appointment"],
  cancelWords: ["cancel", "stop"],
  timezone: "Asia/Kolkata",
  hours: { 0: weekday(false), 1: weekday(true), 2: weekday(true), 3: weekday(true), 4: weekday(true), 5: weekday(true), 6: weekday(true) },
  slotMinutes: 30,
  daysAhead: 14,
  minNoticeMinutes: 60,
  offerCheck: true,
  confirmStep: true,
  steps: DEFAULT_STEPS,
  defaultService: "Consultation",
  questions: [],
  texts: DEFAULT_TEXTS,
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isTime(v: unknown): v is string {
  return typeof v === "string" && TIME.test(v);
}

/** Minutes since midnight for "HH:MM". */
export function minutesOf(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function isTimeZone(v: unknown): v is string {
  if (typeof v !== "string" || !v) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: v });
    return true;
  } catch {
    return false;
  }
}

function clampInt(v: unknown, { min, max }: { min: number; max: number }, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function text(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function words(v: unknown, fallback: string[]): string[] {
  if (!Array.isArray(v)) return fallback;
  const list = Array.from(new Set(v.map((k) => text(k, LIMITS.keywordLength).toLowerCase()).filter(Boolean)));
  return list.slice(0, LIMITS.keywords);
}

/**
 * Steps in a usable order: every known step exactly once, date & time
 * always on, and service / doctor never after date & time (the free
 * times depend on them).
 */
export function normaliseSteps(raw: unknown): StepSetting[] {
  const seen = new Set<StepId>();
  const out: StepSetting[] = [];
  if (Array.isArray(raw)) {
    for (const s of raw) {
      const o = s && typeof s === "object" ? (s as Record<string, unknown>) : {};
      const id = o.id as StepId;
      if (!STEP_IDS.includes(id) || seen.has(id)) continue;
      seen.add(id);
      out.push({ id, enabled: id === "datetime" ? true : o.enabled !== false });
    }
  }
  for (const s of DEFAULT_STEPS) if (!seen.has(s.id)) out.push({ ...s });
  const dt = out.findIndex((s) => s.id === "datetime");
  const late = out.filter((s, i) => i > dt && BEFORE_DATETIME.includes(s.id));
  if (late.length === 0) return out;
  const rest = out.filter((s) => !late.includes(s));
  const at = rest.findIndex((s) => s.id === "datetime");
  return [...rest.slice(0, at), ...late, ...rest.slice(at)];
}

function parseQuestions(raw: unknown): BookingQuestion[] {
  if (!Array.isArray(raw)) return [];
  const used = new Set<string>();
  return raw
    .map((q, i) => {
      const o = q && typeof q === "object" ? (q as Record<string, unknown>) : {};
      let id = typeof o.id === "string" && o.id ? o.id.slice(0, 40) : `q${i + 1}`;
      while (used.has(id)) id = `${id}_`;
      used.add(id);
      const type: QuestionType = QUESTION_TYPES.includes(o.type as QuestionType) ? (o.type as QuestionType) : "text";
      const required = o.required !== false;
      const options = Array.isArray(o.options)
        ? Array.from(new Set(o.options.map((x) => text(x, LIMITS.optionLength)).filter(Boolean))).slice(
            0,
            required ? LIMITS.options : LIMITS.options - 1,
          )
        : [];
      return { id, text: text(o.text, LIMITS.questionLength), type, options, required };
    })
    .filter((q) => q.text && (q.type !== "choice" || q.options.length > 0))
    .slice(0, LIMITS.questions);
}

function parseTexts(raw: unknown, legacy: unknown): BookingTexts {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  // Before texts existed, three messages lived under `messages`.
  const old = legacy && typeof legacy === "object" ? (legacy as Record<string, unknown>) : {};
  const out = { ...DEFAULT_TEXTS };
  for (const k of TEXT_KEYS) {
    const v = text(o[k], TEXTS[k].max) || text(old[k], TEXTS[k].max);
    if (v) out[k] = v;
  }
  return out;
}

/** Coerce whatever is stored into a complete, valid config. */
export function parseBookingConfig(raw: unknown): BookingConfig {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_CONFIG;

  const rawHours = o.hours && typeof o.hours === "object" ? (o.hours as Record<string, unknown>) : {};
  const hours = {} as Record<Weekday, DayHours>;
  for (const w of WEEKDAYS) {
    const h = rawHours[w] as Partial<DayHours> | undefined;
    const fallback = d.hours[w];
    const start = isTime(h?.start) ? h!.start! : fallback.start;
    const end = isTime(h?.end) ? h!.end! : fallback.end;
    const valid = minutesOf(end) > minutesOf(start);
    hours[w] = {
      open: typeof h?.open === "boolean" ? h.open && valid : fallback.open,
      start: valid ? start : fallback.start,
      end: valid ? end : fallback.end,
    };
  }

  const keywords = words(o.keywords, d.keywords);
  // Older configs had a top-level `askName` switch.
  const steps = normaliseSteps(
    o.steps ?? (o.askName === false ? DEFAULT_STEPS.map((s) => (s.id === "name" ? { ...s, enabled: false } : s)) : undefined),
  );

  return {
    keywords: keywords.length ? keywords : d.keywords,
    cancelWords: words(o.cancelWords, d.cancelWords),
    timezone: isTimeZone(o.timezone) ? (o.timezone as string) : d.timezone,
    hours,
    slotMinutes: clampInt(o.slotMinutes, LIMITS.slotMinutes, d.slotMinutes),
    daysAhead: clampInt(o.daysAhead, LIMITS.daysAhead, d.daysAhead),
    minNoticeMinutes: clampInt(o.minNoticeMinutes, LIMITS.minNoticeMinutes, d.minNoticeMinutes),
    offerCheck: typeof o.offerCheck === "boolean" ? o.offerCheck : d.offerCheck,
    confirmStep: typeof o.confirmStep === "boolean" ? o.confirmStep : d.confirmStep,
    steps,
    defaultService: text(o.defaultService, 80) || d.defaultService,
    questions: parseQuestions(o.questions),
    texts: parseTexts(o.texts, o.messages),
  };
}

/** Whether a customer's message should start the assistant. */
export function matchesKeyword(message: string, keywords: readonly string[]): boolean {
  const words = message.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return keywords.some((k) => {
    const parts = k.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    if (parts.length === 0) return false;
    for (let i = 0; i + parts.length <= words.length; i++) {
      if (parts.every((p, j) => words[i + j] === p)) return true;
    }
    return false;
  });
}

/** Fill {placeholders}; unknown ones are left as they are. */
export function fillTemplate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (all, key: string) => (key in values ? String(values[key]) : all));
}
