import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  normaliseExtraction,
  formatExtractionHint,
  todayInTimezone,
  extractAppointmentIntent,
  buildExtractionPrompt,
  resolveRelativeDate,
} from './local-extract'

describe('resolveRelativeDate', () => {
  const today = '2026-09-14' // Monday
  it.each([
    ['Book tomorrow at 10 AM', '2026-09-15'],
    ['I need to see the dentist day after tomorrow', '2026-09-16'],
    ['can I come today?', '2026-09-14'],
    ['Can you book Dr. Anjali for Friday afternoon?', '2026-09-18'],
    ['Can I get an appointment next Monday?', '2026-09-21'], // today is Monday → next week
    ['Can I reschedule my appointment to next Tuesday?', '2026-09-15'],
    ['this thursday pls', '2026-09-17'],
    ['on sat', '2026-09-19'],
  ])('%j → %s', (text, iso) => {
    expect(resolveRelativeDate(text, today)).toBe(iso)
  })

  it('returns null when nothing relative is present', () => {
    expect(resolveRelativeDate('book me on 15th September', today)).toBeNull()
    expect(resolveRelativeDate('cancel my appointment', today)).toBeNull()
  })
})

describe('normaliseExtraction', () => {
  it('keeps a well-formed record', () => {
    expect(
      normaliseExtraction({
        intent: 'book_appointment',
        patient_name: 'Rahul Menon',
        phone: '9876543210',
        doctor_name: 'Dr. Anjali Nair',
        specialization: 'Dentist',
        appointment_date: '2026-09-15',
        appointment_time: '10:30 AM',
        reason: 'Tooth pain',
      }),
    ).toEqual({
      intent: 'book_appointment',
      patient_name: 'Rahul Menon',
      phone: '9876543210',
      doctor_name: 'Dr. Anjali Nair',
      specialization: 'Dentist',
      appointment_date: '2026-09-15',
      appointment_time: '10:30 AM',
      reason: 'Tooth pain',
    })
  })

  it('degrades bad fields to null instead of failing', () => {
    const r = normaliseExtraction({
      intent: 'Book Appointment', // wrong casing/spaces → normalised
      appointment_date: 'tomorrow', // not YYYY-MM-DD → null
      phone: '+91 98765-43210', // formatting stripped
      patient_name: 'null', // literal "null" string → null
      reason: '   ',
    })
    expect(r).toEqual({
      intent: 'book_appointment',
      patient_name: null,
      phone: '+919876543210',
      doctor_name: null,
      specialization: null,
      appointment_date: null,
      appointment_time: null,
      reason: null,
    })
  })

  it('maps unknown intents to other', () => {
    expect(normaliseExtraction({ intent: 'greeting' })?.intent).toBe('other')
    expect(normaliseExtraction({})?.intent).toBe('other')
  })

  it('returns null for non-objects', () => {
    expect(normaliseExtraction(null)).toBeNull()
    expect(normaliseExtraction('{}')).toBeNull()
    expect(normaliseExtraction([])).toBeNull()
  })
})

describe('todayInTimezone', () => {
  it('resolves the date in the clinic timezone, not UTC', () => {
    // 2026-09-14 20:30 UTC is already 2026-09-15 02:00 in Kolkata.
    const now = new Date('2026-09-14T20:30:00Z')
    expect(todayInTimezone('Asia/Kolkata', now)).toEqual({ date: '2026-09-15', weekday: 'Tuesday' })
    expect(todayInTimezone('UTC', now)).toEqual({ date: '2026-09-14', weekday: 'Monday' })
  })
})

describe('buildExtractionPrompt', () => {
  it('carries the specialization rule and the date', () => {
    const p = buildExtractionPrompt({ date: '2026-09-14', weekday: 'Monday' })
    expect(p).toContain('The current date is 2026-09-14 (Monday)')
    expect(p).toContain('Tuesday 2026-09-15 (tomorrow)')
    expect(p).toContain('Friday 2026-09-18 (in 4 days)')
    expect(p).toContain('Monday 2026-09-28 (in 14 days)')
    expect(p).toContain("Never infer a specialty from the doctor's name")
    expect(p).toContain('heart doctor → Cardiologist')
    expect(p).toContain('"specialization":null')
  })
})

describe('formatExtractionHint', () => {
  it('omits empty results', () => {
    expect(formatExtractionHint(null)).toBeNull()
    expect(formatExtractionHint(normaliseExtraction({}))).toBeNull()
  })

  it('renders only the populated fields with a verify warning', () => {
    const hint = formatExtractionHint(
      normaliseExtraction({ intent: 'cancel_appointment', appointment_date: '2026-09-15', appointment_time: '10:30' }),
    )
    expect(hint).toContain('intent: cancel_appointment')
    expect(hint).toContain('appointment_date: 2026-09-15')
    expect(hint).toContain('appointment_time: 10:30')
    expect(hint).not.toContain('doctor_name')
    expect(hint).toContain('Treat it as a hint only')
  })
})

describe('extractAppointmentIntent', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    process.env.AI_LOCAL_EXTRACTION = 'true'
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockReset()
    delete process.env.AI_LOCAL_EXTRACTION
  })

  it('is a no-op when the flag is off', async () => {
    delete process.env.AI_LOCAL_EXTRACTION
    expect(await extractAppointmentIntent([{ role: 'user', content: 'book tomorrow' }])).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends format:json at temperature 0 with only the latest user turn', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          message: { content: '{"intent":"book_appointment","appointment_date":"2026-09-15","appointment_time":"10 AM"}' },
          done: true,
        }),
      ),
    )
    const r = await extractAppointmentIntent(
      [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'Hello!' },
        { role: 'user', content: 'Book tomorrow at 10 AM' },
      ],
      { now: new Date('2026-09-14T06:00:00Z') },
    )
    expect(r?.intent).toBe('book_appointment')
    expect(r?.appointment_date).toBe('2026-09-15')

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.format).toBe('json')
    expect(body.options.temperature).toBe(0)
    expect(body.messages).toHaveLength(2) // system + latest user only
    expect(body.messages[1].content).toBe('Book tomorrow at 10 AM')
    expect(body.messages[0].content).toContain('The current date is 2026-09-14')
  })

  it('overrides a wrong model date when the message has a relative phrase', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ message: { content: '{"intent":"book_appointment","appointment_date":"2026-09-25"}' } }),
      ),
    )
    const r = await extractAppointmentIntent(
      [{ role: 'user', content: 'Can you book Dr. Anjali for Friday afternoon?' }],
      { now: new Date('2026-09-14T06:00:00Z') },
    )
    expect(r?.appointment_date).toBe('2026-09-18')
  })

  it('tolerates fenced JSON', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: { content: '```json\n{"intent":"cancel_appointment"}\n```' } })),
    )
    const r = await extractAppointmentIntent([{ role: 'user', content: 'cancel it' }])
    expect(r?.intent).toBe('cancel_appointment')
  })

  it('returns null on network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    expect(await extractAppointmentIntent([{ role: 'user', content: 'book tomorrow' }])).toBeNull()
  })
})
