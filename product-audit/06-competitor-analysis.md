# 06 — Competitor analysis

Prices come from third-party comparison pages (Oct–Nov 2026, see [17-research-sources.md](17-research-sources.md)), **not** from vendors' live pricing pages, which load dynamically and were not fetched. Ranges reflect conflicting sources. Exclude GST and Meta message fees unless stated.

## Direct competitors (WhatsApp-first tools a clinic would consider)

| Competitor | Target | Positioning | Entry → top price (₹/month) | Strengths | Weaknesses (reported) |
|---|---|---|---|---|---|
| **Interakt** (Jio Haptik) | Indian SMB/D2C | WhatsApp commerce + CRM | Starter WhatsApp only quarterly/yearly (₹3,499/qtr); Growth ₹2,499–2,799; Advanced ₹3,499–3,799; AI agent add-on ~₹3,000 | Brand trust, Jio backing, catalog/commerce | Generic; AI is an add-on; marketing-message margin |
| **WATI** | SMB globally, strong in India | Shared inbox + chatbots | Growth ₹2,999; Pro ₹6,499; Business ₹18,499 (annual ~25% lower) | Mature inbox, integrations, global | Price rises; extra users/bots cost more; complexity |
| **AiSensy** | Indian SMB marketers | Broadcast-first, cheapest | Free tier; Basic ~₹1,500; Pro ~₹3,200; chatbot add-on ₹2,000–2,500 | Low price, simple broadcasts | Chatbot and agents extra; marketing focus |
| **Gallabox** | Indian SMB sales teams | Conversational CRM | Basic ~₹2,399–2,999 (3-user cap); Essential ~₹5,599; Advanced ~₹13,599 (appointment booking on Advanced) | Booking/flows on top tier, integrations | Booking only on the expensive tier; ~15% fee markup reported |
| **DoubleTick** | Sales teams, mobile-first | Mobile WhatsApp CRM | Starter ~₹3,000–3,500; Pro+AI ~₹7,700–9,200 (sources conflict; some list USD only) | Good mobile app | Pricing opaque; sales-call heavy |

## Indirect competitors (clinic software with some WhatsApp)

| Competitor | Pricing (reported) | WhatsApp capability (reported) | Threat |
|---|---|---|---|
| **Practo Ray** | ~₹999–1,999/month; sales-led | Reminders need setup; no native WhatsApp booking bot published | High mindshare, marketplace discovery |
| **Eka Care** | ₹16,999–1,00,000/year (per doctor tiers) | Follow-up reminders | EMR depth, ABDM alignment |
| **Clinicea** | ₹1,999–3,999/month per practitioner | Confirmations, reminders, online widget | Broad clinic suite |
| Dental tools (Dentobees, DentalDesk, Simpld) | ₹8k–38k/year | Varies; reminders | Cheap, dental-specific charting |
| WhatsApp Business app (free) | Free | Manual | The real incumbent |

**Emerging/niche:** WhatsApp-first doctor booking bots (e.g. pages comparing 11 such platforms in India) show the niche is forming, so you have to move quickly.

## Capability comparison

| Capability | Clinicoro | Interakt | WATI | Gallabox | Practo Ray |
|---|---|---|---|---|---|
| Shared WhatsApp inbox | ✅ | ✅ | ✅ | ✅ | ❌/limited |
| Patient self-booking **inside WhatsApp** with real doctor slots | ✅ (doctor-aware, leaves, buffers, clinic hours) | ⚠️ via flows | ⚠️ via flows | ✅ Advanced tier only | ❌ (reported) |
| Clinic calendar (doctors, branches, leaves, services) | ✅ | ❌ | ❌ | ❌ | ✅ |
| AI replies with **human handoff per chat** | ✅ (BYO key) | ⚠️ add-on | ⚠️ add-on | ⚠️ | ❌ |
| Automatic appointment reminders | ⚠️ via Automations (no 1-click) | ✅ campaigns | ✅ | ✅ | ✅ |
| EMR / prescriptions / billing invoices | ❌ | ❌ | ❌ | ❌ | ✅ |
| Granular roles per designation | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| White-label branding | ✅ | ❌ | ❌ | ❌ | ❌ |
| Self-hostable | ✅ | ❌ | ❌ | ❌ | ❌ |
| Mobile app | ❌ (responsive web) | ✅ | ✅ | ✅ | ✅ |
| Payments (UPI links) | ❌ | ✅ | ⚠️ | ✅ | ✅ |
| Price for a 3-staff clinic | to be set (rec. ₹3,499) | ~₹2.8k + AI ₹3k | ~₹3–6.5k | ~₹5.6–13.6k for booking | ~₹1–2k |

## Answers

- **Where Clinicoro is better:** WhatsApp self-booking against a real clinic calendar, with doctor leaves, service durations, buffers and clinic closures. AI that hands over by design. Roles per designation. White-label and self-hosting.
- **Where it is weaker:** no mobile app, no payments, no EMR/prescriptions, no one-click reminders, no onboarding/Embedded Signup, no brand trust, no integrations marketplace, no support team.
- **Standard features missing:** reminders/confirmations as a switch, payment links, reporting (no-shows, source of bookings), Google review requests, Embedded Signup, mobile app or PWA.
- **What competitors overcomplicate:** campaign builders, flow builders and per-message markup tables. Clinics need three things: book, remind, reply.
- **Underserved segment:** 1–5-doctor specialty clinics (dental, derm, physio, eye) that live on WhatsApp but won't adopt a full EMR, plus their agencies.
- **Realistic basis to compete:** speed to a booked appointment, simple flat price including the bot, local language and in-person onboarding.
- **Why choose Clinicoro over WATI/Interakt:** they sell a toolkit you must assemble into a clinic workflow; Clinicoro *is* the clinic workflow. **Over Practo Ray:** Ray is the clinic's records system, while Clinicoro is the WhatsApp front desk, and the two can coexist.

## Positioning map (qualitative)

```
                     Clinic-specific workflow
                              ▲
             Practo Ray ●     │     ● Clinicoro (target)
            Eka Care ●        │
                Clinicea ●    │
  Records/EMR-first ◀─────────┼─────────▶ WhatsApp-conversation-first
                              │        ● Gallabox (Advanced)
                              │   ● WATI     ● Interakt
                              │       ● AiSensy  ● DoubleTick
                              ▼
                     Generic SMB / marketing
```
