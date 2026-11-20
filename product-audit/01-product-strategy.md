# 01 — Product strategy

## 1. What the product is (from the code, not the README)

| Question | Answer | Evidence |
|---|---|---|
| Category | Vertical SaaS: WhatsApp-first patient communication and appointment desk for clinics | `src/lib/booking/*`, `src/app/(dashboard)/appointments`, `src/lib/clinic/*` |
| Underlying platform | Horizontal WhatsApp CRM template (wacrm, MIT) | `LICENSE`, `CLAUDE.md`, `git log` |
| Main problem solved | Patients message the clinic on WhatsApp; staff juggle phones, a paper diary and WhatsApp Business. Bookings get lost, slots double up and messages go unanswered after hours | Booking assistant + slot engine (`booking/slots.ts`, `schedule.ts`), shared inbox, AI handoff |
| Primary user | Front-desk receptionist / clinic coordinator | Appointment dialog, inbox, quick replies |
| Secondary users | Doctors (own calendar, leaves), clinic owner (branding, access control, reports) | `master/leaves`, `access-control`, dashboard widgets |
| Buyer | Clinic owner / practice manager (owner-doctor in small clinics) | — |
| Delivery | Self-hostable (Docker, `docs/docker.md`) or one install per clinic; the branding table is **single-row** (`app_branding.id = 1`) | `046_app_branding.sql` |
| Maturity | Late MVP: broad features, no billing, no onboarding, no customers | — |

**Important structural fact:** the branding is one row per install, and the code says "one clinic per install" (`054_branches_replace_clinics.sql`). The product is therefore **single-tenant per deployment** even though the data model is multi-account. That suits a managed-hosting or white-label business model better than a shared multi-tenant SaaS. You need to decide this deliberately (see §4).

## 2. Is it trying to serve too many customers?

**Yes.** The navigation exposes Inbox, Appointments, Notifications, Contacts, Pipelines, Broadcasts, Automations, Flows (beta), Templates, Quick replies, Fields & tags, Master data, the public API, webhooks and an MCP server. That serves three audiences at once: D2C marketers (broadcasts, pipelines), developers (API, MCP, webhooks) and clinics (appointments, booking). The clinic buyer pays for the third and is confused by the first two.

## 3. Positioning options

| | A. "WhatsApp CRM for Indian SMBs" | B. "WhatsApp front desk for clinics" | C. "White-label clinic WhatsApp platform for agencies/BSPs" |
|---|---|---|---|
| Target | Any SMB using WhatsApp | Dental, dermatology, physio, ENT, eye and paediatric clinics with 1–5 doctors and 1–3 branches | Healthcare marketing agencies, WhatsApp BSP resellers, clinic-software vendors |
| Problem | Broadcasts + shared inbox | Lost and late bookings; after-hours enquiries; double-booked doctors | Agencies want a branded clinic product without building one |
| Promise | Cheaper Interakt/WATI | "Patients book on WhatsApp in under a minute; your desk sees one calendar" | "Your brand, your clinics, our engine" |
| Differentiation | Weak: price only | Booking inside WhatsApp + doctor-aware slots + Human/Bot handoff + roles per designation | Branding, menu editor, lockscreen templates, self-hosting |
| Competition | Very crowded (Interakt, WATI, AiSensy, Gallabox, DoubleTick, ~dozens) | Moderately crowded on clinic software; **thin on WhatsApp-native booking** (third-party comparisons rate Practo Ray/Eka Care WhatsApp as limited) | Few direct, but long sales cycles |
| Revenue potential | Low ARPU, high churn, high CAC | ₹2–7k/month per clinic; sticky once the calendar lives here | Fewer, larger deals (₹25k–1.5L setup + per-clinic fee) |
| Risk | Commodity price war | Must earn trust on reliability; DPDP compliance | Depends on a few partners; support burden |

**Choice: B, with C as the second channel.** B uses what you actually built (the clinic layer), avoids the commodity CRM fight, and the evidence points to a real gap: WhatsApp-native booking is weak in mainstream Indian clinic software. C reuses the same code (branding, menu, lockscreen, self-host) and can come later through agencies.

## 4. Delivery model decision

| Model | Fit with current code | Verdict |
|---|---|---|
| Shared multi-tenant SaaS | Data model is account-scoped with RLS, **but** branding is a single global row, "one clinic per install" assumptions exist, and the rate limiter is in-memory | Needs work before many clinics share one instance |
| **Managed single-tenant (one install per clinic or clinic group)** | Matches the code today; Docker + Supabase project per clinic | **Recommended for the first 20–50 clinics.** Automate provisioning later |
| Self-hosted licence | Possible (Docker) | Only for agencies (positioning C) |

## 5. Positioning statement

> **For** small and mid-size clinics in India that already get patient enquiries on WhatsApp, **Clinicoro** is a **WhatsApp front-desk system** that helps them **book, confirm and remind patients without phone tag or double-booking** by **letting patients pick a real free slot inside WhatsApp, with the doctor's calendar, leaves and clinic hours applied, and an AI assistant that hands over to staff whenever it isn't sure.**

## 6. ICP (first 12 months)

- Private clinics in Kerala / Tier-1 and Tier-2 Indian cities (start where you can visit in person); dental is the first wedge (high appointment volume, procedure lengths vary, so slot logic matters).
- 1–5 doctors, 1–3 branches, 1–4 front-desk staff, 20–150 appointments/week.
- Already using WhatsApp Business app on a phone; frustrated by one shared phone.
- Not tied to a hospital HIS; may use Practo for discovery (complementary, not replaced).

**Anti-ICP:** hospitals (procurement, HIS integration), single-doctor clinics with fewer than 10 appointments a week (won't pay), and pure marketing agencies wanting broadcasts.
