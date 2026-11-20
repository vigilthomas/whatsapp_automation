# 09 — Differentiation strategy

## Current differentiation (true today, from the code)

1. **Doctor-aware WhatsApp self-booking.** `lib/booking/slots.ts` + `schedule.ts` compute free times per doctor using service duration, the doctor's own time for a service (057), buffers, leaves and half-days (055/056), clinic hours and closures (060), booking window and minimum notice. Generic WhatsApp CRMs ask you to build this with flow builders. Gallabox reportedly offers booking only on its top tier.
2. **AI with an explicit "don't guess" contract.** The assistant answers only from clinic facts, returns a JSON decision, and *any* unreadable answer, provider error, attachment or reply-cap hit becomes a handoff to a named staff member with a notification (`lib/ai-chat/runner.ts`).
3. **Roles by designation with ordered menus**, plus white-label branding and self-hosting.

## Potential differentiation

| Candidate | Defensible? | Why |
|---|---|---|
| "Booked inside WhatsApp in under 60 seconds" (speed) | Medium | Measurable and demo-able; competitors could copy, but it needs the clinic data model they don't have |
| Local onboarding + Malayalam/Hindi | Medium–High in region | Relationship moat; big BSPs don't do in-person setup at ₹3k/month |
| No-show reduction with proof (reports) | High once data exists | Retention: owners renew what shows money saved |
| White-label for clinic agencies | Medium | Few competitors offer it; slow channel |
| Price (flat, bot included) | Low | Anyone can cut price |

## Recommendation

- **Primary differentiator:** *"Patients book a real free slot with the right doctor inside WhatsApp, and the AI never guesses: it hands over."* Lead every demo with a live booking from the prospect's own phone.
- **Secondary 1:** No-show reduction you can see (reminders + confirmations + a monthly "appointments saved" report).
- **Secondary 2:** Done-for-you local setup in your language, live within a day.

Avoid "all-in-one CRM for clinics". The evidence doesn't support it: no EMR, no billing invoices, no mobile app.

## Defensibility over time

1. **Switching cost:** once doctors' schedules, leaves and the patient list live here, moving is painful.
2. **Data:** booking/no-show history per clinic improves reminders and slot suggestions.
3. **Relationships/channel:** agencies and dental associations in one region.
4. **Templates:** a library of Meta-approved clinic templates (reminder, confirmation, recall, review) speeds every new install.

Not defensible: the code itself. The base is an MIT public template, and the clinic layer could be rebuilt by a funded competitor in months.
