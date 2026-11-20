# Clinicoro — SaaS Product Audit report

**Audit date:** 20 November 2026 · **Product:** Clinicoro (wacrm fork) · **Prepared for:** product owner

> Market figures, competitor prices and valuations are estimates drawn from third-party sources dated in the Research Sources chapter. They are uncertain (treat valuations as ±50%) and are not financial advice.

This master document combines the individual reports in this folder, in reading order.

# 00 — Executive summary

**Product:** Clinicoro (repository `whatsapp_automation`, package `wacrm` v0.8.0)
**Audit date:** 20 November 2026 · **Branch audited:** `feat/migrations-and-booking` plus uncommitted work in the working tree
**Auditor stance:** skeptical, commercial. Code findings were read directly from the source. Market figures come from third-party pages (dated in [17-research-sources.md](17-research-sources.md)) and are labelled as such.

## What you actually have

Clinicoro is a **WhatsApp-first front desk for small clinics**. It is built on the MIT-licensed open-source template **wacrm** (Arnas Donauskas; 601 of the 739 commits in this repository are upstream). On top of that template you added a clinic vertical:

| Layer | Origin | Evidence |
|---|---|---|
| Shared inbox, contacts, broadcasts, templates, automations, Flows, public REST API, outbound webhooks, API keys, MCP server | **Upstream template** (free, public) | `git log` authorship; `LICENSE` (MIT) |
| Appointments (calendar, list, dialog, slots), Master data (branches, doctors, services, doctor-services, leaves, users, roles), WhatsApp **booking assistant**, designation-based **Access control**, **Branding** (logo, colours, sidebar menu, lockscreen), **Settings → Clinic** (hours, holidays, closed dates), **AI assistant** with a Human/Bot switch per chat | **Your work** (migrations 041–061) | `src/lib/booking/*`, `src/lib/appointments/*`, `src/lib/auth/permissions.ts`, `src/lib/clinic/*`, `src/lib/ai-chat/*` |

The engineering quality is **above average for a solo product**. The code is typed throughout, there are 929 unit tests across 86 files, every route checks permissions, and the doc comments explain why things are done. It is **not a business yet**. There is no billing, no self-serve onboarding, no customers, and no landing page. One production-relevant dependency (`next` 16.2.12) is in a critical advisory range.

## Rating

| Dimension | Score /10 |
|---|---:|
| Technical quality | **6.6** |
| UI/UX | **6.4** |
| Product (fit, completeness, usefulness) | **6.0** |
| Market competitiveness | **4.6** |
| Commercial readiness | **2.4** |
| **Overall (weighted)** | **5.1 / 10** |

**Stage: late MVP / private beta.** It is feature-rich but commercially unproven. See [04-technical-audit.md](04-technical-audit.md) and the scorecard in [16-final-verdict.md](16-final-verdict.md).

## The five things that matter most

1. **The real asset is the clinic workflow, not the WhatsApp CRM.** Indian WhatsApp CRMs are crowded and cheap, at roughly ₹1,500–₹3,800/month entry plans (Interakt, WATI, AiSensy, Gallabox, DoubleTick). Clinic software is cheap too (Practo Ray, Eka Care, Clinicea). Third-party comparisons say the clinic tools are weak at **booking inside WhatsApp**, and that gap is what Clinicoro already does.
2. **Too much generic surface.** Pipelines and deals, Flows, Automations, broadcasts, the public API, outbound webhooks and the MCP server all come from a horizontal CRM template. A receptionist doesn't need them, and every one adds support and security load. Hide them behind an "Advanced" switch ([08-remove-simplify.md](08-remove-simplify.md)).
3. **Fix before anyone pays:** close the **public `chat-media` storage bucket**. Inbound patient photos and documents are mirrored there, and its read policy is open to anyone holding the public anon key (security F-01, Critical). Also upgrade `next` (critical advisories), stop any member deleting WhatsApp templates on Meta (F-03), run migrations 058–061 in order, finish or remove the half-built data-scope feature (058 is reserved but missing), and add billing.
4. **Price for clinics, not marketers.** Recommended: **₹1,999 / ₹3,499 / ₹6,999 per month per clinic** (Starter, Clinic, Multi-branch). Meta message fees pass through at cost. Details in [10-pricing-monetization.md](10-pricing-monetization.md).
5. **Valuation today is modest and honest.** As is, roughly **₹1–4 lakh** (realistic about ₹2.5 lakh), because the base template is free and public. As a polished product with a domain and a demo, **₹4–8 lakh**. At ₹1 lakh MRR with low churn, about **₹18–48 lakh** (base about ₹30 lakh). Revenue is the only lever that moves this number much ([11-valuation-and-sale.md](11-valuation-and-sale.md)).

## Recommendation

**Continue. Narrow the product, fix the critical items, and launch a paid pilot with 5–10 dental and outpatient clinics in one Indian city within 60 days.** Don't sell now: a pre-revenue fork of a public template fetches little, and the vertical layer is worth far more once there are paying clinics.

## What was not verified

- Signed-in screens were **not exercised in a browser** during this audit (sign-in requires the owner's password). The UI findings come from source review plus the public sign-in pages.
- No production deployment, database, or traffic was examined. No load tests were run.
- Competitor prices come from **third-party comparison pages, not vendors' live pricing pages**, and sometimes conflict. Ranges are shown.
- No market size is quoted, because no reliable, primary figure was found.

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

# 02 — Feature inventory

Legend: **Status** F = fully implemented, P = partial, E = experimental/beta, U = upstream (template) feature, unchanged. **BV** business value for the clinic ICP (H/M/L). UX and Tech scored /5 from source review (UI not exercised signed-in; see the limitations in the executive summary).

| # | Feature | Module / key files | Purpose | Status | BV | UX | Tech | Class | Recommendation |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Shared WhatsApp inbox | `inbox/page.tsx`, `components/inbox/*` | Team replies from one number | F (U) | H | 4 | 4 | Core | **KEEP** |
| 2 | Human / Bot switch per chat | `inbox/reply-mode-toggle.tsx`, `api/conversations/[id]/ai-mode`, mig. 061 | Choose AI or staff per chat | F (new, untested in browser) | H | 4 | 4 | Core | **KEEP**; verify end-to-end with a real number |
| 3 | AI assistant + handoff | `lib/ai-chat/*`, `api/ai/settings`, `settings/ai-panel.tsx` | Answer FAQs from clinic facts; hand to staff when unsure | F (new) | H | 4 | 4 | Differentiating | **IMPROVE**: add a conversation log of AI decisions and usage cost |
| 4 | Appointments calendar + list | `appointments/page.tsx`, `appointment-calendar.tsx`, `appointment-list.tsx` | Day/week view, actions | F | H | 4 | 4 | Core | **KEEP** |
| 5 | Add/edit appointment dialog with live slots | `appointment-dialog.tsx`, `booking/schedule.ts` | Fast booking at the desk | F (time-snapping bug fixed 20 Nov) | H | 4 | 4 | Core | **KEEP** |
| 6 | WhatsApp booking assistant | `lib/booking/engine.ts`, `runner.ts`, `slots.ts`, `automations/booking` | Patients self-book in WhatsApp | F | H | 4 | 4 | Differentiating | **KEEP**: the wedge feature |
| 7 | Clinic hours, holidays, closed dates | `lib/clinic/settings.ts`, `settings/clinic-panel.tsx`, mig. 060 | One source of opening times | F (new) | H | 4 | 4 | Core | **KEEP**; make the calendar's visible hours follow it |
| 8 | Master: branches, services, doctor-services, leaves, users, roles | `lib/master/entities.ts`, `master-records-panel.tsx` | Reference data | F | H | 3 | 4 | Essential | **SIMPLIFY**: guided setup wizard |
| 9 | Access control (designations × modules × actions, ordered) | `lib/auth/permissions.ts`, `access-control-panel.tsx` | Per-role permissions | F | M | 3 | 5 | Admin | **KEEP**, add preset roles (Doctor, Receptionist, Manager) |
| 10 | Per-module data scope (all / branch / own / custom) | `lib/auth/data-scope.ts`, `permissions.ts` | Restrict data by branch | **P**: lib + tests exist; UI, migration 058 and RLS missing | M | – | 3 | Advanced | **FINISH or REVERT**: half-built is a liability |
| 11 | Branding (name, logo, crop, shapes, colours, presets, preview) | `branding-panel.tsx`, `lib/branding.ts` | White-label look | F | M | 4 | 4 | Advanced | **KEEP** (valuable for positioning C) |
| 12 | Lockscreen templates (Classic/Split/Spotlight) | `components/auth/auth-shell.tsx`, mig. 059 | Branded sign-in | F (new) | L | 4 | 4 | Advanced | **KEEP** (cheap), not a selling point |
| 13 | Sidebar menu editor (rename, icons, groups, custom sections, order, hide) | `menu-panel.tsx`, `lib/branding-menu.ts` | Tailor navigation | F | L–M | 3 | 4 | Advanced | **MOVE TO ADVANCED** |
| 14 | Contacts + import CSV + tags + custom fields | `contacts/page.tsx`, `import-modal.tsx` | Patient list | F (U) | H | 3 | 4 | Essential | **IMPROVE**: rename "Contacts" to "Patients" for the clinic edition |
| 15 | Broadcasts (template campaigns, resume, CSV) | `broadcasts/*`, `whatsapp/broadcast-core.ts` | Bulk messages | F (U) | M | 4 | 4 | Supporting | **KEEP** for recall/reminder campaigns; hide the generic marketing framing |
| 16 | Message templates (create, submit, sync) | `template-manager.tsx` (1,140 lines) | Meta-approved templates | F (U) | M | 3 | 3 | Essential | **SIMPLIFY**: ship clinic template presets |
| 17 | Quick replies | `quick-replies-manager.tsx` | Canned answers | F (U) | M | 4 | 4 | Supporting | **KEEP** |
| 18 | Automations (trigger → condition → action) | `automation-builder.tsx` (1,596 lines) | No-code rules | F (U) | L–M | 3 | 3 | Advanced | **MOVE TO ADVANCED** (overlaps booking + Flows) |
| 19 | Flows (visual builder, beta) | `flows/*`, `@xyflow/react`, `dagre` | Chatbot menus | E (U) | L | 3 | 3 | Experimental | **HIDE** by default; overlaps the booking assistant + AI |
| 20 | Pipelines / deals | `pipelines/page.tsx`, `deal-form.tsx` | Sales funnel | F (U) | L | 3 | 4 | Unnecessary for ICP | **HIDE** (could be "treatment plans" later) |
| 21 | Notifications | `notifications/page.tsx`, mig. 027 | Assignment alerts | F (U) | M | 4 | 4 | Supporting | **KEEP** (AI handoff uses it) |
| 22 | Dashboard (clinic widgets, activity) | `dashboard/page.tsx`, `clinic-widgets.tsx` | Today at a glance | F | M | 4 | 3 | Supporting | **IMPROVE**: no-show rate, bookings by source |
| 23 | Public REST API v1 + API keys + scopes | `api/v1/*`, `lib/api-keys/*` | Integrations | F (U) | L | – | 5 | Advanced | **MAKE OPTIONAL** (off by default) |
| 24 | Outbound webhooks (SSRF-protected) | `lib/webhooks/*` | Push events | F (U) | L | – | 5 | Advanced | **MAKE OPTIONAL** |
| 25 | MCP server package | `mcp-server/` | AI-agent access | F (U) | L | – | 4 | Developer | **REMOVE from the clinic product** (keep in repo) |
| 26 | Team members, invitations, ownership transfer | `api/account/*`, `members-tab.tsx` | Staff accounts | F | H | 4 | 4 | Essential | **KEEP** |
| 27 | Settings rail (profile, security, appearance, currency) | `settings/page.tsx` | Personal settings | F | M | 4 | 4 | Essential | **KEEP**; "Currency" is a deals leftover, so **HIDE** |
| 28 | i18n (en, ko) | `messages/*.json` | Localisation | F | L (ko) | – | 4 | — | Replace **ko** with **ml/hi** for India |
| 29 | Voice notes (Opus recorder) | `message-composer.tsx`, `public/opus` | Send audio | F (U) | M | 4 | 4 | Supporting | **KEEP** |
| 30 | Billing / subscriptions | — | Charge clinics | **Missing** | H | – | – | — | **BUILD** (Razorpay subscriptions) |
| 31 | Appointment reminders / confirmations on WhatsApp | partly via Automations/broadcasts | Reduce no-shows | **Missing as a first-class feature** | H | – | – | — | **BUILD** (highest-value gap) |
| 32 | Onboarding (WhatsApp connect, clinic setup wizard) | `whatsapp-config.tsx` only | Time-to-value | **P** | H | 2 | 3 | — | **BUILD** |

## Notes on major recommendations

- **Reminders (31)** are what clinics buy WhatsApp tools for. A booking without an automatic reminder 24 hours and 2 hours before still leaves the no-show problem unsolved. Today this needs a hand-built Automation, so it should be a single switch in the clinic edition.
- **Data scope (10)** was handed off mid-way. `src/lib/auth/data-scope.ts` and the route tests are in, but there's no UI, no 058 migration and no RLS. Ship it or remove it before launch. A half-enforced permission feature is worse than none, because admins will believe it protects data.
- **Generic CRM features (18–20, 23–25)** are not bad code. They are the wrong surface for a receptionist. Hiding them (not deleting them) keeps positioning C open.

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

# 04 — Technical audit

All findings are **code observations** unless marked otherwise. Security is summarised here; the full assessment is in [`../security-audit/`](../security-audit/README.md).

## 1. Repository map

| Item | Value |
|---|---|
| Stack | Next.js **16.2.12** (App Router, Turbopack), React 19.2, TypeScript, Tailwind v4, Supabase (Postgres + Auth + Storage + RLS) |
| Size | ~73k lines of non-test TS/TSX in `src/`; 55 API route files; 61 SQL migrations (001–061, 058 missing) |
| Tests | 86 test files, **929 tests passing** (Vitest, Node env, mocked I/O); no component/E2E tests |
| CI | `.github/workflows/ci.yml` (lint → typecheck → test → build), `migrations.yml` |
| Deploy | `Dockerfile` (node:20-alpine, multi-stage, non-root `nextjs` user), `docker-compose.yml` (port 3000, `.env.local` via `env_file`) |
| Billing | **None** |
| Separate package | `mcp-server/` (published standalone as `wacrm-mcp`) |

## 2. Architecture

**Strengths**
- Clear split between the **cookie-session path** (`getCurrentAccount` / `requirePermission`, RLS-scoped client) and the **API-key path** (`requireApiKey`, service role + explicit `account_id` filters). The rule is documented in `CLAUDE.md` and largely followed.
- Domain logic lives in pure, tested modules (`lib/booking/slots.ts`, `schedule.ts`, `lib/auth/permissions.ts`, `lib/clinic/settings.ts`, `lib/ai-chat/model.ts`), and route handlers stay thin.
- Defensive parsing of every JSON column (`parseBookingConfig`, `parsePermissions`, `parseClinicSettings`, `customGroupsOf`), so older or newer rows never crash a page.
- Migrations are idempotent with explanatory headers.

**Weaknesses**
| Issue | Evidence | Impact | Fix |
|---|---|---|---|
| Single-row global branding vs. multi-account data model | `app_branding.id = 1` (046) | Can't serve two clinics with different brands from one instance | Key branding by account when moving to shared SaaS |
| Two "admin client" helpers plus inlined ones | `lib/automations/admin-client.ts`, `lib/flows/admin-client.ts`, `whatsapp/config/route.ts` defines its own | Drift risk | Use one `supabaseAdmin()` |
| Mixed authorization models | Newer routes use designation `requirePermission`; upstream routes use coarse `requireRole('agent')` (automations, flows, quick replies, broadcasts, send) | A designation's matrix is **not** honoured on those routes | Migrate to `requirePermission` (see security F-04) |
| Large components | `automation-builder.tsx` 1,596 lines, `message-thread.tsx` 1,197, `template-manager.tsx` 1,140, `node-config-form.tsx` 1,064 | Hard to change safely | Split when next touched; don't refactor for its own sake |
| Half-finished feature on the branch | `lib/auth/data-scope.ts` + `master/[entity]/[id]/route.test.ts` reference `entityScope`; no UI, no migration 058 | Admins may assume protection that isn't enforced in the UI/RLS | Finish or revert before launch |
| In-memory rate limiter | `lib/rate-limit.ts` (documented) | Ineffective with more than one instance | Fine for one VPS; Upstash when scaling |
| Runtime dependency bloat | `shadcn` (a CLI) is in `dependencies` and pulls MCP SDK, express, hono and others, which accounts for most of the 23 `npm audit` advisories | Larger attack surface and image | Move `shadcn` to `devDependencies` |

## 3. Code quality

- **Type safety:** strict TS, typecheck clean. Some `as unknown as` casts around PostgREST embeds (`permission-guard.ts`), which is acceptable.
- **Validation:** good on new routes (`validateAppointmentInput`, `sanitizeMasterInput`, `parseClinicSettings`). The upstream `whatsapp/config` POST trusts the body shape more.
- **Error handling:** consistent `toErrorResponse` / `toApiErrorResponse`. Webhook dispatchers never throw.
- **Dead/unused:** lint warns of unused imports (`downloadMedia` in the webhook route, `ScrollArea` in `message-thread.tsx`); `ko` locale likely unused by the ICP; `mcp-server/` is irrelevant to clinics.
- **TODO/FIXME count:** effectively zero (1 match), which is good hygiene.

## 4. Database

| Area | Assessment |
|---|---|
| Tenancy | `account_id` on every domain table; RLS via `is_account_member` (SECURITY DEFINER, `search_path` pinned) |
| Integrity | FKs with sensible `ON DELETE SET NULL` for history; soft delete on master data (052); unique live indexes (`doctor_services_live_uq`) |
| Indexes | Present on hot paths (`appointments(doctor_id, starts_at)`, `(account_id, branch_id)`) |
| Gaps | No audit/history table for appointment changes (who moved/cancelled what); no exclusion constraint against double-booking a doctor; slot checks are app-side only |
| Migration hygiene | Numbered, idempotent; **058 is reserved but absent**; 059–061 added in this session must be applied in order |

**Recommendation:** add an `appointment_events` audit table and a Postgres `EXCLUDE USING gist (doctor_id WITH =, tstzrange(starts_at, ends_at) WITH &&) WHERE status <> 'cancelled'` constraint. Two receptionists, or a receptionist and the bot, can currently book the same slot at the same moment.

## 5. Performance

- Appointment fetches are windowed (`from`/`to`) and capped (200 without a window).
- The booking dialog makes four requests per open (services, doctor-services, clinic settings, busy windows). That's fine.
- The AI runner makes ~5 queries + 1 LLM call per inbound message in Bot mode, with a 20 s timeout. That's acceptable at clinic volumes.
- No bundle analysis was run. `@xyflow/react`, `recharts` and `dagre` are heavy and should be dynamically imported on their pages only (verify).

## 6. Scalability

| Customers (clinics) | Verdict |
|---|---|
| 10 | Works today, one install each or one shared instance |
| 100 | Works on one instance if branding becomes per-account. Supabase Pro tier; webhook fan-in fine |
| 1,000 | Needs a shared rate limiter (Upstash), queued webhook processing (the webhook runs work in `after()`), and per-account branding/menu caching |
| 10,000 | A message queue for inbound/outbound, read replicas, partitioning `messages` by account/time. **Not needed for 2+ years.** No Kubernetes or microservices required before then |

## 7. Security summary (details in security-audit/)

- **Critical:** the `chat-media` bucket's SELECT policy has no role/account restriction, and inbound patient media is mirrored into it, so it can be listed and downloaded with the public anon key (F-01).
- **High (dependency):** `next` 16.2.12 is within advisory ranges fixed in 16.3.3/16.4.1+ (August and October 2026 releases). Upgrade.
- **High:** any member can delete/edit WhatsApp templates on Meta (F-03); upstream routes authorize by role tier, not the designation matrix. A role with Broadcasts switched off in Access control can still call `/api/whatsapp/broadcast` if their account role is `agent`+.
- **Medium:** CSP is report-only; no MFA for owners; in-memory rate limits; no audit log of permission and appointment changes.
- Strong points: webhook HMAC with timing-safe compare, API keys hashed (SHA-256) with timing-safe compare, AES-256-GCM token encryption, SSRF guard on outbound webhooks, security headers, non-root container.

# 05 — Market research

Research date: **20 November 2026**. Labels: **[F]** verified fact (multiple consistent sources or official), **[R]** research finding from third-party pages (may conflict), **[E]** estimate, **[A]** assumption, **[O]** strategic opinion. Sources: [17-research-sources.md](17-research-sources.md).

## 1. Market size

**Not quoted.** No primary, reliable figure was found for "WhatsApp clinic software in India" or "WhatsApp CRM in India". The numbers circulating on vendor blogs are unsourced. Instead of inventing one, this audit sizes the opportunity bottom-up in [10-pricing-monetization.md](10-pricing-monetization.md) (a reachable-clinic count × ARPU) and labels it as an estimate.

## 2. What the market looks like

| Finding | Label | Notes |
|---|---|---|
| The Indian WhatsApp-CRM market is crowded with BSP-led tools: Interakt, WATI, AiSensy, Gallabox, DoubleTick and many smaller ones | [R] | Every comparison page lists 9–11 vendors |
| Entry plans cluster at **₹1,500–₹3,800/month**; mid tiers ₹3,200–₹6,500; top tiers ₹13,000–₹18,500 | [R] | Prices conflict between sources by 10–25%; see 06 |
| Meta's per-message fees are billed on top: marketing ≈ **₹0.86/message**, utility/authentication ≈ **₹0.115** for +91 numbers (from 1 July 2026 card) | [R] | Consistent across 5+ pages; not checked against Meta's own page |
| From **1 Oct 2026**, free-form replies inside the 24-hour service window are charged at the utility rate, with **1,000 free service messages per month per number** | [R] | Directly affects AI-bot replies' running cost |
| BSPs add markups on Meta fees (e.g. ~15% reported for Gallabox) and charge extra for chatbots/AI (₹2,000–₹3,000/month add-ons) | [R] | Hidden cost is a common complaint |
| Clinic management software in India is priced low: Practo Ray ~₹999–₹1,999/month (reported), Eka Care ₹16,999–₹1,00,000/year, Clinicea ₹1,999–₹3,999/month per practitioner, dental tools ₹8k–₹38k/year | [R] | Mostly competitor comparison blogs |
| Comparison pages describe mainstream clinic tools' WhatsApp support as **reminders only or limited**; native WhatsApp self-booking is rare | [R] | This is the gap Clinicoro fills, but the claim comes from interested parties |
| DPDP Rules notified Nov 2025; core data-fiduciary obligations apply ~**May 2027** (18-month phase-in) | [F] | PIB release + legal firms |

## 3. Customer pain points (clinic front desk)

From the competitor positioning and complaint themes on comparison pages **[R]**, combined with the workflow the code models **[O]**:

1. **Missed enquiries** after hours and during rush periods, when patients message WhatsApp and nobody answers for hours.
2. **Phone tag to fix a time.** "Is 4 pm free?" takes 5–8 messages.
3. **Double-booking and doctor leave clashes.** Paper or WhatsApp-on-one-phone has no calendar truth.
4. **No-shows.** Reminders are manual if they happen at all.
5. **One shared phone.** No way to see who replied, and staff turnover loses history.
6. **Hidden costs in WhatsApp tools.** Per-message markups and chatbot add-ons appear repeatedly as complaints about BSP tools [R].
7. **Too-complex tools.** Generic CRMs (pipelines, campaigns) don't map to "today's appointments".

## 4. Trends and opportunities

| Trend | Label | Implication for Clinicoro |
|---|---|---|
| BSPs bundling "AI agents" at ₹3,000/month add-ons | [R] | Include a capped AI assistant in the mid plan instead of an add-on |
| Meta charging service-window replies from Oct 2026 | [R] | Bot replies now cost ~₹0.115 each after 1,000/month. Budget it; cap replies per chat (already built) |
| DPDP compliance deadline 2027 | [F] | Selling point: consent, deletion, export and audit log built in |
| Clinics already use Practo for discovery | [R] | Position as **complementary** (front desk on WhatsApp), not a Practo replacement |

## 5. Global vs India: where to start

| | India | Global (UK/EU/US/Middle East) |
|---|---|---|
| WhatsApp centrality | Very high [A, widely reported] | High in Middle East/LatAm/EU; lower in US |
| Price tolerance | Low (₹1–4k/month) | Higher ($50–200/month) |
| Competition | Very crowded for CRMs; less for WhatsApp-native clinic booking | Clinic software mature; WhatsApp-native less so outside US |
| Regulation | DPDP (2027) | GDPR/HIPAA: heavier |
| Founder access | In person, local language | Remote only |

**[O] Start in India (Kerala first, where you can visit clinics), dental and outpatient specialties.** Treat the Gulf (large Malayali-run clinic networks, WhatsApp-heavy, higher prices) as the second market. It's reachable through the same networks and the same product.

## 6. Barriers to adoption

- Meta Business verification and WhatsApp number migration (clinics fear losing their existing number/chats).
- Trust: patient data, uptime and "what if the bot says something wrong" (the handoff design answers this).
- Staff training time; resistance from the receptionist whose job changes.
- Price anchoring to free WhatsApp Business app.

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

# 08 — Remove, merge, simplify

Principle: **hide, don't delete**. Most of these features are working upstream code, and removing them would make it harder to pull template updates and would close off the agency/white-label edition. The aim is a clinic edition that shows about 6 destinations instead of about 20.

| Feature | Current purpose | Problem for clinics | Recommendation | Expected benefit | Risk |
|---|---|---|---|---|---|
| Pipelines / deals | Sales funnel | Not a clinic concept | **HIDE** (feature flag) | Less confusion | Low: re-enable for agencies |
| "Currency" settings | Deal values | Only used by deals | **HIDE** with pipelines | Cleaner settings | None |
| Flows (beta visual builder) | Chatbot menus | Overlaps the booking assistant + AI; beta; heavy deps (`@xyflow/react`, `dagre`) | **HIDE**; keep for Advanced | Less overlap, smaller bundle | Low |
| Automations | Trigger/condition/action | Overlaps booking, reminders; 1,596-line builder | **MAKE OPTIONAL** under Advanced; expose reminders as a switch instead | One obvious way to remind | Medium: some clinics may want custom rules |
| Broadcasts | Bulk template sends | Useful for recalls, but framed as marketing | **SIMPLIFY** into "Recalls & announcements" | Clear purpose | Low |
| Fields & tags | Custom contact fields | Rarely set up by clinics | **MOVE TO ADVANCED** | Simpler patient view | Low |
| Public API v1, API keys, outbound webhooks | Integrations | Not used by ICP; adds attack surface | **MAKE OPTIONAL** (off by default per install) | Smaller attack surface | Low |
| MCP server (`mcp-server/`) | AI agents controlling the CRM | Irrelevant to clinics | **REMOVE from clinic distribution** (keep in repo) | Less to secure/support | None |
| Korean locale | i18n demo | Not the market | **REPLACE** with Malayalam/Hindi | Adoption | Low |
| Sidebar menu editor (incl. custom sections) | Rename/move/hide nav | Power feature; most clinics need presets | **MOVE TO ADVANCED** (keep) | Fewer settings | Low |
| Access control matrix (6 actions × 25 modules) | Fine-grained roles | Confusing; owners misconfigure | **SIMPLIFY**: preset roles first, matrix under "Customise" | Fewer lock-outs | Low |
| Data scope (half-built) | Branch-level data limits | Partially enforced = false sense of security | **FINISH** (if multi-branch clinics are a target) or **REVERT** | Correctness | Medium either way |
| Lockscreen templates | Branded sign-in | Nice-to-have | **KEEP** (done, cheap) | Brand polish | None |
| Template manager (1,140 lines) | Meta templates | Hard for clinics to write templates | **SIMPLIFY**: ship approved clinic template presets; keep editor under Advanced | Faster approval | Low |

## Trade-offs of the important ones

- **Hiding Automations** removes flexibility for power users. Mitigation: keep it under Advanced, and build reminders, confirmations and reviews as first-class switches that cover about 90% of clinic needs.
- **Hiding Flows** means the booking assistant + AI becomes the only bot. That's a deliberate choice: two bot systems in one inbox confuse staff and create precedence bugs (the webhook already has to order booking → Flows → automations → AI).
- **Turning off the API/webhooks by default** may annoy a technical clinic group. Re-enable per install on request.
- **Reverting data scope** gives up a feature multi-branch chains want. Finish it only if the first customers have several branches with separate staff.

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

# 10 — Pricing and monetization

All figures are **estimates [E]** unless sourced. Competitor prices are third-party reported ([06](06-competitor-analysis.md)). GST (18%) is extra everywhere.

## 1. Cost to serve (per clinic per month) [E]

| Item | Assumption | ₹/month |
|---|---|---|
| Hosting (shared VPS + Supabase Pro share) | 20 clinics per instance; Supabase Pro ~$25 + VPS ~$20 shared | 200–350 |
| Single-tenant install (if one per clinic) | Small VPS + Supabase project | 1,200–2,500 |
| Meta fees | **Pass through at cost**; 300 utility reminders × ₹0.115 ≈ ₹35; service replies free up to 1,000 | 0 to you |
| AI tokens | Clinic's own key (BYO) by default; or bundled: ~600 replies × ~₹0.15 | 0–100 |
| Payment gateway | ~2% of subscription | 40–140 |
| Support (your time) | 1 hour/clinic/month valued at ₹500 | 500 |
| **Total (shared)** | | **~₹750–1,100** |

Implication: below ₹1,500/month the business barely covers support. **Shared multi-tenant hosting is needed for margins.** Single-tenant installs should carry a setup fee and a higher price.

## 2. Model options

| Model | Fit | Verdict |
|---|---|---|
| Freemium | High support cost, low intent in clinics | ❌ |
| **Free trial (14 days, card not required) + paid pilot** | Clinics need to see bookings happen | ✅ |
| **Per-clinic (per-location) monthly** | Matches buyer mental model | ✅ primary |
| Per-user | Penalises adding the doctor | ❌ (include 3–5 seats) |
| Usage-based | Meta fees already usage-based; don't add more | Only Meta pass-through |
| Annual prepay | Indian SMBs accept 2 months free | ✅ |
| Setup fee | Covers WhatsApp migration + data import | ✅ (₹3,000–10,000) |
| White-label/agency | Positioning C | ✅ later |

## 3. Three strategies

**A — Low-cost entry:** ₹999 / ₹1,999. *Pros:* easy yes. *Cons:* margin close to zero after support; signals "cheap tool"; can't afford in-person onboarding. *Risk:* stuck in AiSensy's price band.

**B — Balanced (recommended):** ₹1,999 / ₹3,499 / ₹6,999. *Pros:* at or below WATI/Interakt + AI add-on totals, but includes booking + AI; covers support. *Cons:* above Practo Ray's entry. *Risk:* must prove value in the trial (reports).

**C — Premium:** ₹4,999 / ₹9,999 / custom. *Pros:* fewer, serious clinics; funds a support hire. *Cons:* long sales; needs case studies you don't have. *Risk:* low conversion early.

## 4. Recommended price table (Strategy B)

| Plan | Target | Features | Limits | Monthly | Annual (2 months free) |
|---|---|---|---|---|---|
| **Starter** | 1–2 doctor clinic | Inbox, appointments, WhatsApp booking assistant, reminders & confirmations, clinic hours | 1 branch, 3 staff seats, 2 doctors | **₹1,999** | ₹19,990 |
| **Clinic** (most popular) | 3–5 doctors | Starter + AI assistant with handoff (BYO key or 1,000 bundled replies), reports, review requests, roles | 1 branch, 8 seats, 6 doctors | **₹3,499** | ₹34,990 |
| **Multi-branch** | Groups | Clinic + branches, data scope per branch, branding/lockscreen, priority support | 3 branches (+₹1,500 each extra), 20 seats | **₹6,999** | ₹69,990 |
| **Agency / white-label** | Agencies | Multiple clinics, own brand, sidebar/menu presets | Per clinic | ₹1,200–1,800 per clinic (min 10) + ₹25k setup | Custom |

- **Meta fees:** passed through at cost (show the meter). Say "no markup" loudly. Markups are a common complaint about BSPs [R].
- **Setup:** ₹4,999 one-off (waived on annual), covering WhatsApp migration, doctors/services import and staff training.
- **Trial:** 14 days, or a 30-day paid pilot at ₹999 for the first 10 clinics (validates willingness to pay better than free).
- **Upgrade triggers:** 3rd doctor, 2nd branch, AI bundle exhausted, staff seats.
- **Add-ons:** extra branch ₹1,500; AI reply packs (₹499 per 1,000 bundled replies); Embedded Signup assistance.

## 5. Bottom-up opportunity [E]

| Step | Value | Basis |
|---|---|---|
| Clinics reachable in year 1 (Kerala + 2 metros, dental/derm/physio/eye, 2+ staff) | ~3,000 | [A] founder-reachable estimate, not a census |
| Realistic paying in 12 months | 30–80 | 1–3% of reachable via direct sales |
| Blended ARPU | ~₹3,000 | Mix of plans |
| **MRR at 12 months** | **₹0.9–2.4 lakh** | 30–80 × ₹3,000 |

That's a realistic solo-founder outcome, not a venture-scale market claim.

# 11 — Valuation and sale

> **Disclaimer.** These are estimates for planning, not a formal valuation. Multiples come from third-party broker and marketplace summaries (2026), which often recycle the same data. Indian buyers of small software assets typically pay at or below the low end of global ranges. Treat every figure as ±50%.

## 1. What is being valued

| Component | Exclusive to you? | Notes |
|---|---|---|
| Base CRM (inbox, broadcasts, automations, Flows, API, MCP) | **No**: MIT-licensed public template (wacrm, © Arnas Donauskas). Anyone can fork it free | Must keep the MIT notice in any sale |
| Clinic layer (appointments, booking assistant, slot engine, master data, designations/access control, branding, clinic hours, AI handoff), ~40% of the custom code by our reading | **Yes** | The real IP |
| Brand "Clinicoro", domain, design | Yes, if registered | Trademark not checked |
| Customers / revenue | None | The main value driver is missing |

## 2. Scenario A — source code only (no customers)

Method: **replacement cost of the exclusive layer, discounted** for buyer risk (untested in market, solo-built, public base). Replacement estimate [E]: 2–3 developer-months for the clinic layer at Indian rates (₹1–1.5 lakh/month) is ₹2–4.5 lakh. Buyers typically pay 40–80% of replacement for code without traction.

| Package | Realistic value |
|---|---|
| Source code only | **₹1–2.5 lakh** |
| + documentation (this audit, `docs/`, migrations notes) | ₹1.5–3 lakh |
| + deployment config (Docker, CI, migration runner) | ₹1.5–3.5 lakh |
| + polished product (Phase 0–1 of the roadmap done, demo instance) | ₹3–6 lakh |
| + domain + brand + landing page + demo video | ₹4–8 lakh |

**Buyers:** Indian dev agencies selling to clinics, healthcare marketing agencies, a WhatsApp BSP wanting a clinic vertical. **Risks they price in:** public base code, no customers, solo-maintainer knowledge, critical dependency advisory, half-finished data scope.

## 3. Scenario B — finished SaaS, no customers

- **Market value:** ₹3–8 lakh (as above). Strategic value to a BSP can be higher (₹8–15 lakh) *if* they need a clinic vertical now, but expect a long negotiation.
- **Quick-sale price:** ₹1.5–2.5 lakh (marketplace listing, 2–4 weeks).
- **Realistic asking price:** ₹6–8 lakh with a live demo and docs.
- **Sale barriers:** no revenue proof; MIT base lowers exclusivity; buyer needs Meta/WhatsApp know-how.
- **What increases value most:** 10 paying clinics with 3+ months of retention. That roughly 3–5× the price.

## 4. Scenario C — with revenue

Method: **ARR multiple**, the small-SaaS convention. Multiples applied: **Low 1.5×** (high founder dependency, churn unknown), **Base 2.5×**, **High 4×** (low churn, growth >50%/yr, documented processes). Third-party summaries put micro-SaaS at roughly 2–4× ARR, with marketplaces at 3–5× for strong bootstrapped businesses ([17](17-research-sources.md)). An asset floor (Scenario A) applies at small MRR.

| MRR | ARR | Low (1.5×) | Base (2.5×) | High (4×) |
|---|---|---|---|---|
| ₹10,000 | ₹1.2 L | ₹1.8 L (floor ~₹3 L) | ₹3 L | ₹4.8 L |
| ₹25,000 | ₹3 L | ₹4.5 L | ₹7.5 L | ₹12 L |
| ₹50,000 | ₹6 L | ₹9 L | ₹15 L | ₹24 L |
| ₹1,00,000 | ₹12 L | ₹18 L | ₹30 L | ₹48 L |
| ₹2,00,000 | ₹24 L | ₹36 L | ₹60 L | ₹96 L |
| ₹5,00,000 | ₹60 L | ₹90 L | ₹1.5 Cr | ₹2.4 Cr |

**Assumptions:** monthly logo churn ≤3% for base/high; no single customer >15% of MRR; gross margin >70% (needs shared hosting); founder hands over runbooks. For profitable businesses below ~₹40 lakh ARR, buyers often switch to 2.5–4× annual profit (SDE), which can come out lower than the revenue multiples.

## 5. Scenario D — strategic acquirers

| Acquirer | Why they'd buy | Due-diligence asks |
|---|---|---|
| WhatsApp BSPs (Interakt/WATI/AiSensy tier, or smaller BSPs) | Ready clinic vertical, booking engine | Customer list, churn, Meta compliance, code ownership (MIT notice), security review |
| Clinic software vendors (Practo-like, dental tools) | Native WhatsApp booking they lack (reported) | Integration effort, data model fit, DPDP posture |
| Healthcare marketing agencies | White-label product for their clinic clients | Branding/multi-clinic, support load |
| Entrepreneurs / indie buyers | Cash-flowing micro-SaaS | Revenue proof, hours/week to run |

## 6. Final valuation opinion

| | Conservative | Realistic | Optimistic |
|---|---|---|---|
| Current value (as is) | ₹1 L | ₹2.5 L | ₹4 L |
| Quick-sale value | ₹1 L | ₹1.5–2.5 L | ₹3 L |
| Recommended asking price (after Phase 0–1 + demo) | — | **₹6–8 L** | — |
| Strategic buyer price | ₹5 L | ₹8 L | ₹15 L |
| With 10 paying clinics (~₹30k MRR, 3+ months) | ₹6 L | ₹9 L | ₹14 L |
| At ₹50,000 MRR | ₹9 L | ₹15 L | ₹24 L |
| At ₹1 lakh MRR | ₹18 L | ₹30 L | ₹48 L |

**Honest summary:** commercially it's worth little today, because the code that is exclusively yours is a few months of work on top of a free template. The fastest way to multiply the value is to add paying clinics, not more features.

# 12 — Customer validation plan

Goal: prove within **45 days** that clinics will (1) let patients book via WhatsApp, (2) keep using it after week 2, and (3) pay ₹1,999–3,499/month.

## 1. ICP recap

Dental / dermatology / physio / ENT / eye clinics, 1–5 doctors, 1–3 branches, 20–150 appointments a week, already answering patients on WhatsApp from a shared phone, within travel distance (Kerala first).

## 2. First 10 and first 50

| Wave | Who | How to find |
|---|---|---|
| **First 10** | Clinics you or friends already know; your own dentist/physio; doctors in your family/alumni network | Personal intros, walk-ins with a printed one-pager |
| **Next 40** | Clinics on Google Maps with 50–500 reviews, a WhatsApp click-to-chat link and "book appointment" in reviews | Google Maps search by specialty + city; Practo listings; Instagram clinic pages |
| Channels | Indian Dental Association local branches, dental suppliers' WhatsApp groups, clinic marketing agencies | Offer a 15-minute talk/demo at a branch meeting |

## 3. Likely pain points to probe

Missed after-hours enquiries · time spent fixing appointment times · no-shows · doctor leave clashes · one phone shared by staff · fear of patients being answered wrongly by a bot.

## 4. Outreach

- **WhatsApp/in-person first, email last.** Message: *"Hi Dr X, I built a tool that lets your patients book a free slot with the right doctor directly on WhatsApp, with automatic reminders. Can I show you in 10 minutes at the clinic? If it doesn't save your front desk time, I won't follow up."*
- Visit at a quiet hour (2–4 pm); bring a phone with the demo bot live.

## 5. Demo plan (10 minutes)

1. The prospect sends "book" from *their own phone* to the demo number → picks service, doctor, time → booking appears on the desk calendar live.
2. Show the reminder message and the "1 to confirm" reply.
3. Ask a question the bot can't answer → it hands over → the switch flips to Human, and staff get a notification.
4. Show today's calendar and the doctor's leave blocking slots.
5. Close: "Shall we set it up for your clinic this week? ₹999 for the first month."

## 6. Interview script (problem first, before the demo)

1. How do patients book with you today? Walk me through yesterday.
2. How many WhatsApp messages does the desk handle a day? Who answers after hours?
3. When did a double-booking or no-show last happen? What did it cost?
4. What tools have you tried (Practo, WATI, others)? Why did you keep or drop them?
5. Who decides on software here? What do you pay for software today?
6. If patients could book themselves on WhatsApp, what would worry you?
7. (After demo) What would stop you using this next week?
8. Would you pay ₹1,999 a month for this? ₹3,499 with the AI assistant? (Van Westendorp-lite: too cheap / bargain / getting expensive / too expensive.)

## 7. Pilot program

- **10 clinics, 30 days, ₹999** (credited to the first paid month). Paid pilots filter out polite interest.
- You do setup on-site: WhatsApp connection, hours, doctors, services, 5 approved templates, staff training (45 min).
- Weekly 10-minute check-in on WhatsApp; a shared feedback sheet.

## 8. Feedback process

Keep a Notion/Sheet log for every clinic: weekly bookings by source (bot vs desk), no-shows, handoffs, top 3 complaints. Fix the top issue each week and tell the clinic it was fixed.

## 9. Pricing validation

- Present three plans; record which one they pick and any objection.
- Test anchor: show Clinic ₹3,499 first, then Starter ₹1,999.
- Ask for annual prepay at 2 months free from happy pilots. One annual prepay is strong evidence.

## 10. Success metrics (go/no-go at day 45)

| Metric | Target |
|---|---|
| Pilots started | ≥8 of 10 |
| Clinics with ≥20 bot bookings in 30 days | ≥5 |
| Week-4 active (desk uses inbox/calendar daily) | ≥6 |
| Pilots converting to paid | ≥4 (40%) |
| Average willingness to pay | ≥₹2,500/month |
| AI handoff rate | <35% of bot conversations |

**No-go signal:** fewer than 3 conversions, or clinics use only the inbox (meaning they wanted a cheaper WATI). In that case, pivot towards positioning C (agencies) or the Gulf market.

# 13 — Go-to-market and launch

## 1. The three channels (and why only three)

| Channel | Why | Cost | Expected yield [E] |
|---|---|---|---|
| **1. Direct local sales (walk-in + WhatsApp intros)** | Clinics buy from people they meet; trust and setup are the barrier | Time + travel | 10–20 clinics in 90 days |
| **2. Partnerships: dental suppliers, clinic marketing agencies, IDA branches** | They already visit clinics weekly; give 20% recurring referral | Revenue share | 5–15 clinics/quarter after month 3 |
| **3. Local SEO + Google Business-style content** ("WhatsApp appointment booking for dental clinics in Kochi") | Low-cost compounding; matches buyer search | Writing time | Slow; meaningful after 6 months |

Not now: Product Hunt (wrong audience), paid ads (CAC unknown), Reddit (low clinic-owner presence in India), broad LinkedIn content (keep to a post per week, not a channel).

## 2. Landing page

- **Hero headline:** *Patients book on WhatsApp. Your desk just sees the calendar.*
- **Subheadline:** Clinicoro lets patients pick a real free slot with the right doctor inside WhatsApp, sends reminders automatically, and answers common questions, handing over to your staff whenever it isn't sure.
- **Primary CTA:** "Book a 10-minute demo on WhatsApp" (click-to-chat with the live bot. The demo *is* the product.)
- **Value proposition (3 bullets):** Fewer missed enquiries · Fewer no-shows · One calendar for every doctor and branch.
- **Features:** WhatsApp self-booking · Doctor leaves & clinic hours respected · Reminders & confirmations · Shared inbox with Human/Bot switch · Roles for doctors and receptionists · Your logo and colours.
- **Benefits section:** "Your receptionist stops playing phone tag", "Doctors see their day on the phone", "Owners see bookings and no-shows each month".
- **Demo:** 60-second screen recording: a phone books, and the calendar updates.
- **Pricing:** three plans from [10](10-pricing-monetization.md); "Meta message fees at cost, no markup".
- **Social proof:** start with pilot quotes and photos (with permission); "Set up in N clinics in Kochi".
- **FAQ:** Do I keep my WhatsApp number? · What does WhatsApp charge per message? · What if the bot answers wrongly? (it hands over) · Is patient data safe? · Can I use it with Practo? · Malayalam/Hindi?

## 3. 30-day launch plan (solo founder)

| Week | Activities | Output |
|---|---|---|
| **1** | Phase 0 fixes (Next upgrade, migrations, data scope decision); demo instance with a sample clinic; record 60-s video; one-page PDF | Demo-ready |
| **2** | Landing page (1 page), click-to-chat demo bot; list 60 target clinics; message 20 warm contacts; book 8 visits | 8 meetings |
| **3** | 8 visits + interviews; sign 3–5 paid pilots (₹999); on-site setup | 3–5 pilots live |
| **4** | Daily check-ins; fix top issues; sign 2 partners (supplier/agency); publish 2 SEO pages; ask the best pilot for a quote | First testimonial, pipeline of 20 |

Conversion path: demo → paid pilot (₹999, 30 days) → monthly or annual plan. Track with a simple spreadsheet CRM. Your own product's contacts and pipelines would do, too.

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

# 16 — Final verdict

## Scorecard

Weights: Technical 20%, UI/UX 20%, Product 25%, Market competitiveness 15%, Commercial 20%.

| Category | Score | Evidence | To reach 8+ |
|---|---:|---|---|
| Problem–solution fit | 7 | Booking-in-WhatsApp addresses a real desk pain | Pilot data showing bookings via bot |
| Product usefulness | 7 | Inbox + calendar + bot cover the daily loop | Reminders as a switch |
| Feature completeness | 6 | Strong core; no billing, reminders, onboarding | B-07, B-08, B-09 |
| UI quality | 7 | Modern, tokenised, brandable | Larger text, consistent status chips |
| UX quality | 6 | Booking dialog good; Access control confusing | Preset roles, simpler nav |
| Ease of use | 5 | ~20 destinations, Meta setup by hand | Clinic edition + wizard |
| Workflow efficiency | 7 | Slot snapping, live busy windows | Auto-assign doctor, keyboard flow |
| Onboarding | 3 | Manual Meta IDs/token/PIN | Wizard + Embedded Signup |
| Performance | 7 | Windowed queries, light pages | Bundle check for Flows/charts |
| Reliability | 6 | Defensive parsing; never-throw dispatchers | DB constraint, monitoring |
| Security | 4 | Good primitives, but patient media is publicly listable, plus a critical dependency and coarse role checks | B-00–B-04, MFA |
| Architecture | 7 | Clean lib/route split, two auth paths | Per-account branding |
| Maintainability | 7 | 929 tests, comments explain why | Split giant components |
| Scalability | 6 | Fine to ~100 clinics | Shared limiter, queues later |
| Mobile experience | 5 | Responsive; booking sheet good | Doctor "Today" PWA |
| Accessibility | 6 | ARIA on controls | Text size, non-colour status |
| Reporting & analytics | 4 | Dashboard widgets only | B-17 |
| Integrations | 6 | API, webhooks (upstream) | Payments, calendar sync |
| Differentiation | 6 | Doctor-aware WhatsApp booking + safe AI | Proof via reports |
| Monetization readiness | 1 | No billing | B-08 |
| Retention potential | 6 | Calendar lock-in once used | Reminders + reports |
| Commercial readiness | 2 | No customers, landing, legal | Phase 1 |

**Sub-scores:** Technical 6.6 · UI/UX 6.4 · Product 6.0 · Market competitiveness 4.6 · Commercial 2.4 → **Overall 5.1/10**.

**Stage:** late MVP / private beta. **Biggest strength:** the clinic booking engine on WhatsApp. **Biggest weakness:** no commercial layer (billing, onboarding, customers). **Biggest opportunity:** WhatsApp-native booking is reportedly weak in mainstream clinic software. **Biggest risk:** spreading effort across generic CRM features while a funded BSP adds clinic booking. **Next stage:** paid pilot.

## Direct answers

1. **Is the product good?** Technically, yes, and better than most solo MVPs. As a product, it's unfocused.
2. **Score:** 5.1/10 today; ~7/10 after Phase 0–1 with pilot data.
3. **Real problem?** Yes: missed WhatsApp enquiries, phone tag, no-shows.
4. **Market?** Yes, but price-sensitive and crowded at the CRM layer. The clinic-booking niche is narrower and less crowded.
5. **Most likely to pay:** 1–5-doctor dental/derm/physio/eye clinics with a busy WhatsApp.
6. **Would I pay?** As a clinic owner, at ₹1,999–3,499, yes, once reminders work and I've seen my own patients book. Not today without reminders and billing clarity.
7. **Competitive?** In the clinic-booking-on-WhatsApp niche, yes. As a general WhatsApp CRM, no.
8. **Strongest advantage:** real doctor-aware slots inside WhatsApp, plus an AI that hands over instead of guessing.
9. **Biggest weakness:** commercially, no billing, onboarding or customers. Technically, patient media exposed through a public storage policy, and an unpatched critical framework version.
10. **Remove:** MCP server from the clinic edition; Korean locale.
11. **Simplify:** navigation, Access control (preset roles), templates (presets), broadcasts → recalls.
12. **Missing:** reminders/confirmations, billing, setup wizard, reports, double-booking constraint.
13. **Build next:** B-05 → B-11 → B-07 → B-10 → B-09 → B-08.
14. **Never build:** EMR/prescriptions, native apps before a PWA, a marketing-campaign suite.
15. **Too complicated?** Yes, for a receptionist. Hide about 60% of the navigation.
16. **Ready for launch?** No. It's ready for a hand-held paid pilot after Phase 0 (about 1 week).
17. **Continue, launch, pivot or sell?** **Continue and run paid pilots.** Pivot to agencies (positioning C) only if pilots fail.
18. **Current sale price:** ₹1.5–2.5 lakh realistic; asking ₹6–8 lakh after polish.
19. **Worth in 6–12 months:** with 30–80 clinics (₹0.9–2.4 lakh MRR), roughly ₹15–60 lakh (base ~₹30 lakh at ₹1 lakh MRR).
20. **Top 10 actions:** (0, first) lock down the public `chat-media` bucket; (1) upgrade Next; (2) fix route authorization; (3) DB double-booking constraint + audit log; (4) finish/revert data scope; (5) reminders & confirmations; (6) clinic-edition navigation + preset roles; (7) setup wizard; (8) Razorpay billing; (9) landing page + live demo bot; (10) 10 paid pilots in one city.

# 17 — Research sources

Research performed **20 November 2026** via web search. Most pricing sources are **third-party comparison pages** (often written by competing vendors), not the vendors' own pricing pages. Their figures conflict, so ranges are used throughout. Dates are as shown by the search results where available.

## WhatsApp CRM pricing (India)

| Source | Date | Supports |
|---|---|---|
| [CampaignHQ: Interakt pricing India 2026](https://blog.campaignhq.co/interakt-pricing-india-2026) | 2026 | Interakt plan structure |
| [Mark360: Interakt pricing 2026](https://mark360.ai/blog/interakt-pricing-2026) | 2026 | Interakt tiers, AI add-on |
| [ChatMitra vs Interakt](https://chatmitra.com/chatmitra-vs-interakt/) | Oct 2026 | Growth ₹2,799 / Advanced ₹3,799 |
| [Codingclave: Interakt pricing India 2026](https://codingclave.com/blog/interakt-pricing-india-2026) | Oct 2026 | Starter ₹3,499/quarter |
| [Waaru: Interakt pricing](https://www.waaru.app/interakt-pricing) | 2026 | Add-ons, message rates |
| [Mark360: WATI pricing 2026 India](https://mark360.ai/blog/wati-pricing-2026-india) | 2026 | WATI INR tiers |
| [Codingclave: WATI pricing India 2026](https://codingclave.com/blog/wati-pricing-india-2026) | Oct 2026 | ₹2,999 / ₹6,499 / ₹18,499 |
| [Costbench: WATI](https://costbench.com/software/live-chat/wati/) | 2026 | USD $59–$349 |
| [eesel.ai: WATI pricing](https://www.eesel.ai/blog/wati-pricing) | 2026 | Markups, hidden costs |
| [Mark360: AiSensy pricing 2026](https://mark360.ai/blog/aisensy-pricing-2026) | 2026 | Basic ₹1,500 / Pro ₹3,200 |
| [Codingclave: AiSensy pricing 2026](https://codingclave.com/blog/aisensy-pricing-india-2026) | 2026 | GST, July 2025 price change |
| [WhatSync: WATI vs AiSensy](https://whatsync.app/blog/wati-vs-aisensy) | 2026 | Add-on costs |
| [AiSensy: Basic vs Pro](https://m.aisensy.com/blog/aisensy-basic-vs-pro-plan-which-ones-best-for-you/) | — | Message rates (vendor) |
| [BestSoftware: DoubleTick vs Gallabox](https://www.bestsoftware.co.in/compare/doubletick-vs-gallabox/) | 2026 | Tier prices, seat caps |
| [ConvoBox: Best WhatsApp CRM India](https://www.convobox.in/blog/best-whatsapp-crm-india-2027/) | 2026 | Market crowding |
| [ChatMitra: Best WhatsApp API provider India](https://chatmitra.com/blog/best-whatsapp-api-provider-india/) | 2026 | Vendor landscape |

## Meta WhatsApp fees (India)

| Source | Date | Supports |
|---|---|---|
| [DEV: WhatsApp Business API pricing in India 2026](https://dev.to/xreach51/whatsapp-business-api-pricing-in-india-2026-every-layer-of-the-bill-12i7) | 2026 | Rate layers |
| [DEV: Pricing in rupees and 1 Oct 2026 changes](https://dev.to/preciousky_45d956626d31c3/whatsapp-business-platform-pricing-in-rupees-and-the-two-things-that-change-on-1-october-2026-4ko0) | 2026 | Service-window charging, 1,000 free |
| [Whautomate: rate card](https://whautomate.com/whatsapp-business-api-pricing-india) | 2026 | ₹0.8631 marketing, ₹0.115 utility |
| [Amomic: per-message rates](https://amomic.in/blog/whatsapp-business-api-pricing-india) | 2026 | Worked examples |
| [QuickWA: Meta INR rates](https://quickwa.com/blog/whatsapp-business-api-pricing-india) | 2026 | Consistency check |

*Not verified against Meta's own pricing page.*

## Clinic software

| Source | Date | Supports |
|---|---|---|
| [Getascle: 11 WhatsApp doctor appointment platforms India](https://www.getascleai.com/blog/whatsapp-doctor-appointment-diagnostic-booking-platforms-india-2026) | 2026 | Emerging niche |
| [Curaverto: Best EMR with WhatsApp integration](https://curaverto.com/blog/best-emr-whatsapp-integration-india) | 2026 | WhatsApp capability of EMRs |
| [Curaverto: Dental clinic software cost](https://curaverto.com/blog/dental-clinic-software-cost-india) | 2026 | Price ranges |
| [Dentospire: Best dental software India](https://dentospire.com/blog/best-dental-clinic-software-india-2026) | 2026 | Practo Ray, others |
| [Codingclave: Best dental software 2026](https://codingclave.com/guides/best-dental-clinic-software-india-2026) | 2026 | Dentobees, Simpld prices |
| [CareQ: Appointment scheduling software for clinics](https://careq.amdcode.com/blog/appointment-scheduling-software-clinics-india) | 2026 | Comparison |
| [Cleomitra: CRM for dental clinics](https://www.cleomitra.com/blog/top-10-best-crm-software-dental-clinics-india-2026) | 2026 | Landscape |

## Regulation

| Source | Date | Supports |
|---|---|---|
| [PIB: DPDP Rules 2025 notified](https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf) | Nov 2025 | Official: 18-month phase-in |
| [Taxmann: DPDP Act and Rules analysis](https://www.taxmann.com/post/blog/analysis-indias-dpdp-act-and-rules) | 2025–26 | Obligations |
| [Corpus Juris: DPDP phased timeline](https://www.corpusjurislegal.com/resources/legal-updates/dpdp-rules-notification-2026) | 2026 | ~May 2027 core duties |
| [Cybersigma: DPDP Rules 2025](https://cybersigmacs.com/blog/dpdp-rules-2025-what-enterprises-must-build/) | 2026 | Consent managers Nov 2026 |

## Security advisories

| Source | Date | Supports |
|---|---|---|
| [Next.js: August 2026 security release](https://nextjs.org/blog/august-2026-security-release) | Aug 2026 | Windows RCE + AVIF; fixed 15.5.24/16.3.3 |
| [Vercel changelog: Next.js August 2026 security release](https://vercel.com/changelog/nextjs-august-2026-security-release) | Aug 2026 | Same |
| [CSA research note: Next.js AVIF/Windows RCE](https://labs.cloudsecurityalliance.org/research/csa-research-note-nextjs-avif-windows-rce-cve-2026-75604-202/) | Aug 2026 | CVE-2026-75604 details |
| [The Hacker News: Next.js out-of-band patch](https://thehackernews.com/2026/10/nextjs-ships-out-of-band-patch-for-two.html?hl=ru) | Oct 2026 | Oct critical fixes (16.4.1) |
| [GitLab advisory GHSA-2xp9-vwfh-vxw4](https://advisories.gitlab.com/npm/next/GHSA-2xp9-vwfh-vxw4/) | 2026 | AVIF advisory |

## Valuation

| Source | Date | Supports |
|---|---|---|
| [BigIdeasDB: SaaS valuation guide 2026](https://bigideasdb.com/saas-valuation-guide-2026) | 2026 | Acquire.com median ~3.9× profit |
| [AppsOnBid: Micro-SaaS multiples 2026](https://www.appsonbid.com/blog/micro-saas-valuation-multiples-2026) | 2026 | 2–3.5× ARR |
| [Livmo: How to value a micro-SaaS](https://livmo.com/blog/micro-saas-valuation/) | 2026 | SDE vs ARR threshold |
| [Founderpath: SaaS multiples](https://founderpath.com/blog/saas-multiples) | 2026 | General ranges |
| [CT Acquisitions: SaaS multiples 2026](https://ctacquisitions.com/saas-business-valuation/) | 2026 | Size bands |

## Code evidence (internal)

`LICENSE` (MIT, © 2026 Arnas Donauskas); `git log` (739 commits; 601 upstream author, 38 repository owner); `npm audit --omit=dev` (23 advisories: 2 critical, 11 high, 10 moderate) run 20 Nov 2026.
