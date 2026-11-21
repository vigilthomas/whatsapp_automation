/**
 * Suggested values for a template's NAMED placeholders when an agent
 * sends it from the Inbox or a contact page: {{name}} becomes the
 * contact's name, {{time}} their next booking's time, and so on. The
 * agent sees every value in an editable box before sending, so a guess
 * that's wrong costs a correction, not a wrong message.
 *
 * Numbered placeholders ({{1}}) are never guessed: nothing says what
 * {{1}} means, and a confident wrong value is worse than an empty box.
 * Names are matched loosely (case, spaces and a few common spellings
 * per meaning); unknown names stay empty.
 */

export interface AutofillContext {
  contact: { name: string | null; phone: string | null; email: string | null } | null
  /** The contact's next upcoming booking, if any. */
  appointment: {
    starts_at: string
    service: string | null
    doctor: string | null
    branch: string | null
  } | null
  /** The business name (branding). */
  business: string | null
  /** Business timezone for booking dates and times. */
  tz: string | null
  locale?: string
}

type Pick = (c: AutofillContext) => string | null | undefined

const fmt = (c: AutofillContext, opts: Intl.DateTimeFormatOptions) =>
  c.appointment
    ? new Intl.DateTimeFormat(c.locale, { ...opts, ...(c.tz ? { timeZone: c.tz } : {}) }).format(
        new Date(c.appointment.starts_at),
      )
    : null

const fullName: Pick = (c) => c.contact?.name?.trim() || c.contact?.phone || null
const time: Pick = (c) => fmt(c, { hour: 'numeric', minute: '2-digit' })
const date: Pick = (c) => fmt(c, { weekday: 'short', day: 'numeric', month: 'short' })

/** Placeholder name (normalised) → where its value comes from. */
const SOURCES: Record<string, Pick> = {
  name: fullName,
  full_name: fullName,
  customer_name: fullName,
  customer: fullName,
  client_name: fullName,
  client: fullName,
  patient_name: fullName,
  patient: fullName,
  contact_name: fullName,
  first_name: (c) => c.contact?.name?.trim().split(/\s+/)[0] || null,
  phone: (c) => c.contact?.phone,
  phone_number: (c) => c.contact?.phone,
  mobile: (c) => c.contact?.phone,
  email: (c) => c.contact?.email,
  time,
  appointment_time: time,
  booking_time: time,
  slot: time,
  date,
  appointment_date: date,
  booking_date: date,
  day: date,
  date_time: (c) => fmt(c, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }),
  service: (c) => c.appointment?.service,
  service_name: (c) => c.appointment?.service,
  treatment: (c) => c.appointment?.service,
  doctor: (c) => c.appointment?.doctor,
  doctor_name: (c) => c.appointment?.doctor,
  staff: (c) => c.appointment?.doctor,
  staff_name: (c) => c.appointment?.doctor,
  stylist: (c) => c.appointment?.doctor,
  stylist_name: (c) => c.appointment?.doctor,
  branch: (c) => c.appointment?.branch,
  branch_name: (c) => c.appointment?.branch,
  location: (c) => c.appointment?.branch,
  business: (c) => c.business,
  business_name: (c) => c.business,
  clinic: (c) => c.business,
  clinic_name: (c) => c.business,
  salon: (c) => c.business,
  salon_name: (c) => c.business,
  company: (c) => c.business,
  company_name: (c) => c.business,
}

/** One suggestion per key, '' where there's nothing sensible to put. */
export function suggestTemplateValues(keys: readonly string[], named: boolean, ctx: AutofillContext): string[] {
  if (!named) return keys.map(() => '')
  return keys.map((k) => {
    const pick = SOURCES[k.trim().toLowerCase().replace(/[\s-]+/g, '_')]
    return (pick?.(ctx) ?? '').trim()
  })
}

/**
 * The values to send, in the template's placeholder order: a value
 * configured for that placeholder wins (automation step, broadcast
 * mapping), else the suggestion. `missing` lists placeholders left
 * empty — Meta rejects a send with an empty parameter, so callers say
 * which one instead of letting Meta answer with a bare 400.
 */
export function fillTemplateParams(
  keys: readonly string[],
  given: Record<string, string> | undefined,
  suggested: readonly string[],
): { params: string[]; missing: string[] } {
  const params = keys.map((k, i) => {
    const v = given?.[k]
    return v != null && String(v).trim() ? String(v) : (suggested[i] ?? '')
  })
  return { params, missing: keys.filter((_, i) => !params[i].trim()) }
}

const FIELD_OF: Record<string, 'name' | 'phone' | 'email' | 'company'> = {
  name: 'name',
  full_name: 'name',
  customer_name: 'name',
  customer: 'name',
  client_name: 'name',
  client: 'name',
  patient_name: 'name',
  patient: 'name',
  contact_name: 'name',
  phone: 'phone',
  phone_number: 'phone',
  mobile: 'phone',
  email: 'email',
  company: 'company',
  company_name: 'company',
}

/** The broadcast contact field a named placeholder most likely means. */
export function defaultFieldFor(key: string): 'name' | 'phone' | 'email' | 'company' | null {
  return FIELD_OF[key.trim().toLowerCase().replace(/[\s-]+/g, '_')] ?? null
}
