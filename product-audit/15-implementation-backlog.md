# 15 — Implementation backlog

Ranked by actual impact. Complexity: S (≤1 day), M (2–5 days), L (1–3 weeks). Security IDs (F-xx) refer to [`security-audit/15-vulnerability-register.md`](../security-audit/15-vulnerability-register.md).

| ID | Task | Category | Priority | Cx | Impact | Depends | Acceptance criteria |
|---|---|---|---|---|---|---|---|
| B-00 | **Lock down the `chat-media` bucket**: remove the public list policy; move inbound patient media to a private bucket served via the authenticated media route (F-01) | Security | **Must fix first** | M | Critical | — | Anon list returns nothing; account A can't list B; media still renders |
| B-01 | Upgrade `next` to patched 16.x (F-02) | Security | Must fix | S | Critical | — | Audit clean for `next`; CI green |
| B-02 | Move `shadcn` to devDependencies; resolve production advisories (F-09) | Security | Must fix | S | High | — | `npm audit --omit=dev`: no high/critical |
| B-03 | `requirePermission` on upstream routes: broadcast, send, react, automations, flows, quick replies, templates, WhatsApp config (F-03, F-04, F-05) | Security | Must fix | M | High | — | 403 tests per route for a role without the module |
| B-04 | Finish or revert data scope (058 + UI + RLS) (F-06) | Bugs/Security | Must fix | M | High | — | Enforced end-to-end or removed |
| B-05 | Exclusion constraint on doctor/time + `appointment_events` audit table | Database | Must fix | M | High | — | Concurrent double-book rejected; every create/update/delete logged with actor |
| B-06 | Apply migrations 058–061; add a migration runbook to README | Database/Docs | Must fix | S | High | B-04 | Fresh DB → all migrations → app works |
| B-07 | Reminders & confirmations (24 h/2 h, reply 1/2) | Feature | Must build | M | Very high | template approval | Reminders sent; replies update status; opt-out honoured |
| B-08 | Billing with Razorpay subscriptions, trial, plan limits | Monetization | Must build | M | Very high | — | Paid plan unlocks features; dunning works |
| B-09 | Setup wizard | UI/UX | Must build | M | High | — | Test booking reached unaided |
| B-10 | Clinic edition nav (feature flags) + preset roles | UI/UX / Removal | Must build | S | High | — | ≤7 sidebar items; presets selectable |
| B-11 | Auto-assign doctor on "any doctor" bookings | Bug | Must fix | S | Med | — | No "—" doctor on bot bookings |
| B-12 | End-to-end test of AI assistant on a real WhatsApp number (20 scripts) | Testing | Must fix | S | High | 061 | Correct answers; handoff on unknowns; notification sent |
| B-13 | Privacy policy, terms, DPA; consent wording in bot welcome | Docs/Legal | Must build | S | Med | — | Published and linked |
| B-14 | Sentry + uptime monitoring + structured logs for webhook | Ops | Must build | S | Med | — | Alerts on errors/downtime |
| B-15 | Enforce CSP after a week of report-only clean logs (F-07) | Security | Nice | S | Med | — | No violations; header switched |
| B-16 | MFA (TOTP) for owners/admins via Supabase (F-08) | Security | Nice | M | Med | — | Owners can enrol; admin actions require AAL2 |
| B-17 | Reports: bookings by source, no-show, handoff rate, AI usage | Feature | Nice | M | High | B-05 | Monthly report page + export |
| B-18 | Google review request on completion | Feature | Nice | S | Med | B-07 | Sent once per visit, opt-out respected |
| B-19 | Malayalam + Hindi locales; drop Korean | UI | Nice | M | Med | — | Full UI in ml/hi |
| B-20 | Payment links (UPI) | Monetization | Nice | M | Med | B-08 | Link in booking confirmation; status synced |
| B-21 | Calendar visible hours from clinic settings (`weekSpan`) | UI | Nice | S | Low | — | Calendar spans clinic hours |
| B-22 | Single `supabaseAdmin()` helper; remove inlined copies | Refactoring | Nice | S | Low | — | One import path |
| B-23 | Split `automation-builder.tsx` / `message-thread.tsx` when next changed | Refactoring | Defer | M | Low | — | — |
| B-24 | Shared rate limiter (Upstash) (F-10) | Performance/Security | Defer (until >1 instance) | S | Med | — | Limits hold across instances |
| B-25 | Per-account branding for shared hosting | Architecture | Defer | L | Med | — | Two clinics, two brands, one instance |
| B-26 | Embedded Signup | Feature | Defer (needs Meta approval) | L | High | — | Connect without copying IDs |
| B-27 | Remove MCP server from clinic distribution | Removal | Nice | S | Low | — | Not shipped in Docker image |
| B-28 | EMR / prescriptions | Feature | **Reject** | L | — | — | Out of scope: regulated, crowded |
| B-29 | Native mobile apps | Feature | **Reject** (PWA instead) | L | — | — | — |
| B-30 | Landing page + 60-s demo video + pricing page | Marketing | Must build | S | High | — | Live; demo CTA works |

## The 10 most important improvements

B-00, B-01, B-03, B-05, B-04, B-07, B-08, B-09, B-10, B-30.

## Buckets

- **Must fix:** B-00 to B-06, B-11, B-12
- **Must build:** B-07 to B-10, B-13, B-14, B-30
- **Nice to have:** B-15 to B-22, B-27
- **Defer:** B-23 to B-26
- **Reject:** B-28, B-29
