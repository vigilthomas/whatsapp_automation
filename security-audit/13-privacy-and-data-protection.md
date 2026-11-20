# 13 — Privacy and data protection

> Not legal advice. Have a lawyer review it before selling to clinics.

## Data inventory

| Data | Where | Sensitivity |
|---|---|---|
| Patient name, phone | `contacts` | Personal data |
| Message text | `messages` | Personal; may include **health information** |
| Media (photos, reports, prescriptions, voice) | `chat-media` bucket (inbound mirror on by default) | **Health data**, exposed today (F-01) |
| Appointments (service, doctor, time) | `appointments` | Health-related |
| Staff accounts | `auth.users`, `profiles` | Personal |
| AI conversations | Sent to Anthropic/OpenAI per reply (clinic's key) | Third-party processing |
| Logs | Next.js/console; Supabase logs | May include phone numbers in error messages (not audited in depth) |

## Controls today

| Control | Status |
|---|---|
| Encryption in transit | HTTPS (deployment-dependent) |
| Encryption at rest | Supabase disk encryption; app-level AES-GCM for tokens/keys only |
| Access restriction | RLS + designations (gaps F-01, F-03, F-04) |
| Data minimisation | Full message history kept; AI receives the last 20 messages |
| Retention | None defined; media mirrored indefinitely |
| Patient export / erasure | **Missing** (F-16) |
| Consent | No consent capture in the booking flow; WhatsApp opt-in is implied by the patient messaging first (utility/marketing templates need opt-in) |
| Audit trail | Missing (F-11) |
| Breach response | No runbook |

## India: Digital Personal Data Protection Act 2023 and Rules 2025

- Rules notified **November 2025** with an 18-month phase-in. Core data-fiduciary duties (notice, consent, security safeguards, breach notification, data-principal rights, retention) apply from about **May 2027** ([sources](18-research-sources.md)).
- The **clinic** is the data fiduciary and **Clinicoro (you) is the data processor**. You need a **data processing agreement** with each clinic, security safeguards, breach notification to the clinic, and deletion at contract end.
- Health data isn't a separate "sensitive" category in the DPDP Act, but a breach of it carries high harm and penalty exposure. F-01 would likely count as a reportable personal-data breach once the duties apply.

## Other markets (if expanding)

Gulf (UAE PDPL, Saudi PDPL), EU (GDPR special-category health data), US (HIPAA, which requires a BAA, and Meta/LLM vendors' HIPAA stance). **Don't claim compliance without legal review.**

## Required before selling

1. Fix F-01.
2. Privacy policy + terms + DPA template.
3. Patient data export and erasure (per contact: messages, media, appointments).
4. Retention policy for media and messages, and a purge job.
5. Notice in the bot's first message: "Messages may be answered by an automated assistant; see <privacy link>."
6. LLM provider data-use settings: zero-retention where available; document sub-processors.
7. Breach runbook: detect, contain, notify clinic within 24–72 hours.
