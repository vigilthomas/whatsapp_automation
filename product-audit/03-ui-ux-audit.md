# 03 — UI/UX audit

**Method and limits.** The public sign-in pages were rendered and screenshotted in the browser (Classic, Split and Spotlight layouts, 20 Nov 2026). Signed-in screens were reviewed from source and from the four screenshots you shared (Access control, Add appointment, Appointments list, an agent chat). No usability test with real receptionists has been run. That is the biggest UX unknown.

## Visual design

| Area | Finding | Score /5 |
|---|---|---|
| Typography & hierarchy | Consistent heading scale (`font-heading`), small label text (11–12.5 px) is used heavily. Fine on desktop, tight for 40+ year-old desk staff | 3.5 |
| Colour & theming | Token-based (`globals.css`), brandable, dark mode, contrast-checked accents (`darkAccent`, `inkOn`) | 4.5 |
| Component consistency | shadcn/base-ui primitives throughout; a few hand-rolled controls (AccessToggle, chips) match well | 4 |
| Density | Appointments list and Access control are dense but readable; the Access control matrix is 6 columns × ~25 modules | 3 |
| Professional appearance | Looks like a modern SaaS; the custom booking dialog is the strongest screen | 4 |

## Key UX issues

| Page/Component | Problem | Impact | Recommended solution | Priority |
|---|---|---|---|---|
| Add appointment (`appointment-dialog.tsx`) | New booking defaulted to "now + 30 min" (e.g. 2:30 AM), outside clinic hours. "Book" kept that time (**fixed 20 Nov**: snaps to the first free slot until the user picks a time) | Wrong bookings | Done; add a test for the dialog once component tests exist | P0 (done) |
| Add appointment | Custom time field shows 24-hour "02:30" while the button says "2:30 AM". It's easy to type 02:30 meaning PM | Wrong bookings | Show AM/PM in the field per locale, or warn for times outside clinic hours (closed-day warning added) | P1 |
| Appointments list | "Doctor —" on bookings made by the WhatsApp assistant when the patient chose "any doctor"/no doctor | Desk can't see who is seeing whom | Auto-assign the first free doctor (the slot engine already returns one) | P1 |
| Access control | Six permission columns, ~25 modules, drag ordering, a separate role picker, and a "0" count that confused you (it is the saved-permission count) | Admin errors; this screen confused even the product owner | Preset roles (Doctor/Receptionist/Manager/Viewer); hide "Other" developer modules; relabel the count "permissions saved" | P1 |
| Navigation | ~20 sidebar destinations incl. Pipelines, Flows, Broadcasts, Automations, Fields, Templates | Receptionists lost; feature appears complex | Clinic edition shows Inbox, Appointments, Patients, Reminders, Reports; the rest under "Advanced" | P1 |
| Onboarding | No first-run wizard; WhatsApp connection needs Meta IDs, token, PIN (`whatsapp-config.tsx`, 924 lines) | Highest drop-off risk; needs you on a call | Guided setup: clinic details → hours → doctors/services → WhatsApp connect (Embedded Signup later) → test booking | P1 |
| Inbox header | Status, assign, refresh, panel toggle and now the Human/Bot switch: crowded on small laptops | Mis-clicks | Move status + assign into one "…" menu below 1280 px | P2 |
| Settings | "Currency" (a deals leftover) next to clinic settings; Branding vs Sidebar menu live in different places | Confusing | Group as Clinic, Team & access, Appearance, Advanced | P2 |
| Empty states | Many lists have plain empty text; Master pages don't explain the order of setup | Slow setup | Empty states with "Add your first doctor" CTA and why it matters | P2 |
| Language | English + Korean only; staff in Kerala/North India often prefer ml/hi; patient-facing bot texts are editable but default English | Lower adoption | Malayalam and Hindi UI; ship bot text packs | P2 |
| Accessibility | Good: ARIA roles on toggles, radio groups, labels on icon buttons. Gaps: tiny text, colour-only status chips in places | Moderate | 13 px minimum body text; add icons/text to status | P3 |
| Mobile | Booking dialog is a full-height sheet (good); Access control and the appointments table scroll sideways | Owners check on phones | A "Today" mobile view for doctors | P3 |

## Lockscreen templates (new)

Rendered and checked: **Classic** (centred card), **Split** (brand panel + form; collapses to a header on phones), **Spotlight** (gradient in the clinic colour). The logo tile was changed to white after the first render showed a near-black tile on light brand colours. Chosen under Settings → Branding → Lockscreen; requires migration 059.

## Principles for the next UI pass

1. One job per screen for the receptionist: *find patient → book → confirm*.
2. Speed over flexibility: defaults that are right 90% of the time (the slot snap is an example).
3. Hide, don't delete, advanced features, so the agency/white-label edition keeps them.
