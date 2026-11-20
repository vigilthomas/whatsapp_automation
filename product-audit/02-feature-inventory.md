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
