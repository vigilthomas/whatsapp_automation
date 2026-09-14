/**
 * LIVE smoke test for the local extractor against a real Ollama server.
 * Skipped unless LIVE_OLLAMA=1 so it never runs in CI.
 *
 *   LIVE_OLLAMA=1 OLLAMA_MODEL=gemma:2b npx vitest run src/lib/ai/local-extract.live.test.ts
 *   (add OLLAMA_BASE_URL=http://<host>:11434 if Ollama is on another box)
 *
 * Prints the parsed record + latency for each Clinicoro case and
 * asserts only the intent + date, since wording of time/reason varies
 * between models.
 */
import { describe, it, expect } from 'vitest'
import { extractAppointmentIntent, todayInTimezone, clinicTimezone } from './local-extract'

const live = process.env.LIVE_OLLAMA === '1'

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
/** Next occurrence of `weekday` (0=Sun) strictly after `iso`. */
function nextWeekday(iso: string, weekday: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  const diff = ((weekday - d.getUTCDay() + 7) % 7) || 7
  return addDays(iso, diff)
}

describe.skipIf(!live)('local-extract (live Ollama)', () => {
  process.env.AI_LOCAL_EXTRACTION = 'true'
  process.env.OLLAMA_TIMEOUT_MS = process.env.OLLAMA_TIMEOUT_MS || '60000'
  const today = todayInTimezone(clinicTimezone()).date

  const cases: { text: string; intent: string; date?: string; specialization?: string }[] = [
    { text: 'Book tomorrow at 10 AM', intent: 'book_appointment', date: addDays(today, 1) },
    { text: 'Can I get an appointment next Monday?', intent: 'book_appointment', date: nextWeekday(today, 1) },
    { text: 'I need to see the dentist day after tomorrow', intent: 'book_appointment', date: addDays(today, 2), specialization: 'Dentist' },
    { text: 'Can you book Dr. Anjali for Friday afternoon?', intent: 'book_appointment', date: nextWeekday(today, 5) },
    { text: 'I want to cancel my appointment tomorrow at 10:30', intent: 'cancel_appointment', date: addDays(today, 1) },
    { text: 'Can I reschedule my appointment to next Tuesday?', intent: 'reschedule_appointment', date: nextWeekday(today, 2) },
  ]

  it.each(cases)('$text', async ({ text, intent, date, specialization }) => {
    const t0 = Date.now()
    const r = await extractAppointmentIntent([{ role: 'user', content: text }])
    console.log(`\n"${text}" [${Date.now() - t0}ms]\n  → ${JSON.stringify(r)}\n  expected intent=${intent} date=${date}`)
    expect(r).not.toBeNull()
    expect(r!.intent).toBe(intent)
    if (date) expect(r!.appointment_date).toBe(date)
    if (specialization) expect(r!.specialization).toBe(specialization)
    // "Dr. Anjali" must never yield a specialty.
    if (text.includes('Dr. Anjali')) expect(r!.specialization).toBeNull()
  }, 120_000)
})
