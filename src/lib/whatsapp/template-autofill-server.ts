import type { SupabaseClient } from '@supabase/supabase-js'

import { DEFAULT_CONFIG, parseBookingConfig } from '@/lib/booking/settings'
import type { MessageTemplate } from '@/types'
import { fillTemplateParams, suggestTemplateValues, type AutofillContext } from './template-autofill'
import { templateVariables } from './template-validators'

/**
 * Server-side context for filling a template's named placeholders when
 * no person is there to type them (automation sends). Runs on the
 * service-role client, so every query is pinned to the account by hand
 * (app_branding is the single install-wide row, id 1).
 */
export async function loadAutofillContext(
  db: SupabaseClient,
  accountId: string,
  contactId: string,
): Promise<AutofillContext> {
  const [contact, appt, branding, settings] = await Promise.all([
    db.from('contacts').select('name, phone, email').eq('id', contactId).eq('account_id', accountId).maybeSingle(),
    db
      .from('appointments')
      .select('starts_at, service, doctor:doctors(name), branch:branches(name)')
      .eq('account_id', accountId)
      .eq('contact_id', contactId)
      .in('status', ['scheduled', 'confirmed'])
      .gte('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    db.from('app_branding').select('title').eq('id', 1).maybeSingle(),
    db.from('booking_settings').select('config').eq('account_id', accountId).maybeSingle(),
  ])

  const c = contact.data as { name: string | null; phone: string | null; email: string | null } | null
  const a = appt.data as {
    starts_at: string
    service: string | null
    doctor: { name: string } | null
    branch: { name: string } | null
  } | null
  const title = (branding.data as { title?: string | null } | null)?.title
  const config = (settings.data as { config?: unknown } | null)?.config

  return {
    contact: c ? { name: c.name, phone: c.phone, email: c.email } : null,
    appointment: a
      ? { starts_at: a.starts_at, service: a.service, doctor: a.doctor?.name ?? null, branch: a.branch?.name ?? null }
      : null,
    business: title || null,
    tz: config ? parseBookingConfig(config).timezone : DEFAULT_CONFIG.timezone,
  }
}

/**
 * The body values an automation sends, in the template's placeholder
 * order. Named templates take the step's configured value for a name,
 * else what the contact / next booking / business supplies; a name
 * nothing fills throws (naming it) rather than sending an empty value
 * Meta would reject anyway. Numbered templates keep the step's values
 * in number order (`legacy`, computed by the engine). No local template
 * row → `legacy` unchanged, as before.
 */
export async function resolveEngineTemplateParams(
  row: MessageTemplate | null,
  variables: Record<string, string> | undefined,
  legacy: string[] | undefined,
  load: () => Promise<AutofillContext>,
): Promise<string[]> {
  if (!row) return legacy ?? []
  const { keys, named } = templateVariables(row.body_text)
  if (!named) return legacy ?? []
  const suggested = suggestTemplateValues(keys, true, await load())
  const { params, missing } = fillTemplateParams(keys, variables, suggested)
  if (missing.length) {
    throw new Error(
      `Template "${row.name}" has no value for ${missing.map((k) => `{{${k}}}`).join(', ')} — ` +
        `nothing on the contact or their next booking matches it.`,
    )
  }
  return params
}
