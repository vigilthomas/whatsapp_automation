# 07 — Feature gaps and new feature research

**Framework:** RICE-lite. **Impact** (1–3) × **Confidence** (0.5–1) × **Reach** (1–3) ÷ **Effort** (person-weeks, solo). The score orders the list; MoSCoW gives the launch bucket.

| # | Feature | Problem solved | User benefit | Competitors | Impact | Effort (wk) | Cost/Risk | RICE | Bucket |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **One-click reminders & confirmations** (24 h + 2 h, "Reply 1 to confirm, 2 to reschedule") | No-shows | Fewer empty slots, which pays for the product | All (as campaigns) | 3 | 1.5 | Utility template approval; per-message fee ₹0.115 | **5.4** | Must (pre-launch) |
| 2 | **Billing** (Razorpay subscriptions, plan limits, trial) | Can't charge | — | All | 3 | 2 | Tax/GST invoices | 4.5 | Must |
| 3 | **Setup wizard** (clinic → hours → doctors → services → WhatsApp → test booking) | Onboarding needs founder | Live in an hour | Partial | 3 | 1.5 | — | 4.5 | Must |
| 4 | **Double-booking DB constraint + appointment audit log** | Race between desk and bot; "who cancelled?" | Trust | Clinic tools | 3 | 0.5 | Migration on live data | 4.5 | Must |
| 5 | **Preset roles** (Doctor, Receptionist, Manager) | Access control too complex | Safe defaults | Most | 2 | 0.5 | — | 4.0 | Must |
| 6 | **Auto-assign doctor** for "any doctor" bookings | "Doctor —" rows | Clear daily lists | — | 2 | 0.3 | — | 4.0 | Must |
| 7 | **Clinic edition navigation** (hide CRM extras) | Confusing menu | Faster learning | — | 2 | 0.5 | — | 3.6 | Must |
| 8 | Reports: bookings by source (bot/desk), no-show rate, busiest hours, AI handoff rate | Owner can't see value | Justifies renewal | Partial | 2 | 1 | — | 2.7 | High-value |
| 9 | Google review request after "completed" | Reviews drive discovery | More patients | Some BSPs | 2 | 0.5 | Template approval | 2.7 | Revenue/retention |
| 10 | Payment links (UPI via Razorpay) for advance/booking fee | No-shows, cash handling | Fewer no-shows | Interakt, Gallabox, Practo | 2 | 1.5 | Payment compliance | 2.0 | High-value |
| 11 | WhatsApp **Embedded Signup** | Manual Meta IDs/token | Self-serve connect | WATI, Interakt | 3 | 2 | Meta Tech Provider approval | 2.3 | Competitive necessity |
| 12 | Malayalam + Hindi UI and bot text packs | Staff/patient language | Adoption | Few | 2 | 1 | Translation quality | 2.0 | Differentiating (local) |
| 13 | Recall campaigns (6-month cleaning, follow-up after X days) | Lost repeat visits | Revenue for clinic | Practo, dental tools | 2 | 1 | Marketing fees ₹0.86/msg | 2.0 | Revenue |
| 14 | Waitlist / auto-fill cancellations | Empty slots after cancels | Revenue | Rare | 2 | 1.5 | — | 1.3 | Differentiating |
| 15 | Doctor "Today" mobile view / PWA | Doctors on phones | Adoption by doctors | All have apps | 2 | 1.5 | — | 1.3 | High-value |
| 16 | AI usage + cost dashboard per month | Fear of bot costs | Trust | Some | 1 | 0.5 | — | 2.0 | Retention |
| 17 | AI knowledge from a clinic FAQ doc (upload) | Prompt box limits | Better answers | AI add-ons | 2 | 1.5 | Hallucination risk | 1.3 | Future |
| 18 | DPDP toolkit: consent capture, patient data export/delete, retention | 2027 obligations | Compliance selling point | Few | 2 | 1.5 | Legal review | 1.3 | High-value (2027) |
| 19 | Multi-clinic (per-account branding, agency console) | Positioning C | Agency channel | Rare | 2 | 3 | Architecture change | 0.7 | Future |
| 20 | Practo/Google Calendar sync (doctor busy times) | Two calendars | No clashes | Some | 2 | 2 | API access | 1.0 | Future |
| 21 | Patient forms before visit (WhatsApp Flows) | Paper intake | Faster check-in | Few | 1 | 2 | Meta Flows complexity | 0.5 | Future |
| 22 | Prescriptions/EMR | — | — | Practo, Eka | — | 8+ | Regulatory | — | **Not recommended** |
| 23 | Broadcast "marketing suite" expansion | — | — | Everyone | — | — | Commodity | — | **Not recommended** |
| 24 | Native mobile apps (iOS/Android) | — | — | — | — | 8+ | Maintenance | — | **Not recommended** (PWA first) |

## Top 10 in implementation order

1. Double-booking constraint + appointment audit log (#4): correctness first.
2. Auto-assign doctor (#6).
3. One-click reminders & confirmations (#1).
4. Clinic edition navigation + preset roles (#7, #5).
5. Setup wizard (#3).
6. Billing (#2).
7. Reports (#8) + AI usage dashboard (#16).
8. Google review requests (#9).
9. Payment links (#10).
10. Embedded Signup (#11).

## AI features: are they genuinely needed?

| AI feature | Problem | Data | Model/API | Cost (est.) | Privacy | Needed? |
|---|---|---|---|---|---|---|
| **FAQ replies + handoff** (built) | After-hours questions: timings, fees, location | Clinic facts + instructions, last 20 messages | Claude Haiku 5.5 / GPT-4o-mini via clinic's own key | [E] ~₹0.05–0.3 per reply in LLM tokens + ₹0.115 Meta service fee after 1,000 free/month | Patient messages go to the LLM provider; disclose in privacy notice; no medical advice by rule | **Yes**: measurable (reply time, handoff rate) |
| Intent → booking (route "book" phrases into the booking assistant) | Patients write "need appointment tmrw" | Message text | Same call (add an intent field) | Marginal | Same | **Yes**, cheap extension |
| Handoff summaries for staff (built, minimal) | Staff re-read long chats | Chat | Same call | Included | Same | Yes |
| Voice-note transcription | Patients send audio | Audio | Whisper-class API | [E] ₹0.5–1/min | Health data in audio | Later, if usage shows it |
| AI-written campaigns | — | — | — | — | — | **No**: marketing fluff |
| Symptom triage | — | — | — | — | Medical/legal risk | **No** |
