# 14 — Product roadmap (solo developer)

Effort assumes one developer about 25 hours/week alongside sales.

## Phase 0 — Critical (immediate, week 1)

| Task | Reason | Priority | Complexity | Depends on | Impact | Acceptance criteria |
|---|---|---|---|---|---|---|
| Remove public listing on `chat-media`; private bucket for inbound patient media | Patient media listable with the anon key (security F-01) | P0 | M | — | Data protection | Anon list empty; cross-account list denied; media renders |
| Upgrade `next` to the latest patched 16.x | Critical advisories (Aug/Oct 2026 releases) | P0 | S | — | Security | `npm audit` shows no `next` advisory; build + tests pass |
| Move `shadcn` to devDependencies; `npm audit fix` | Removes most transitive advisories from production | P0 | S | — | Security | Production audit: no high/critical |
| Decide data scope: finish (UI + 058 + RLS) or revert | Half-enforced permissions mislead admins | P0 | M | — | Correctness | Either fully enforced with tests, or code removed |
| Apply migrations 058–061 in order on staging, then prod | New features need them | P0 | S | above | Function | Clinic, AI, lockscreen settings save |
| Double-booking exclusion constraint + appointment audit log | Desk/bot race; accountability | P0 | M | — | Data integrity | Concurrent booking of the same doctor/time fails with a clear error; changes logged |
| Route authorization: designation checks on upstream routes (broadcast, send, automations, flows, quick replies) | Matrix not honoured | P0 | M | — | Security | Role without module gets 403 on each route (tests) |

## Phase 1 — Launch readiness (2 weeks → day 30)

| Task | Reason | Priority | Complexity | Impact | Acceptance |
|---|---|---|---|---|---|
| Reminders & confirmations switch | No-shows | P1 | M | High | Booking creates 24 h/2 h reminders; "1/2" replies update status |
| Auto-assign doctor for "any doctor" bot bookings | "Doctor —" rows | P1 | S | Med | Bot bookings always have a doctor |
| Clinic edition nav + preset roles | Complexity | P1 | S | High | New install shows ≤7 sidebar items; 4 preset roles |
| Setup wizard | Onboarding | P1 | M | High | New clinic reaches a test booking in <30 min without you |
| Billing (Razorpay subscriptions, trial, plan limits) | Revenue | P1 | M | High | Plan changes, failed payment → grace → read-only |
| Privacy policy, terms, DPA template | Trust/DPDP | P1 | S | Med | Linked from sign-in and landing |
| Error monitoring (Sentry free) + uptime check | Reliability | P1 | S | Med | Alerts reach your phone |
| Verify AI + booking end-to-end on a real number | New code untested live | P1 | S | High | 20 scripted conversations pass |

## Phase 2 — Competitive (day 30 → 60)

Reports (sources, no-shows, handoff rate, AI usage) · Google review requests · Malayalam/Hindi · template presets · payment links (UPI) · calendar visible hours from clinic settings.

## Phase 3 — Differentiation (day 60 → 90)

Waitlist auto-fill · recall campaigns · AI intent → booking hand-off into the assistant · doctor "Today" PWA · DPDP toolkit (consent log, export/delete).

## Phase 4 — Growth and scale (after day 90)

Embedded Signup (Meta Tech Provider) · per-account branding for shared multi-tenant hosting · Upstash rate limiter · agency console (positioning C) · calendar sync · Gulf pricing/locale.

## Timeline summary

| When | Focus | Exit criterion |
|---|---|---|
| Immediate | Phase 0 | No critical advisories; integrity constraint live |
| 2 weeks | Reminders, auto-assign, nav, demo instance | Demo-ready; 8 meetings booked |
| 30 days | Wizard, billing, legal, monitoring | 3–5 paid pilots |
| 60 days | Reports, reviews, languages | ≥4 paying clinics, <3% weekly issues |
| 90 days | Waitlist, recalls, PWA | 10–15 paying clinics; first partner referral |
