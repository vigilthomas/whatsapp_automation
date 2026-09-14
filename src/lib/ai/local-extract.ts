// ============================================================
// Local intent / entity extraction (pre-parser for the primary model).
//
// Second use of the local Ollama tier (see `basic-reply.ts` for the
// first). For messages that are NOT small talk, we ask the small local
// model one narrow question — "what is the patient asking for?" — with
// `format: "json"` and temperature 0, and get back a strict record:
//
//   { intent, patient_name, phone, doctor_name, specialization,
//     appointment_date, appointment_time, reason }
//
// That record is NOT acted on directly. It is injected into the
// primary (tool-calling) model's system prompt as a *hint*, so
// DeepSeek starts with "book_appointment, 2026-09-15, 10:30, Dr.
// Anjali Nair, tooth pain" already resolved instead of spending its
// (slow) reasoning budget re-deriving "tomorrow". The primary model
// still owns availability checks, confirmation and tool execution —
// the local parser can be wrong and the prompt says so.
//
// Relative dates ("tomorrow", "next Monday") are resolved by the model
// against a "current date" we put in the prompt, computed in the
// clinic's timezone — otherwise a 23:30 IST message on a UTC server
// would get yesterday's "today".
//
// Everything is validated after parsing: unknown intents become
// "other", dates must be YYYY-MM-DD, and any failure (Ollama down,
// bad JSON, timeout) returns null so the caller just proceeds without
// the hint. Enable with AI_LOCAL_EXTRACTION=true.
// ============================================================

import type { ChatMessage } from './types'
import { generateOllama, ollamaModel } from './providers/ollama'

export function localExtractionEnabled(): boolean {
  return process.env.AI_LOCAL_EXTRACTION === 'true'
}

function extractTimeoutMs(): number {
  const raw = Number(process.env.OLLAMA_TIMEOUT_MS)
  return Number.isFinite(raw) && raw > 0 ? raw : 8_000
}

/** Timezone used to resolve "today"/"tomorrow". Override with AI_TIMEZONE. */
export function clinicTimezone(): string {
  return process.env.AI_TIMEZONE?.trim() || 'Asia/Kolkata'
}

export const APPOINTMENT_INTENTS = [
  'book_appointment',
  'cancel_appointment',
  'reschedule_appointment',
  'check_availability',
  'other',
] as const
export type AppointmentIntent = (typeof APPOINTMENT_INTENTS)[number]

export interface ExtractedAppointment {
  intent: AppointmentIntent
  patient_name: string | null
  phone: string | null
  doctor_name: string | null
  specialization: string | null
  /** YYYY-MM-DD, already resolved from relative phrases. */
  appointment_date: string | null
  /** Free-form as the patient said it ("10:30 AM", "afternoon"). */
  appointment_time: string | null
  reason: string | null
}

const EMPTY_SCHEMA: ExtractedAppointment = {
  intent: 'other',
  patient_name: null,
  phone: null,
  doctor_name: null,
  specialization: null,
  appointment_date: null,
  appointment_time: null,
  reason: null,
}

/** Today's date as YYYY-MM-DD plus weekday, in the clinic timezone. */
export function todayInTimezone(tz: string, now: Date = new Date()): { date: string; weekday: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(now)
  return { date: `${get('year')}-${get('month')}-${get('day')}`, weekday }
}

/**
 * The extraction prompt. Kept as one function so the live smoke test
 * and production use the identical text.
 */
export function buildExtractionPrompt(today: { date: string; weekday: string }): string {
  // Small models are bad at day arithmetic ("next Tuesday" came back
  // off by one in testing), so instead of asking the model to count
  // we hand it a lookup table of the next two weeks and tell it to
  // copy from that.
  const calendar: string[] = []
  const base = new Date(`${today.date}T00:00:00Z`)
  for (let i = 0; i <= 14; i++) {
    const d = new Date(base)
    d.setUTCDate(base.getUTCDate() + i)
    const iso = d.toISOString().slice(0, 10)
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long' }).format(d)
    const label = i === 0 ? 'today' : i === 1 ? 'tomorrow' : i === 2 ? 'day after tomorrow' : `in ${i} days`
    calendar.push(`${weekday} ${iso} (${label})`)
  }

  return [
    'Extract appointment information from the patient message. Return ONLY valid JSON.',
    `The current date is ${today.date} (${today.weekday}).`,
    'Calendar of upcoming dates: ' + calendar.join('; ') + '.',
    'Convert relative dates such as tomorrow, day after tomorrow, Friday, next Monday into an exact date by copying the matching date from the calendar above. Do not calculate dates yourself.',
    'A bare weekday name ("Friday") means the first such day after today. "Next <weekday>" also means the first such day after today.',
    'Return dates ONLY in YYYY-MM-DD format. Never invent information; use null for anything not stated.',
    'intent must be one of: book_appointment, cancel_appointment, reschedule_appointment, check_availability, other.',
    'If the user wants to book or schedule an appointment, use book_appointment.',
    'If the user wants to move or change an existing appointment, use reschedule_appointment.',
    'If the user asks whether a slot, day or doctor is free, use check_availability.',
    'If a medical specialty is mentioned directly or indirectly, extract it into specialization.',
    'Examples: dentist → Dentist, heart doctor → Cardiologist, skin doctor → Dermatologist, child doctor → Pediatrician, eye doctor → Ophthalmologist.',
    "Never infer a specialty from the doctor's name.",
    'Use exactly this schema: ' + JSON.stringify(Object.fromEntries(Object.keys(EMPTY_SCHEMA).map((k) => [k, null]))),
  ].join(' ')
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function addDaysIso(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * Deterministically resolve a relative date phrase in the patient's
 * message. Code is authoritative here: in live testing every small
 * model got "Friday" / "next Tuesday" wrong at least some of the time,
 * so we only let the model's date through when the message contains
 * no phrase we recognise (absolute dates like "15th September").
 *
 * Policy: a bare weekday, "this <weekday>" and "next <weekday>" all
 * mean the FIRST such day strictly after today. ("next Tuesday" said
 * on a Monday is ambiguous in English; we pick the nearest one, which
 * is what a receptionist would confirm anyway.)
 */
export function resolveRelativeDate(text: string, todayIso: string): string | null {
  const t = text.toLowerCase()
  if (/\bday after tomorrow\b/.test(t)) return addDaysIso(todayIso, 2)
  if (/\btomorrow\b/.test(t)) return addDaysIso(todayIso, 1)
  if (/\btoday\b|\btonight\b/.test(t)) return todayIso

  const m = /\b(?:(?:next|this|on|coming)\s+)?(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/.exec(t)
  if (m) {
    const target = WEEKDAYS.findIndex((w) => w.startsWith(m[1]))
    const todayDow = new Date(`${todayIso}T00:00:00Z`).getUTCDay()
    const diff = (target - todayDow + 7) % 7 || 7
    return addDaysIso(todayIso, diff)
  }
  return null
}

function str(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t && t.toLowerCase() !== 'null' ? t : null
}

/**
 * Coerce whatever the model returned into a well-formed record.
 * Exported for tests. Returns null only when the input isn't an
 * object at all — partial/garbage fields degrade to null individually.
 */
export function normaliseExtraction(raw: unknown): ExtractedAppointment | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>

  const intentRaw = str(r.intent)?.toLowerCase().replace(/[\s-]+/g, '_') ?? 'other'
  const intent = (APPOINTMENT_INTENTS as readonly string[]).includes(intentRaw)
    ? (intentRaw as AppointmentIntent)
    : 'other'

  const date = str(r.appointment_date)
  const phone = str(r.phone)?.replace(/[^\d+]/g, '') || null

  return {
    intent,
    patient_name: str(r.patient_name),
    phone,
    doctor_name: str(r.doctor_name),
    specialization: str(r.specialization),
    appointment_date: date && DATE_RE.test(date) ? date : null,
    appointment_time: str(r.appointment_time),
    reason: str(r.reason),
  }
}

/** Strip ```json fences some models add even with format:"json". */
function parseJsonLoose(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start === -1 || end <= start) return null
    try {
      return JSON.parse(cleaned.slice(start, end + 1))
    } catch {
      return null
    }
  }
}

/**
 * Run extraction on the latest patient message. Never throws.
 */
export async function extractAppointmentIntent(
  messages: ChatMessage[],
  opts: { now?: Date } = {},
): Promise<ExtractedAppointment | null> {
  if (!localExtractionEnabled()) return null

  const lastUser = [...messages].reverse().find((m) => m.role === 'user')
  if (!lastUser?.content.trim()) return null

  const today = todayInTimezone(clinicTimezone(), opts.now)
  const model = ollamaModel()

  try {
    const t0 = Date.now()
    const { text } = await generateOllama({
      apiKey: '',
      model,
      systemPrompt: buildExtractionPrompt(today),
      // Only the latest turn: prior context confuses a 2B extractor
      // more than it helps, and the primary model has the full thread.
      messages: [{ role: 'user', content: lastUser.content }],
      timeoutMs: extractTimeoutMs(),
      format: 'json',
      temperature: 0,
      numPredict: 150,
    })
    const parsed = normaliseExtraction(parseJsonLoose(text))
    // Code wins over the model for relative dates (see resolveRelativeDate).
    const resolved = resolveRelativeDate(lastUser.content, today.date)
    if (parsed && resolved) parsed.appointment_date = resolved
    console.log(
      `[local-extract] ${model} in ${Date.now() - t0}ms:`,
      parsed ? JSON.stringify(parsed) : `unparseable: ${text.slice(0, 80)}`,
    )
    return parsed
  } catch (err) {
    console.warn(
      '[local-extract] failed, continuing without hint:',
      err instanceof Error ? err.message : err,
    )
    return null
  }
}

/**
 * Render the extraction as a prompt section for the primary model.
 * Returns null when there's nothing useful (intent "other" and no
 * fields) so the caller can omit the section entirely.
 */
export function formatExtractionHint(x: ExtractedAppointment | null): string | null {
  if (!x) return null
  const fields = Object.entries(x).filter(([k, v]) => k !== 'intent' && v !== null)
  if (x.intent === 'other' && fields.length === 0) return null

  const lines = [`intent: ${x.intent}`, ...fields.map(([k, v]) => `${k}: ${v}`)]
  return (
    'A fast local parser pre-extracted the following from the latest patient message. ' +
    'Treat it as a hint only — verify against the conversation and tools before acting, ' +
    'and ignore any field that contradicts what the patient actually wrote:\n' +
    lines.map((l) => `  ${l}`).join('\n')
  )
}
