// ============================================================
// Clinic system prompt builder.
//
// Builds the layered system prompt for a clinic's AI receptionist:
//
//   1. Default Clinicoro scaffold (role, boundaries, formatting)
//   2. Clinic-specific instructions (admin's custom prompt)
//   3. Current clinic data (name, services, working hours)
//   4. Current patient data (name, phone, recent appointments)
//   5. Tool usage instructions + handoff protocol
//
// The result is a single system prompt string sent as the first
// message to the model.
// ============================================================

import type { ClinicAiConfig } from './clinic-config'
import { HANDOFF_SENTINEL } from './defaults'
import { loadAiPersonaConfig } from './persona'

export interface ClinicPromptContext {
  config: ClinicAiConfig
  clinic: {
    name: string
    phone: string | null
    address: string | null
    city: string | null
  }
  patient: {
    name: string | null
    phone: string
  }
  services: { name: string; duration_min: number; price: number }[]
  recentAppointments: {
    starts_at: string
    service: string
    doctor_name: string | null
    status: string
  }[]
  /** Names of tools available in this conversation. */
  availableToolNames: string[]
  /** Optional pre-parsed intent/entities from the local extractor
   *  (`local-extract.ts`), already rendered via `formatExtractionHint`. */
  extractionHint?: string | null
}

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  ml: 'Malayalam',
  hi: 'Hindi',
  ta: 'Tamil',
  te: 'Telugu',
  kn: 'Kannada',
  ar: 'Arabic',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  ja: 'Japanese',
}

/** Human-readable label for a config language code ("ml" → "Malayalam"). */
export function languageLabel(code: string): string {
  return LANGUAGE_LABELS[code] ?? code
}

/**
 * Build the full system prompt for a clinic AI conversation.
 */
export function buildClinicSystemPrompt(ctx: ClinicPromptContext): string {
  const { config, clinic, patient, services, recentAppointments, availableToolNames } = ctx
  const parts: string[] = []

  // ── 1. Default scaffold (from .ai-config.json) ─────────────

  const persona = loadAiPersonaConfig()
  const langLabel = languageLabel(config.language)

  parts.push(
    `You are ${persona.name}, ${persona.role} for ${clinic.name}. ` +
    `${persona.persona} ` +
    `Communicate in ${langLabel}. ` +
    persona.instructions.join(' '),
  )

  // Security boundary.
  parts.push(persona.boundaries.join(' '))

  // ── 2. Clinic-specific instructions ────────────────────────

  if (config.systemPrompt?.trim()) {
    parts.push(`Clinic-specific instructions:\n${config.systemPrompt.trim()}`)
  }

  // ── 3. Current clinic data ─────────────────────────────────

  const clinicLines: string[] = [`Clinic: ${clinic.name}`]
  if (clinic.phone) clinicLines.push(`Phone: ${clinic.phone}`)
  if (clinic.address) clinicLines.push(`Address: ${clinic.address}`)
  if (clinic.city) clinicLines.push(`City: ${clinic.city}`)

  if (services.length > 0) {
    clinicLines.push('\nServices offered:')
    for (const svc of services) {
      const price = svc.price > 0 ? ` — ₹${svc.price}` : ''
      clinicLines.push(`  • ${svc.name} (${svc.duration_min} min${price})`)
    }
  }

  parts.push(`Current clinic information:\n${clinicLines.join('\n')}`)

  // ── 4. Current patient data ────────────────────────────────

  const patientLines: string[] = []
  if (patient.name) patientLines.push(`Name: ${patient.name}`)
  patientLines.push(`Phone: ${patient.phone}`)

  if (recentAppointments.length > 0) {
    patientLines.push('\nRecent / upcoming appointments:')
    for (const appt of recentAppointments) {
      const date = new Date(appt.starts_at).toLocaleString('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
      const doc = appt.doctor_name ? ` with ${appt.doctor_name}` : ''
      patientLines.push(`  • ${date} — ${appt.service}${doc} (${appt.status})`)
    }
  }

  parts.push(`Current patient information:\n${patientLines.join('\n')}`)

  // ── 5. Tool usage + handoff ────────────────────────────────

  if (availableToolNames.length > 0) {
    parts.push(
      'You have access to the following tools to help this patient: ' +
      availableToolNames.join(', ') +
      '. Use them when the patient asks to book, reschedule, cancel, or check availability. ' +
      'Always confirm the details with the patient before executing a booking or cancellation.',
    )
  }

  if (config.allowHumanHandoff) {
    parts.push(
      `If you cannot confidently help — the patient explicitly asks for a human, is upset, ` +
      `or the request needs information you do not have — reply with exactly ${HANDOFF_SENTINEL} ` +
      `and nothing else. A human will then take over. Prefer handing off over guessing.`,
    )
  }

  return parts.join('\n\n')
}
