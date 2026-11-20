# Clinicoro — SaaS Security Audit report

**Audit date:** 20 November 2026 · **Product:** Clinicoro (wacrm fork) · **Prepared for:** product owner

> Static assessment of the repository. No live exploitation, no production access, no signed-in dynamic testing. Areas marked NOT TESTED were not verified. This is not legal advice.

This master document combines the individual reports in this folder, in reading order.

# 00 — Executive summary (security)

**Application:** Clinicoro (wacrm fork) · **Assessed:** 20 November 2026 · **Scope:** the full repository at `feat/migrations-and-booking` plus uncommitted work (including the clinic, AI and lockscreen features added on 20 Nov), Supabase migrations 001–061, Docker/CI config and dependencies.
**Method:** manual code and SQL review, dependency audit (`npm audit --omit=dev`), route inventory, unit test run (929 passing), public pages loaded in a local browser. **No live exploitation and no production access.** Signed-in flows were not exercised dynamically.

## Verdict: **HIGH RISK — major fixes required**

The application has solid security *primitives*: webhook HMAC, hashed API keys, encrypted tokens, RLS on every tenant table, an SSRF guard, security headers. But it has one critical data-exposure issue and several authorization gaps that must be fixed before real patient data is handled.

| Severity | Count | Findings |
|---|---:|---|
| Critical | 1 | F-01 public listing of the `chat-media` bucket containing mirrored inbound patient media |
| High | 3 | F-02 Next.js advisories · F-03 any member can delete/edit templates on Meta · F-04 designation matrix not enforced on upstream routes |
| Medium | 7 | F-05 WhatsApp config exposure/write path · F-06 half-built data scope · F-07 CSP report-only · F-08 no MFA · F-09 dependency surface · F-11 double-booking race + no audit log · F-16 no export/erasure (DPDP) |
| Low | 5 | F-10 rate limiting · F-12 PostgREST filter strings · F-13 AI data transfer · F-14 avatar/flow buckets listable · F-15 silent RLS failures |

Full details: [15-vulnerability-register.md](15-vulnerability-register.md).

## Security score: **5.0 / 10** (see [17-final-security-verdict.md](17-final-security-verdict.md))

## Must fix immediately (before any clinic uses it with real patients)

1. **F-01:** remove the open SELECT policy on `storage.objects` for `chat-media`; move inbound media to a private bucket.
2. **F-02:** upgrade Next.js.
3. **F-03:** permission checks before Meta template calls.
4. **F-04:** `requirePermission` on broadcast/send/automations/flows/quick-replies/templates routes.

## Not tested

Supabase Auth settings (password policy, email confirmation, login rate limits, session lifetime) live in the Supabase dashboard, not the repo. Production infrastructure (reverse proxy, TLS, backups) wasn't examined. No dynamic tests of signed-in flows were run.

# 01 — Attack surface and architecture

## Components and trust boundaries

```
 Patient (WhatsApp) ──► Meta Cloud API ──► POST /api/whatsapp/webhook  [HMAC: META_APP_SECRET]
                                               │  (service role, account resolved from phone_number_id)
                                               ├─► booking assistant (lib/booking/runner.ts)
                                               ├─► Flows / automations
                                               ├─► AI assistant (lib/ai-chat/runner.ts) ──► Anthropic / OpenAI (clinic key)
                                               └─► mirror media ──► Supabase Storage `chat-media` (PUBLIC)  ◄── F-01

 Staff browser ──► Next.js pages + /api/* (cookie session, middleware) ──► Supabase (RLS, anon key + user JWT)
                       │                          └─► service-role client (after requirePermission / requireRole)
                       └─► Supabase directly from the browser (contacts search, dashboard, branding, storage uploads)

 Integrators ──► /api/v1/* (Bearer wacrm_live_… API key, scopes, rate limit) ──► service role + explicit account_id
 Outbound ──► customer webhooks (HMAC-signed, SSRF guard) · Meta Graph API · LLM providers
 Cron ──► /api/automations/cron, /api/flows/cron  [CRON_SECRET]
 Public ──► /login, /signup, /forgot-password, /join/<token>, /api/invitations/<token>/peek|redeem
```

| Boundary | Enforced by |
|---|---|
| Internet → app | Next.js middleware (session redirect), security headers |
| User → tenant | `account_id` + RLS (`is_account_member`); service-role paths must filter manually |
| Role → function | `requirePermission` (designation matrix) on newer routes; `requireRole` (coarse) on upstream routes (F-04) |
| Meta → app | HMAC-SHA256 signature on raw body |
| API client → app | Hashed API keys, scopes, per-key rate limit |
| App → storage | Bucket policies (F-01, F-14) |
| App → LLM | Clinic's own key, facts-only prompt, no tools |

## Entry points

| Type | Count | Notes |
|---|---:|---|
| Public pages | 4 | login, signup, forgot-password, join |
| Public API endpoints (no session) | 5 | webhook (HMAC), cron ×2 (secret), invitation peek/redeem (token) |
| Session-authenticated `/api/*` | 37 files | see [04-api-security.md](04-api-security.md) |
| API-key `/api/v1/*` | 11 files | scopes enforced |
| Direct browser → Supabase | many | RLS is the only control |
| Storage buckets | 3 | `avatars`, `flow-media`, `chat-media` (all public, listable) |

## Sensitive data

Patient names and phone numbers (contacts), message content (may include symptoms), **media (prescriptions, reports, photos, voice)**, appointments (health context by service/doctor), staff accounts, WhatsApp access token (encrypted), AI provider key (encrypted), API key hashes, invitation token hashes.

## Request lifecycle example (appointment update)

Client → `PATCH /api/appointments/:id` → `requirePermission('appointments','edit')` (session → profile → designation matrix) → `validateAppointmentInput` (whitelisted fields) → `assertRefsInAccount` (FK ids belong to the account) → service-role update `.eq('id').eq('account_id')` → response. **Controls present at every step.** Missing: a DB-level overlap constraint and an audit event (F-11).

# 02 — Authentication

| Area | Implementation | Assessment |
|---|---|---|
| Registration | Supabase Auth `signUp` (`(auth)/signup`) | Standard. Email confirmation setting **not tested** (dashboard config) |
| Login | `signInWithPassword` then full-page redirect (`login/page.tsx`) | Errors show Supabase's message ("Invalid login credentials"), which is generic and doesn't enumerate accounts |
| Password storage | Supabase (bcrypt) | Never handled by app code ✅ |
| Password policy | Supabase dashboard | **NOT TESTED**. Recommend min 10 chars + leaked-password check (Supabase Pro feature) |
| Password reset | `forgot-password` → Supabase recovery link | Token lifetime/one-time use handled by Supabase; **not tested** |
| Brute force | Supabase Auth rate limits | **NOT TESTED** (not in repo); app adds none on sign-in |
| Logout / session revocation | Supabase `signOut`; Settings → Login & security offers sign-out of devices | ✅ (UI present) |
| Session handling | `@supabase/ssr` cookies, refreshed in `middleware.ts` (copies refreshed cookies onto every response, issue #288) | Correct pattern. Cookies are JS-readable by design (see F-07) |
| MFA | None | **F-08 (Medium)**: owners, admins and the super admin should require TOTP |
| Invitations | Random token, SHA-256 at rest, rate-limited peek/redeem | ✅ |
| Staff created by admin (Master → Users) | `api/account/users` with `requirePermission('users','write')`, service role creates the auth user with a password set by the admin | Admin knows the staff password. Recommend forcing a password change at first login |
| Super admin | `super_admins` table, no app write path, `is_super_admin()` SECURITY DEFINER | ✅ Strong: can't be self-granted |
| Privilege columns | Trigger blocks members changing `account_role`, `designation_id`, `branch_id`, etc. on their own profile | ✅ |
| Re-authentication for sensitive actions | None (ownership transfer, member removal, WhatsApp token change) | Medium: require recent sign-in or MFA |

**Recommendations:** enable MFA (AAL2) for admin-class actions; set the Supabase password policy and leaked-password protection; force a password change for admin-created staff; add re-auth before ownership transfer and WhatsApp/AI key changes.

# 03 — Authorization, IDOR/BOLA and tenant isolation

## Model

- **Account role** (`owner > admin > agent > viewer`), mirrored in SQL (`is_account_member`) and TS (`roles.ts`).
- **Designation matrix** (`permissions.ts`): per module × action (view/read/write/edit/delete/export), enforced server-side by `requirePermission` (`permission-guard.ts`). Super admin is never restricted; an owner without a designation gets everything.
- **RLS** on every tenant table keyed on `account_id`.

## Object-level checks (IDOR/BOLA)

| Resource | Read | Write | Result |
|---|---|---|---|
| Appointments `/api/appointments/:id` | RLS client | service role `.eq('id').eq('account_id')` + FK refs validated (`assertRefsInAccount`) | **PASS** (code) |
| Master records `/api/master/:entity/:id` | RLS | service role + `account_id` + ref check (`master/server.ts`) | **PASS** |
| Members `/api/account/members/:userId` | — | `requirePermission('users',…)`, account filter | **PASS** |
| Conversation AI mode `/api/conversations/:id/ai-mode` (new) | service role + `account_id` | same | **PASS** |
| Clinic settings / AI settings (new) | account-derived (no client id) | upsert keyed by `ctx.accountId` | **PASS** |
| Templates `/api/whatsapp/templates/:id` | RLS + account | **no role check before Meta call** | **FAIL** (F-03, BFLA) |
| Media proxy `/api/whatsapp/media/:mediaId` | session + account config | Meta fetch with account's token | PARTIAL: a member could proxy any media id known to their own WABA only. Acceptable |
| Storage objects `chat-media` | **public SELECT policy** | account-folder INSERT/UPDATE | **FAIL** (F-01) |
| v1 API objects | `requireApiKey` + `.eq('account_id', ctx.accountId)` | same | **PASS** (code review of contacts, conversations, messages, webhooks) |

## Function-level checks (BFLA)

Routes protected by `requireRole` only (designation ignored, F-04): `whatsapp/broadcast`, `whatsapp/broadcast/:id/resume`, `whatsapp/send`, `whatsapp/react`, `automations/*`, `flows/*`, `quick-replies/*`, `contacts/:id/tags`, `whatsapp/templates/submit|sync`. Routes with **only a session check:** `flows/:id/runs` (GET), `flows/templates` (GET), `whatsapp/templates/:id` (PATCH/DELETE → F-03), `whatsapp/config` (POST/DELETE, RLS-limited → F-05).

## Privilege escalation

| Vector | Result |
|---|---|
| Edit own `account_role`/`designation_id` via profile update | Blocked by trigger ✅ |
| Grant self permissions via `PATCH /api/master/designations/:id` | Requires `designations:edit` ✅; an admin with that right can grant themselves anything (by design; log it, F-11) |
| Become super admin | No write path ✅ |
| Mass assignment on appointments/master | Whitelisted fields (`validateAppointmentInput`, `sanitizeMasterInput`) ✅ |
| Mass assignment on AI settings | Explicit field mapping; `handoff_agent_id` verified as an account member ✅ |

## Role → permission matrix (defaults without a designation)

| Role | Domain data (read) | Create/Edit | Delete | Settings-class | Clinic settings | AI assistant settings |
|---|---|---|---|---|---|---|
| Owner | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Admin | ✅ | ✅ | ✅ | ✅ (RLS admin) | ❌ unless granted | edit needs module + admin ✅ |
| Agent | ✅ | ✅ | ❌ | ❌ | ❌ | toggle chat mode only |
| Viewer | ✅ | ❌ | ❌ | ❌ | ❌ | view only |

Inconsistency: on F-04 routes an `agent` can act even if their designation removes the module.

## Tenant-isolation matrix (two tenants, A and B)

| Test | Expected | Result |
|---|---|---|
| A reads B's appointment by id (session) | 404 | PASS (RLS/filters; code) |
| A patches B's appointment id | 404 | PASS (code) |
| A sets `doctor_id`/`branch_id` of B in a payload | 400 | PASS (`assertRefsInAccount`) |
| A's API key reads B's contact id | 404 | PASS (code) |
| Webhook for A's number writes into A only | Account from `phone_number_id` | PASS (code) |
| **Anonymous lists B's media** | Denied | **FAIL (F-01)** |
| A's member lists B's `chat-media` folder | Denied | **FAIL (F-01)** |
| Background jobs (cron) keep tenant context | Rows carry `account_id` | PASS (code review, not executed) |

# 04 — API security

## Inventory (session-authenticated `/api/*`)

| Endpoint | Methods | Auth / authorization | Rate limit | Risk |
|---|---|---|---|---|
| `account` | GET, PATCH | session; PATCH `requireRole('admin')` | ✅ | Low |
| `account/api-keys`, `/:id` | GET, POST, DELETE | admin | ✅ | Low |
| `account/invitations`, `/:id` | GET, POST, DELETE | admin | ✅ | Low |
| `account/members`, `/:userId` | GET, PATCH, DELETE | session / `users:edit|delete` | ✅ | Low |
| `account/users` | POST | `users:write` | ✅ | Low |
| `account/transfer-ownership` | POST | owner | ✅ | Medium (no re-auth) |
| `appointments`, `/:id` | GET, POST, PATCH, DELETE | `appointments:*` | ❌ | Low |
| `master/:entity`, `/:id` | GET, POST, PATCH, DELETE | `<module>:*` | ❌ | Low |
| `booking/settings` | GET, PUT | `automations:read|edit` | ❌ | Low |
| `clinic-settings` (new) | GET, PUT | session / `settings-clinic:edit` | ❌ | Low |
| `ai/settings` (new) | GET, PUT | `ai-assistant:read`; PUT `ai-assistant:edit` + admin role | ❌ | Low |
| `conversations/:id/ai-mode` (new) | GET, PATCH | `ai-assistant:read|edit` | ❌ | Low |
| `automations/*`, `flows/*`, `quick-replies/*`, `contacts/:id/tags` | various | `requireRole('agent')` only | ❌ | **Medium (F-04)** |
| `flows/:id/runs`, `flows/templates` | GET | session only | ❌ | Low (RLS-bounded reads) |
| `whatsapp/send`, `whatsapp/react` | POST | `requireRole('agent')` | ❌ | **Medium (F-04, F-10)** |
| `whatsapp/broadcast`, `/:id/resume` | POST | `requireRole('agent')` | ❌ | **High** (cost abuse; F-04) |
| `whatsapp/templates/submit|sync` | POST | admin | ❌ | Low |
| `whatsapp/templates/:id` | PATCH, DELETE | **session only** | ❌ | **High (F-03)** |
| `whatsapp/config` | GET, POST, DELETE | session; RLS admin on write | ❌ | Medium (F-05) |
| `whatsapp/config/verify-registration` | GET | session | ❌ | Low |
| `whatsapp/media/:mediaId` | GET | session + account token | ❌ | Low |
| `whatsapp/webhook` | GET, POST | verify token / HMAC | n/a | Low ✅ |
| `automations/cron`, `flows/cron` | GET | `CRON_SECRET` | n/a | Low (ensure secret is long and random) |
| `invitations/:token/peek|redeem` | GET, POST | token (hashed) | ✅ | Low |

## Public API `/api/v1/*`

Bearer API key → `requireApiKey(request, scope)`: SHA-256 lookup, timing-safe compare, scope check, per-key rate limit; then a service-role client with **explicit `account_id` filters** on every query (verified for contacts, conversations, messages, broadcasts, webhooks). Envelope `{data}`/`{error}`; keyset pagination (`lib/api/v1/pagination.ts`) bounds result size. Search is sanitised (`sanitizeSearch`). **Assessment: good.**

## OWASP API Top 10 mapping

| Risk | Status |
|---|---|
| API1 BOLA | Mostly PASS; FAIL for storage (F-01) |
| API2 Broken authentication | PASS in code; Supabase settings not tested |
| API3 Broken object property level authorization (mass assignment) | PASS: whitelisted inputs on new routes |
| API4 Unrestricted resource consumption | PARTIAL: no limits on send/broadcast/AI (F-10) |
| API5 BFLA | FAIL: F-03, F-04 |
| API6 Sensitive business flows | PARTIAL: broadcast cost abuse; bot reply cap ✅ |
| API7 SSRF | PASS for outbound webhooks (SSRF guard); AI provider URLs are fixed constants ✅ |
| API8 Misconfiguration | PARTIAL: CSP report-only (F-07), public buckets (F-01) |
| API9 Inventory | This document; no deprecated/shadow endpoints found |
| API10 Unsafe consumption of APIs | Meta/LLM responses are parsed defensively (`parseModelReply`, template webhook parser) ✅ |

## Excessive data exposure

- `whatsapp_config` rows (encrypted token, verify token) are readable by all members through RLS (F-05).
- `GET /api/ai/settings` returns `has_key`, never the key ✅.
- `account/members` hides emails from agents/viewers (comment in `automation-builder.tsx`) ✅.

# 05 — Database security and SQL injection

## SQL injection

| Location | Pattern | Verdict |
|---|---|---|
| All app queries | Supabase JS (PostgREST): parameters sent as URL-encoded filter values, not SQL | No SQL injection path found |
| Raw SQL | Only in migrations (static) and `rpc()` calls with typed arguments (`claim_ai_reply_slot`, `can_edit_branding`, …) | Safe |
| Dynamic SQL in functions | `055` uses `EXECUTE format('… %I …', tbl)` over a **hard-coded** table list | Safe (identifiers quoted, no user input) |
| PostgREST `.or()` strings | `contacts/page.tsx`, `appointment-dialog.tsx` interpolate search text; `/api/v1/contacts` sanitises first | **Filter injection (not SQL)**, bounded by RLS to the caller's own account: **Low (F-12)** |
| Sorting / pagination | Fixed columns; v1 keyset cursors are opaque and validated | Safe |
| Master entity table names | Chosen from a server-side registry (`MASTER_ENTITIES[slug]`) after `isMasterEntitySlug` | Safe |

**Safe reproduction for F-12 (local):** search contacts for `x,name.neq.zzz`. More rows return than the literal text should match, but only your own account's rows. Fix: reuse `sanitizeSearch`.

## Database privileges and RLS

| Check | Result |
|---|---|
| RLS enabled on every tenant table | ✅ (migration review) |
| Membership helper `is_account_member` SECURITY DEFINER with `search_path` pinned, owned by postgres | ✅ |
| `super_admins` unreadable by clients (no policies, privileges revoked) | ✅ |
| New tables `clinic_settings` (060): SELECT members only; INSERT/UPDATE/DELETE revoked; writes via API | ✅ |
| `conversations.ai_mode` (061): column added under existing RLS | ✅ |
| Service-role key only on the server (`SUPABASE_SERVICE_ROLE_KEY`, never `NEXT_PUBLIC_`) | ✅ |
| App DB user privileges | The service role bypasses RLS by design; every service-role query must filter `account_id`. Spot-checked: appointments, master, AI runner, clinic, booking runner ✅ |
| **Storage RLS** | **FAIL**: public SELECT policies on `chat-media`, `avatars`, `flow-media` (F-01, F-14) |
| Error leakage | Routes return `error.message` from PostgREST (e.g. constraint names) | Low: acceptable for an internal app; avoid on public v1 (already enveloped) |

## Integrity

- No overlap constraint for a doctor's appointments (race between desk and bot): **F-11**.
- Soft delete on master data keeps referential history ✅. Hard delete on appointments (`DELETE /api/appointments/:id`) loses history; prefer status `cancelled` plus an audit row.
- Migration 058 is missing from the sequence (reserved for data scope). The runner must not assume contiguous numbering.

## Backups

Not in the repository. **NOT TESTED.** Supabase Pro offers daily backups and PITR as an add-on. For health data, enable PITR and test a restore quarterly.

# 06 — Tokens, sessions and cookies

| Credential | Generation | Storage | Validation | Lifetime/rotation | Assessment |
|---|---|---|---|---|---|
| Supabase access JWT + refresh token | Supabase Auth | `sb-*` cookies via `@supabase/ssr` (JS-readable) | Server `auth.getUser()` re-validates with Supabase (not just decoding) ✅ | Supabase defaults (1 h access; rotating refresh) | Good; the XSS impact is amplified because cookies aren't HttpOnly (F-07) |
| API keys `wacrm_live_…` | 32 random bytes, base64url | SHA-256 hash in DB | timing-safe compare, scopes | Revocable; no expiry by default | Good; recommend optional expiry |
| Invitation tokens | random | SHA-256 hash | hash lookup, expiry | single-use redeem | Good |
| WhatsApp access token | from Meta (user-supplied) | AES-256-GCM (`ENCRYPTION_KEY`) | decrypted server-side only | manual rotation | Good; ciphertext readable by members (F-05) |
| AI provider key (new) | user-supplied | AES-256-GCM | server-side only; never returned | replace by re-entering | Good |
| Webhook verify token | user-chosen | plaintext column | compared on GET handshake | static | Low risk; readable by members |
| Outbound webhook secrets | generated | stored for signing | HMAC on delivery | rotatable | Good |
| `CRON_SECRET` | env | env | header compare | static | Ensure ≥32 random chars; compare in constant time |

## Cookie attributes

`@supabase/ssr` sets `SameSite=Lax`, `Secure` in production, `Path=/`. Not `HttpOnly`, because the browser client reads them. Middleware refreshes and copies cookies on every response (prevents the session wedge in issue #288) ✅.

## Logout and revocation

- Sign-out clears local cookies; "sign out of other devices" exists in Settings → Login & security.
- **Gap:** changing a member's designation or removing them doesn't revoke their live session. The next API call re-reads permissions (`loadPermissions` on each request), so authorization changes take effect immediately ✅, but a removed member's JWT stays valid until expiry. Profile/account lookups then fail closed (no account) ✅.

## JWT-specific checks

Algorithm confusion, weak secrets, and audience/issuer checks are delegated to Supabase (`getUser` calls the Auth server). There is no custom JWT handling in the code ✅.

# 07 — Input validation, XSS, injection

## Validation by entry point

| Input | Validation | Verdict |
|---|---|---|
| Appointment body | `validateAppointmentInput`: whitelisted keys, ISO dates, end > start, status enum | ✅ |
| Master records | `sanitizeMasterInput` per field type; refs checked in account | ✅ |
| Designation permissions JSON | `parsePermissions`: known modules/actions only, de-duplicated | ✅ |
| Clinic settings (new) | `parseClinicSettings`: time/date regexes, length caps, list caps | ✅ |
| AI settings (new) | provider enum, model regex, key length, 1–20 cap, instructions ≤4,000 | ✅ |
| Booking config | `parseBookingConfig` with limits | ✅ |
| Branding | hex colours, logo type sniffing (`sniffImage`), 512 KB cap, https-only links | ✅ |
| Sidebar menu JSON | `resolveMenu`/`customGroupsOf` sanitise on read (ids, labels, icon allow-list) | ✅ Written from the browser under RLS (`can_edit_branding`) |
| WhatsApp config POST | presence checks; PIN regex | Partial (F-05) |
| Contacts CSV import | client-side parse, server insert under RLS | Acceptable |
| Search boxes | see F-12 | Low |

## XSS

- React escapes all rendered strings. **No user-controlled `dangerouslySetInnerHTML`**: the four uses render static theme boot code (`layout.tsx`) and developer-authored translation strings (`whatsapp-config.tsx`, `import-modal.tsx`).
- Message bubbles render text as text. Links are formatted without raw HTML (spot-checked `message-bubble.tsx`).
- The logo can be an SVG uploaded as a data URL and is rendered via `<img src>`, so scripts inside the SVG don't execute in `<img>` context ✅.
- CSP is report-only (F-07).

**Result: no exploitable XSS found (code review, not fuzzed).**

## Other injection classes

| Class | Finding |
|---|---|
| Command injection | No `child_process` use in app code ✅ |
| Path traversal | Storage paths built by `buildMediaPath` from sanitised names (`[^a-zA-Z0-9_-]` stripped) under `account-<id>/` ✅ |
| SSRF | Outbound webhooks validated by `lib/webhooks/ssrf.ts` (private, link-local, metadata blocked). Logo links are https-only but fetched by the *browser*, not the server ✅. AI and Meta URLs are constants ✅ |
| Open redirect | Login redirects to `/dashboard` or `/join/<encoded token>` only ✅ |
| Template injection | None (no server templating of user strings) |
| Prompt injection (AI) | Possible to make the bot say odd things to the same patient; no tools or data to exfiltrate; output must parse as JSON or it hands off (F-13, Low) |
| Header/CRLF injection | No user input in response headers found |
| Unsafe deserialisation | Only `JSON.parse` of trusted/validated payloads ✅ |

# 08 — Rate limiting and abuse protection

**Implementation:** `src/lib/rate-limit.ts`, a fixed-window in-memory Map per process (documented as single-instance only).

| Endpoint group | Limited? | Abuse risk | Recommended limit |
|---|---|---|---|
| Supabase sign-in/sign-up/reset | Supabase Auth (not in repo) | Credential stuffing, email bombing | **NOT TESTED**: confirm in the Supabase dashboard (e.g. 30 sign-ins/5 min/IP, 3 reset emails/hour/address); enable CAPTCHA on sign-up |
| Account, members, invitations, API keys | ✅ | Low | — |
| Invitation peek/redeem (public) | ✅ | Token guessing (infeasible, 32-byte tokens) | — |
| `/api/v1/*` | ✅ per key | Scraping | Keep |
| `whatsapp/broadcast` | ❌ | **Cost abuse**: thousands of marketing messages at ~₹0.86 each | 5 broadcasts/hour/account; recipient cap per plan |
| `whatsapp/send`, `react` | ❌ | Spam from a compromised agent account | 60/min/user |
| AI assistant (webhook-driven) | Per-chat reply cap via `claim_ai_reply_slot` ✅ | Token cost if a patient floods the chat | Also cap per account per day |
| `conversations/:id/ai-mode` | ❌ | Low | 30/min/user |
| `appointments`, `master`, `clinic-settings` | ❌ | Low (authenticated) | 120/min/user |
| `whatsapp/webhook` | ❌ (HMAC protects authenticity) | Replay of valid deliveries: duplicates are deduplicated by the `(conversation_id, message_id)` unique index (037) ✅ | — |
| Cron routes | Secret | — | — |

## Bypass considerations

- In-memory limits reset on restart and aren't shared across instances. Use Upstash/Redis before horizontal scaling.
- IP-based keys behind a proxy depend on trusting `X-Forwarded-For` only from your proxy. Configure the reverse proxy to overwrite, not append, client-supplied values.

No high-volume tests were run (by rule).

# 09 — File upload and storage

## Buckets

| Bucket | Public | Contents | Write policy | Read/list policy | Verdict |
|---|---|---|---|---|---|
| `chat-media` | **Yes** | Outbound media staff send; **inbound patient media mirrored by default (039)** | account folder (`account-<id>/`) for members | `FOR SELECT USING (bucket_id='chat-media')`, **everyone incl. anon** | **Critical (F-01)** |
| `flow-media` | Yes | Flow builder images/docs | account folder | public SELECT | Low (F-14) |
| `avatars` | Yes | Staff profile photos | user folder | public SELECT | Low (F-14) |

## Upload controls

| Control | Status |
|---|---|
| Size limits | Bucket `file_size_limit` set in migrations ✅ |
| MIME allow-list | Bucket `allowed_mime_types` ✅; branding logo also sniffs magic bytes (`sniffImage`) ✅ |
| Filename handling | `buildMediaPath` strips to `[a-zA-Z0-9_-]`, max 40 chars, adds timestamp/id ✅ |
| Path traversal | Not possible: names sanitised; folder enforced by RLS on INSERT ✅ |
| Overwrite | Members can UPDATE objects in their account folder (needed for re-upload). Acceptable |
| Executable content | Served by Supabase Storage with the stored content type from a separate origin, not the app origin ✅. SVG allowed for logos (stored as data URL in the branding row, rendered via `<img>`) ✅ |
| Malware scanning | None (Low; patients send files to staff, and staff open them locally) |
| Archive bombs | Not processed server-side ✅ |

## Downloads

- **Inbound (pointer mode)** `/api/whatsapp/media/:mediaId`: session + account's token, streams from Meta ✅.
- **Mirrored inbound & outbound:** public URLs. Anyone with the URL can download, and with F-01 anyone can **enumerate** URLs.

## Remediation (F-01, priority 0)

```sql
-- 1. Stop anonymous/cross-tenant listing (public object URLs keep working for Meta).
DROP POLICY IF EXISTS "Chat media is publicly readable" ON storage.objects;
CREATE POLICY "Members list their chat media" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'chat-media' AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]));
-- Same for flow-media and avatars.
```

2. Create a **private** bucket `patient-media` for the inbound mirror; serve it only through the authenticated media route or 5-minute signed URLs. Migrate existing `account-*/inbound/*` objects.
3. Decide retention for mirrored media (e.g. 2 years, or the clinic's records policy) and add a purge job.
4. Verify: an anon list returns empty; account B can't list A; outbound media still reaches Meta.

# 10 — Business logic security

| # | Workflow | Abuse / failure | Evidence | Impact | Severity | Fix |
|---|---|---|---|---|---|---|
| BL-1 | Booking (desk + WhatsApp bot) | Two bookings for the same doctor and time when booked concurrently; availability is checked in app code only | `booking/slots.ts` `isFree` then insert; no DB constraint | Double-booked patients, clinic trust | Medium (F-11) | Exclusion constraint + retry message |
| BL-2 | Broadcasts | A low-privilege agent (designation without Broadcasts) sends to all patients | `whatsapp/broadcast` uses `requireRole('agent')` | Marketing fees (~₹0.86/msg), spam reports, number quality rating drop | High (F-04) | `requirePermission('broadcasts','write')`, per-plan caps, confirmation for >500 recipients |
| BL-3 | Templates | Viewer deletes an approved reminder template at Meta | F-03 | Reminders stop; re-approval takes days | High | Permission before Meta call |
| BL-4 | AI assistant | Patient floods chat → token cost; or provokes off-policy replies | Reply cap per chat ✅, facts-only prompt, JSON-or-handoff ✅ | Cost, reputational | Low | Daily account cap; log AI decisions |
| BL-5 | AI handoff | Handoff assigns to a member who later leaves | `handoff_agent_id` FK `ON DELETE SET NULL`; membership checked on save, not at handoff time | Chat assigned to a non-member, no notification | Low | Re-check membership at handoff; fall back to owner |
| BL-6 | Appointment status | Any editor can move completed → scheduled, or delete history | No transition rules; hard DELETE route | Data integrity / dispute evidence | Medium | Allowed transitions; soft delete; audit log |
| BL-7 | Invitations | Reusing or forwarding links | Hashed, expiring, single-use ✅ | — | Info | — |
| BL-8 | Clinic hours | Staff book on a closed day (intended override) | Dialog warns, server accepts | Intentional | Info | Optionally require edit permission to book on closed days |
| BL-9 | Ownership transfer | Hijacked owner session transfers ownership | `requireRole('owner')`, no re-auth | Account takeover persistence | Medium | Re-auth/MFA before transfer |
| BL-10 | Subscription/trial | n/a: no billing yet | — | — | — | Design plan limits server-side when billing ships (never trust the client's plan) |
| BL-11 | Chat Human/Bot switch | Agent turns Bot on for a chat the clinic wanted human-only | Requires `ai-assistant:edit` ✅ | Low | Low | Log mode changes |

# 11 — Infrastructure, configuration and secrets

## Secrets

| Check | Result |
|---|---|
| `.env.local` committed? | No: git-ignored (`git check-ignore` confirms) ✅ |
| Example env files | `.env.local.example`, `mcp-server/.env.example`: placeholders only (variable names: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ENCRYPTION_KEY`, `META_APP_SECRET`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_LOCALE`) ✅ |
| Git history scan (Anthropic/OpenAI/Meta token and service-role JWT patterns) | 1 hit: a **false positive** inside minified `public/opus/encoderWorker.min.js`. No real secrets found ✅ |
| Service-role key exposure | Server-only variable, never `NEXT_PUBLIC_` ✅ |
| Anon key | Public by design. Safe **only if** RLS and storage policies are tight (F-01 breaks this assumption) |
| Secret values printed in this report | None |

## Container and deployment

| Item | Finding |
|---|---|
| `Dockerfile` | Multi-stage `node:20-alpine`, production `NODE_ENV`, runs as non-root `nextjs` user, exposes 3000 ✅. Node 20 reaches end-of-life in April 2026, so move to Node 22/24 LTS (Medium) |
| `docker-compose.yml` | `env_file: .env.local` (not baked into the image) ✅; publishes `${HOST_PORT:-3000}:3000` directly. Put a TLS reverse proxy (Caddy/nginx) in front; don't expose 3000 publicly |
| Healthcheck | Present in compose ✅ |
| CI (`ci.yml`) | lint → typecheck → test → build with dummy env ✅. Add `npm audit --omit=dev --audit-level=high` and secret scanning (gitleaks) |
| `migrations.yml` | Applies migrations, so make sure the DB credential is a GitHub secret scoped to the environment (not reviewed in depth) |
| HTTPS/HSTS | HSTS header set in `next.config.ts` ✅; TLS termination not in repo (**NOT TESTED**) |
| Debug mode | Production build; no debug endpoints found ✅ |
| CORS | No custom CORS headers on `/api/*` (same-origin). `/api/v1` is meant for server-to-server use ✅ |
| Security headers | HSTS, nosniff, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy ✅; CSP report-only (F-07) |
| Admin panels | No separate admin panel; the super admin uses the app ✅ |
| Backups | Supabase-managed; **NOT TESTED** |

## Recommendations

1. TLS reverse proxy; bind the app port to localhost only.
2. Node 22+ base image; rebuild monthly for OS patches.
3. CI gates: production audit, gitleaks, migration lint.
4. Rotate `ENCRYPTION_KEY` with a documented re-encryption script (none exists today, so rotation would break stored tokens).

# 12 — Dependency and supply-chain security

`npm audit --omit=dev --json` on 20 Nov 2026: **23 advisories (2 critical, 11 high, 10 moderate)**. No packages were installed or changed during the audit.

| Package (installed via) | Range | Severity | Advisory (summary) | Reachable in this app? | Action |
|---|---|---|---|---|---|
| **next** 16.2.12 (direct) | ≤16.4.4 | Critical | Unauthenticated RCE on Windows-hosted servers (CVE-2026-75604); AVIF image optimisation RCE (GHSA-2xp9-vwfh-vxw4); Oct 2026 critical fixes | **Potential**: Windows only matters if hosted on Windows (dev machine is); AVIF not configured; Oct issues depend on platform | **Upgrade now** (F-02) |
| proxy-addr (via express ← shadcn ← MCP SDK) | 1.1.0–2.0.7 | Critical | IP spoofing via IPv4-mapped IPv6 | Not at runtime (CLI dependency chain) | Move `shadcn` to dev |
| @modelcontextprotocol/sdk (via shadcn) | ≤1.31.0 | High | OAuth credential misdirection | No | same |
| body-parser, qs, express-rate-limit, hono, @hono/node-server (via shadcn/MCP) | various | High/Mod | DoS, path bypass | No | same |
| undici | 7.0–7.30 | High | DoS in WebSocket decompression | Possibly (Node fetch internals): low | Update |
| sharp | ≤0.35.5-rc.1 | High | libheif/librsvg vulnerabilities | Used by Next image optimisation if installed: **requires verification** | Update with `next` |
| zod (via shadcn) | <4.6.6 | High | Memory exhaustion | No (app doesn't use zod for request validation) | dev move |
| fast-uri, js-yaml, brace-expansion, minimatch, browserslist, source-map-js, postcss-selector-parser, baseline-browser-mapping, ts-morph | various | High/Mod | DoS / SSRF in libs | Build-time | Update lockfile |

## Supply-chain observations

- `shadcn` (a code-generator CLI) is listed in **`dependencies`**, which drags express, hono, the MCP SDK and ts-morph into the production install and image. Moving it to `devDependencies` removes most of the advisories above (F-09).
- `opus-recorder` worker files are vendored into `public/opus/` (minified). Pin and record their checksum.
- Dependabot is active (46 commits) ✅. Add `npm audit --omit=dev --audit-level=high` to CI.
- No `postinstall` scripts in direct dependencies were found in `package.json`. Transitive scripts weren't reviewed.
- Typosquatting: direct dependency names checked by eye. All are well-known packages ✅.

Status legend: *Confirmed vulnerable version* = all rows; *Not exploitable in current usage* = CLI-chain rows; *Requires verification* = sharp/undici runtime paths.

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

# 15 — Vulnerability register

Severity uses CVSS v4.0 *reasoning* plus business context (patient health data). Precise CVSS scores are only given where the vector is clear. **Status:** *Confirmed* = proven from code/configuration with no ambiguity · *Probable* = configuration strongly implies it, live exploitation not performed · *Potential* = depends on deployment · *Improvement* = hardening.

No live exploitation was performed. No production system was touched.

---

## F-01 — Patient media in the `chat-media` bucket can be listed and downloaded by anyone
- **Severity:** **Critical** · CVSS v4.0 ≈ 8.7 (AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:N/VA:N) · **CWE-284 / CWE-552** · OWASP A01 Broken Access Control, API1 BOLA
- **Status:** **Probable** (policy confirmed in migrations; listing not executed against a live project)
- **Affected:** `supabase/migrations/023_chat_media.sql` (policy *"Chat media is publicly readable"*: `FOR SELECT USING (bucket_id = 'chat-media')`, no role restriction); `039_inbound_media_mirror.sql` (inbound patient attachments mirrored into the same public bucket, **on by default**); path builder `src/lib/storage/upload-media.ts → buildMediaPath` (`account-<uuid>/inbound/...`)
- **Root cause:** A SELECT policy on `storage.objects` with no `TO authenticated` and no account predicate. Supabase's object **list** endpoint is governed by this policy, and public-bucket **downloads** need no auth at all. The anon key ships in every browser bundle (`NEXT_PUBLIC_SUPABASE_ANON_KEY`).
- **Attack scenario:** An attacker reads the anon key from the sign-in page JS, calls `storage.from('chat-media').list('')` to enumerate `account-*` folders, lists `inbound/` in each, and downloads prescriptions, X-rays, ID cards and voice notes of every clinic's patients.
- **Impact:** Mass disclosure of health data across tenants. Under DPDP this is a notifiable personal-data breach. This is the most serious finding.
- **Safe reproduction (local/staging only):** with the anon key and a disposable test account: `curl -X POST "$SUPABASE_URL/storage/v1/object/list/chat-media" -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" -d '{"prefix":"","limit":100}'`. A non-empty folder list confirms it.
- **Fix:** (1) Immediately: drop the broad SELECT policy and replace it with members-only listing (`TO authenticated USING (bucket_id='chat-media' AND ('account-'||p.account_id) = (storage.foldername(name))[1] ...)`). Public URLs keep working for Meta. (2) Properly: move **inbound** media to a **private** bucket served through the existing authenticated `/api/whatsapp/media/[mediaId]` route or short-lived signed URLs. Keep only outbound media in a public bucket, ideally with signed URLs Meta can fetch. (3) Apply the same to `avatars` and `flow-media` (F-14).
- **Verification:** the anon list call returns `[]` / 403; signed-in member of account A cannot list account B's folder; existing message media still renders.

## F-02 — Next.js 16.2.12 is in critical advisory ranges
- **Severity:** **High** (advisory rated Critical; exploitability here is conditional) · **CWE-94/CWE-787 (upstream)** · OWASP A06 Vulnerable Components
- **Status:** **Confirmed** version (installed `next@16.2.12`; `npm audit` lists critical); exploitability **Potential**
- **Details:** The August 2026 release fixed CVE-2026-75604 (unauthenticated RCE on **Windows-hosted** servers) and GHSA-2xp9-vwfh-vxw4 (AVIF image optimisation, only if `image/avif` is configured, which it is **not** in `next.config.ts`), fixed in 16.3.3. The October 2026 out-of-band release (16.4.1) fixed further critical RCEs (librsvg / `use cache`, glibc-Linux image path). The Docker image is Alpine (musl) Linux; **local development runs on Windows**.
- **Fix:** upgrade to the latest patched 16.x; re-run tests/build.
- **Verification:** `npm ls next` ≥ patched version; `npm audit --omit=dev` shows no `next` advisory.

## F-03 — Any signed-in member can edit or delete WhatsApp templates on Meta (BFLA)
- **Severity:** **High** · CVSS v4.0 ≈ 7.1 (PR:L, VI:H, VA:L) · **CWE-285 / CWE-862** · OWASP API5 Broken Function Level Authorization
- **Status:** **Confirmed** (code)
- **Affected:** `src/app/api/whatsapp/templates/[id]/route.ts` PATCH and DELETE. They authenticate the user and resolve the account, but check **no role and no designation**. They read `whatsapp_config` (readable by every member under RLS), decrypt the access token server-side and call Meta `deleteMessageTemplate` / edit **before** the local write. RLS only blocks the *local* delete (admin-only), after Meta has already deleted the template.
- **Attack:** A `viewer` (or a role with Templates switched off in Access control) sends `DELETE /api/whatsapp/templates/<id>`. The approved reminder template disappears at Meta and reminders stop.
- **Fix:** `requirePermission('templates', 'delete' | 'edit')` (and admin-class role) **before** any Meta call.
- **Verification:** route tests: viewer → 403 and the Meta client is not called.

## F-04 — Access control (designations) is not enforced on upstream routes
- **Severity:** **High** · **CWE-863** · OWASP A01, API5
- **Status:** **Confirmed** (code)
- **Affected:** routes authorised only by the coarse account role: `whatsapp/broadcast` (+resume), `whatsapp/send`, `whatsapp/react`, `automations/*`, `flows/*`, `quick-replies/*`, `contacts/[id]/tags`, `whatsapp/templates/submit|sync` (`requireRole`). `flows/[id]/runs` and `flows/templates` check only that a user is signed in.
- **Impact:** The product promises (Access control page, `ownerNote`) that "the same matrix is enforced by the API". It isn't for these modules. A receptionist role with Broadcasts off can still send a broadcast to every patient through the API if their account role is `agent`, which incurs marketing fees of ~₹0.86/message and reputational damage.
- **Fix:** replace `requireRole` with `requirePermission(<module>, <action>)` on each route, keeping the role floor where needed.
- **Verification:** a table-driven test per route: role without the module → 403.

## F-05 — WhatsApp configuration exposure and write path
- **Severity:** **Medium** · **CWE-200 / CWE-862**
- **Status:** **Confirmed** (code + RLS)
- **Details:** `whatsapp_config` SELECT is allowed to **every** member (017). The row includes the AES-GCM-encrypted `access_token` and plaintext `verify_token`. `POST/DELETE /api/whatsapp/config` check no role: RLS blocks the write for non-admins, but the Meta `/register` call (with caller-supplied data) runs first, and a blocked DELETE still returns `{success:true}`.
- **Fix:** select only non-secret columns for non-admins (a view or column privileges); `requireRole('admin')`/`requirePermission` before any Meta call; treat 0-row updates/deletes as 403.

## F-06 — Half-implemented per-branch data scope gives a false assurance
- **Severity:** **Medium** · **CWE-863**
- **Status:** **Confirmed** (code): `src/lib/auth/data-scope.ts` and tests exist and `permissions.ts` carries `scope`, but there is **no UI, no migration 058, no RLS**, and the master route test references `entityScope`
- **Fix:** finish (UI + 058 restrictive policies + route enforcement) or remove before release.

## F-07 — Content-Security-Policy is report-only; session tokens are readable by JavaScript
- **Severity:** **Medium** · **CWE-1021 / CWE-79 impact amplifier** · OWASP A05
- **Status:** **Confirmed** (`next.config.ts` ships `Content-Security-Policy-Report-Only`); Supabase SSR stores session cookies that client JS can read (by design)
- **Notes:** No exploitable XSS was found. `dangerouslySetInnerHTML` is only used with static theme boot code and developer-authored i18n strings. React escapes all user content. But any future XSS would yield full session takeover.
- **Fix:** watch report logs for a week, then switch to an enforcing CSP; keep the strict `script-src`.

## F-08 — No MFA for owners, admins or the super admin
- **Severity:** **Medium** · **CWE-308** · OWASP A07
- **Status:** **Confirmed** (no MFA enrolment or AAL checks in code)
- **Fix:** Supabase TOTP MFA; require AAL2 for Access control, members, WhatsApp config, AI settings and the super admin.

## F-09 — Production dependency surface: 23 advisories, mostly via `shadcn` in `dependencies`
- **Severity:** **Medium** · OWASP A06
- **Status:** **Confirmed** (`npm audit --omit=dev`: 2 critical, 11 high, 10 moderate). Most come through `shadcn` (a CLI) → MCP SDK, express, hono, body-parser, undici, zod, sharp, plus `next` itself
- **Fix:** move `shadcn` to `devDependencies`, upgrade `next`, re-audit. Many advisories are not reachable at runtime but still enlarge the image and the audit noise.

## F-10 — Rate limiting is per-process and absent on several costly routes
- **Severity:** **Low** (single instance) → **Medium** (multi-instance) · **CWE-770** · OWASP API4
- **Status:** **Confirmed**: `src/lib/rate-limit.ts` (in-memory) is used on account/invitation/API-key routes and `/api/v1/*`; not on `appointments`, `clinic-settings`, `ai/settings`, `conversations/*/ai-mode`, `whatsapp/send`, `whatsapp/broadcast`. Login/sign-up limits are Supabase Auth's (not in repo; **not tested**).
- **Fix:** add limits to send/broadcast/AI-mode; move to a shared store before running more than one instance.

## F-11 — Booking race (double-booking) and no audit trail of sensitive changes
- **Severity:** **Medium** (business logic, integrity) · **CWE-362 / CWE-778** · OWASP A04, A09
- **Status:** **Confirmed**: no DB constraint prevents overlapping appointments for a doctor; the booking assistant and the desk check availability in application code; no table records who changed appointments, permissions, AI settings or clinic hours.
- **Fix:** exclusion constraint on `(doctor_id, tstzrange(starts_at, ends_at))` where not cancelled; `audit_events` table written by API routes.

## F-12 — PostgREST filter strings built from user input (browser client)
- **Severity:** **Low** · **CWE-943**
- **Status:** **Confirmed** pattern, impact bounded: `contacts/page.tsx` and `appointment-dialog.tsx` interpolate the search box into `.or("name.ilike.…,phone.ilike.…")`. Commas or parentheses can add filter clauses, but RLS limits rows to the caller's account. `/api/v1/contacts` already runs `sanitizeSearch()` first.
- **Fix:** reuse `sanitizeSearch` (strip `,()*` and quotes) in the browser search helpers.

## F-13 — AI assistant: third-party data transfer and prompt-injection
- **Severity:** **Low / Privacy** · **CWE-359** · OWASP LLM01 (prompt injection), LLM06
- **Status:** **Confirmed design**: patient messages (last 20) and clinic facts are sent to Anthropic/OpenAI with the clinic's key. The model has **no tools** and no access to other patients' data, so prompt injection can at worst produce a wrong reply to the same patient. Any unreadable output becomes a handoff. Replies are capped per chat.
- **Fix:** disclose in the privacy notice and the bot welcome; document provider DPAs; strip phone numbers/IDs from history before sending (data minimisation); log AI decisions for review.

## F-14 — `avatars` and `flow-media` buckets are also listable publicly
- **Severity:** **Low** · **CWE-552** · **Status:** **Probable** (same policy pattern as F-01; less sensitive content)
- **Fix:** restrict SELECT as in F-01.

## F-15 — Silent success on RLS-blocked writes
- **Severity:** **Low** · **CWE-754** · **Status:** **Confirmed** (WhatsApp config DELETE; similar update patterns)
- **Fix:** check affected rows; return 403 when zero.

## F-16 — No patient data export, deletion or retention controls
- **Severity:** **Medium (compliance)** · **Status:** **Confirmed** absence
- **Fix:** DPDP toolkit: export a patient's data, erase on request (messages, media, appointments), retention for mirrored media, consent record.

---

### Informational: controls that are done well
- Inbound webhook HMAC (`x-hub-signature-256`) with `timingSafeEqual`, raw body (`whatsapp/webhook-signature.ts`).
- API keys: 32 random bytes, stored as SHA-256 hash, timing-safe compare, scopes, per-key rate limits (`lib/api-keys/keys.ts`, `api-context.ts`).
- Invitation tokens hashed at rest (`lib/auth/invitations.ts`).
- WhatsApp access tokens and AI keys encrypted with AES-256-GCM (`whatsapp/encryption.ts`); AI key never returned to the browser.
- Outbound webhooks guarded against SSRF (`lib/webhooks/ssrf.ts`).
- Privilege columns on `profiles` protected by trigger (044/054); `SECURITY DEFINER` functions pin `search_path`.
- Security headers (HSTS, nosniff, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy); Docker runs as non-root.
- New routes in this session (`clinic-settings`, `ai/settings`, `conversations/[id]/ai-mode`) use `requirePermission` and filter service-role writes by `account_id`.

# 14 — Security test matrix

**Method key:** CR = code review · SQL = migration/policy review · UT = existing unit tests run (929 passing) · DEP = `npm audit` · BR = local browser (public pages) · — = not performed.
**Status:** PASS / FAIL / PARTIAL / NOT TESTED / N/A. PASS means verified by the stated method only. Nothing was dynamically pentested.

| ID | Test | Area | Component | Method | Expected secure behaviour | Result | Severity | Evidence / remediation |
|---|---|---|---|---|---|---|---|---|
| T-01 | Unauthenticated access to session APIs | Auth | all `/api/*` | CR + curl | 401 | **PASS** | — | New routes return 401 signed out (curl, 20 Nov) |
| T-02 | Auth bypass via middleware | Auth | `middleware.ts` | CR | Protected pages redirect | PASS | — | Session refresh + redirect logic |
| T-03 | Password policy / leaked passwords | Auth | Supabase | — | Strong policy | NOT TESTED | — | Dashboard setting |
| T-04 | Login brute force | Rate limit | Supabase Auth | — | Throttled | NOT TESTED | — | Dashboard setting |
| T-05 | Account enumeration on login/reset | Auth | login/forgot | CR | Generic messages | PASS (login) / NOT TESTED (reset) | — | Supabase messages |
| T-06 | Password reset token reuse/expiry | Auth | Supabase | — | One-time, short | NOT TESTED | — | — |
| T-07 | MFA for privileged users | Auth | — | CR | Available/required | **FAIL** | Medium | F-08 |
| T-08 | Session cookie flags | Session | `@supabase/ssr` | CR | Secure, SameSite | PARTIAL | Medium | Not HttpOnly by design (F-07) |
| T-09 | Permission changes take effect immediately | AuthZ | `loadPermissions` per request | CR | Yes | PASS | — | Re-read each request |
| T-10 | IDOR: appointment by foreign id | BOLA | `appointments/[id]` | CR | 404 | PASS | — | account filter |
| T-11 | Foreign FK ids in payload | BOLA | `assertRefsInAccount` | CR + UT | 400 | PASS | — | tests in `route.test.ts` |
| T-12 | IDOR: master records | BOLA | `master/[entity]/[id]` | CR + UT | 404 | PASS | — | — |
| T-13 | IDOR: v1 API objects | BOLA | `/api/v1/*` | CR | 404 | PASS | — | account filter on every query |
| T-14 | Storage listing by anon | BOLA/tenant | `chat-media` | SQL | Denied | **FAIL** | **Critical** | F-01 |
| T-15 | Storage cross-account listing by member | Tenant | `chat-media` | SQL | Denied | **FAIL** | Critical | F-01 |
| T-16 | Template delete by viewer | BFLA | `whatsapp/templates/[id]` | CR | 403 | **FAIL** | High | F-03 |
| T-17 | Broadcast by role without module | BFLA | `whatsapp/broadcast` | CR | 403 | **FAIL** | High | F-04 |
| T-18 | Settings write by non-admin | BFLA | `whatsapp/config` | CR + SQL | 403 before side effects | PARTIAL | Medium | RLS blocks DB write; Meta call first (F-05) |
| T-19 | AI settings write by agent | BFLA | `ai/settings` | CR | 403 | PASS | — | module + admin role |
| T-20 | Clinic settings write without module | BFLA | `clinic-settings` | CR | 403 | PASS | — | `settings-clinic:edit` |
| T-21 | Self privilege escalation via profile | PrivEsc | trigger 044/054 | SQL | Blocked | PASS | — | — |
| T-22 | Super-admin self-grant | PrivEsc | `super_admins` | SQL | Impossible | PASS | — | no policies, revoked |
| T-23 | Mass assignment (appointments/master/AI) | Mass assign | validators | CR + UT | Extra fields dropped | PASS | — | whitelists |
| T-24 | SQL injection | Injection | all queries | CR | None | PASS | — | PostgREST params; static SQL |
| T-25 | PostgREST filter injection | Injection | contacts search, dialog | CR | Sanitised | PARTIAL | Low | F-12 (RLS-bounded) |
| T-26 | Stored XSS in messages/names | XSS | inbox, lists | CR | Escaped | PASS | — | React escaping; no user HTML sinks |
| T-27 | XSS via SVG logo | XSS | branding | CR | Not executed | PASS | — | `<img>` rendering |
| T-28 | CSP enforcement | Headers | `next.config.ts` | CR | Enforcing | **FAIL** | Medium | report-only (F-07) |
| T-29 | Security headers present | Headers | `next.config.ts` | CR | HSTS, nosniff, XFO, RP, PP | PASS | — | — |
| T-30 | CSRF on state-changing routes | CSRF | `/api/*` | CR | SameSite + JSON | PASS (by SameSite=Lax + JSON bodies; no GET mutations found) | — | — |
| T-31 | CORS | Config | `/api/*` | CR | No wildcard with credentials | PASS | — | none set |
| T-32 | SSRF via outbound webhooks | SSRF | `lib/webhooks/ssrf.ts` | CR + UT | Private/metadata blocked | PASS | — | tests exist |
| T-33 | Path traversal in uploads | Files | `buildMediaPath` | CR + UT | Sanitised | PASS | — | — |
| T-34 | Upload type/size limits | Files | buckets | SQL | Enforced | PASS | — | bucket limits |
| T-35 | Webhook signature verification | Integrations | `webhook-signature.ts` | CR + UT | HMAC, constant time | PASS | — | — |
| T-36 | Webhook replay/duplicate | Integrations | unique index 037 | SQL | Deduplicated | PASS | — | — |
| T-37 | API key storage & compare | Tokens | `api-keys/keys.ts` | CR + UT | Hash + timing-safe | PASS | — | — |
| T-38 | Token encryption at rest | Secrets | `encryption.ts` | CR + UT | AES-GCM | PASS | — | — |
| T-39 | Secrets in repo/history | Secrets | git | CR (pattern scan) | None | PASS | — | 1 false positive |
| T-40 | Vulnerable dependencies | Supply chain | npm | DEP | None high/critical | **FAIL** | High | F-02, F-09 |
| T-41 | Rate limit on send/broadcast | Abuse | routes | CR | Limited | **FAIL** | Low–Med | F-10 |
| T-42 | Double-booking race | Business logic | appointments | CR + SQL | DB-enforced | **FAIL** | Medium | F-11 |
| T-43 | AI prompt injection → data leak | LLM | `ai-chat` | CR + UT | No cross-patient data, no tools | PASS | Low | F-13 notes |
| T-44 | AI failure → silent drop | LLM | runner | CR + UT | Handoff | PASS | — | `parseModelReply` tests |
| T-45 | Audit logging of admin actions | Logging | — | CR | Logged | **FAIL** | Medium | F-11 |
| T-46 | Data export/erasure | Privacy | — | CR | Available | **FAIL** | Medium | F-16 |
| T-47 | Backups & restore | Ops | Supabase | — | Tested | NOT TESTED | — | — |
| T-48 | TLS/proxy config | Infra | deployment | — | TLS 1.2+, proxy | NOT TESTED | — | not in repo |
| T-49 | Container runs non-root | Infra | Dockerfile | CR | Non-root | PASS | — | `USER nextjs` |
| T-50 | Tenant context in cron/background jobs | Tenant | cron routes, runners | CR | account_id kept | PASS | — | — |

# 16 — Remediation roadmap

No fixes were applied during the assessment. Every item needs your approval before implementation.

## P0 — Critical (this week, before any real patient data)

| Finding | Location | Solution | Approach | Cx | Regression risk | Acceptance / verification |
|---|---|---|---|---|---|---|
| F-01 Public listing of patient media | `023/039` policies, `mirror-inbound-media.ts` | Members-only SELECT; private bucket for inbound media | New migration 062: replace policies; create `patient-media` private bucket; change mirror target; serve via `/api/whatsapp/media` or signed URLs; migrate objects | M | Medium (media display) | Anon list → empty; cross-account list denied; inbox shows old and new media |

## P1 — High (before public launch)

| Finding | Location | Solution | Cx | Regression risk | Acceptance |
|---|---|---|---|---|---|
| F-02 Next.js advisories | `package.json` | Upgrade to latest patched 16.x; rebuild image | S | Low–Med | Audit clean; CI green; smoke test |
| F-03 Template BFLA | `whatsapp/templates/[id]` | `requirePermission('templates','edit'/'delete')` + admin floor before Meta calls | S | Low | Viewer → 403; Meta client not called (unit test) |
| F-04 Designation bypass | broadcast, send, react, automations, flows, quick-replies, tags, templates submit/sync | Swap `requireRole` for `requirePermission(module, action)`; add a route test table | M | Medium (roles losing access they had) | Per-route 403 tests; release note telling admins to review roles |

## P2 — Medium (schedule within 60 days)

| Finding | Solution | Cx |
|---|---|---|
| F-05 WhatsApp config | Hide secret columns from non-admins (view/column grants); role check before Meta `/register`; 0-row writes → 403 | S |
| F-06 Data scope | Finish (UI, 058 restrictive RLS, route enforcement) or remove | M |
| F-07 CSP | Collect reports a week → enforce | S |
| F-08 MFA | Supabase TOTP; require AAL2 for admin-class routes and the super admin | M |
| F-09 Dependencies | `shadcn` → devDependencies; CI audit gate | S |
| F-11 Race + audit | Exclusion constraint; `audit_events` table (actor, action, entity, before/after, at) for appointments, roles, members, settings | M |
| F-16 Privacy | Export/erase per patient; retention purge; DPA; privacy notice | M |
| Node 20 EOL | Base image Node 22/24 | S |

## P3 — Low / hardening

F-10 rate limits on send/broadcast/AI (and Upstash when multi-instance) · F-12 sanitise browser search filters · F-13 AI disclosure + PII stripping + decision log · F-14 restrict avatars/flow-media listing · F-15 surface RLS-blocked writes · CI gitleaks · `ENCRYPTION_KEY` rotation script · force password change for admin-created staff · re-auth before ownership transfer.

## Order of work (solo, ~2 weeks)

Day 1–2: F-01 → Day 3: F-02, F-09 → Day 4: F-03 → Day 5–6: F-04 → Week 2: F-11, F-05, F-07 (start reports), F-08 → then F-16 alongside billing.

# 17 — Final security verdict

## Scorecard

Scores account for untested areas (they cap the score) and uncertainty.

| Category | Score | Evidence | Risk |
|---|---:|---|---|
| Authentication | 6 | Supabase Auth, generic errors, invitations hashed; no MFA; dashboard settings untested | Medium |
| Authorization | 5 | Strong matrix + RLS on new code; BFLA on templates; designation bypass on upstream routes | High |
| Session management | 7 | Correct SSR cookie refresh, `getUser` validation | Low |
| Token security | 8 | Hashed API/invite tokens, AES-GCM secrets, keys never returned | Low |
| API security | 6 | v1 solid; session routes uneven | Medium |
| SQL injection prevention | 9 | PostgREST + static SQL; minor filter-string issue | Low |
| Input validation | 8 | Whitelisting parsers throughout new code | Low |
| XSS protection | 7 | No user HTML sinks; CSP not enforced | Medium |
| CSRF protection | 7 | SameSite + JSON; no explicit tokens | Low |
| Rate limiting | 4 | In-memory; missing on costly routes; auth limits untested | Medium |
| Tenant isolation | 4 | RLS good for tables; **storage listing breaks it** | Critical |
| File security | 3 | Patient media in a publicly listable bucket | Critical |
| Business logic security | 5 | Booking race, broadcast cost abuse | Medium |
| Secrets management | 8 | No leaks; env-only; no rotation tooling | Low |
| Infrastructure | 6 | Non-root container, headers; Node 20 EOL; TLS/backups untested | Medium |
| Dependency security | 4 | Critical Next.js range; CLI deps in production | High |
| Logging & monitoring | 3 | No audit log, no alerting | Medium |
| Privacy & data protection | 3 | No export/erasure/retention; media exposure | High |

**Application security 5.4 · Authentication 6.0 · API security 6.0 · Data protection 3.3 · Infrastructure 5.0 → Overall 5.0 / 10. Overall risk: HIGH.**
Method: the unweighted mean of the 18 categories is 5.7. It's reduced to 5.0 because an unfixed Critical finding caps the score, and because Supabase Auth settings, infrastructure and backups were not tested.

## Answers

1. **Safe to deploy publicly?** Not with real patient data until F-01 is fixed and Next.js is upgraded.
2. **Safe with paying customers?** After the P0 + P1 items (about one week of work) and a privacy policy/DPA.
3. **Biggest weakness:** storage policies. Patient media can be listed with the public anon key (F-01).
4. **Authentication sufficient?** Basically yes for a pilot; add MFA for owners/admins.
5. **Authorization sufficient?** No: F-03 and F-04.
6. **Realistic IDOR risk?** Low for table records (well filtered); **high for storage objects**.
7. **Tenant isolation risk?** Yes, through storage (F-01). Tables are well isolated.
8. **SQL injection possible?** No path found.
9. **APIs properly protected?** v1 yes; several session routes need permission checks.
10. **Access/refresh tokens secure?** Yes (Supabase-managed); XSS would expose them (enforce CSP).
11. **Rate limiting sufficient?** For one instance and authenticated users, partially; not for send/broadcast cost abuse.
12. **Can users escalate privileges?** Not their role; but they can perform functions their designation forbids on upstream routes (F-04) and delete templates (F-03).
13. **Can sensitive information leak?** Yes: F-01 (media); members can read encrypted WhatsApp token ciphertext (F-05, low impact).
14. **File upload/download secure?** Uploads yes; downloads/listing no.
15. **Vulnerable to common OWASP attacks?** A01 (access control) and A06 (components) yes; A03 injection no; A07 partial (no MFA).
16. **Fix immediately:** F-01.
17. **Fix before public launch:** F-02, F-03, F-04 (+ privacy documents).
18. **After launch:** F-05–F-16 per the roadmap.
19. **Missing controls:** MFA, audit logging, enforced CSP, DB overlap constraint, data export/erasure, shared rate limiting, CI security gates.
20. **Score:** **5.0 / 10**.

## Final verdict: **HIGH RISK — major fixes required**

The foundations are better than average: RLS everywhere, hashed keys, encrypted secrets, HMAC webhooks, careful service-role filtering in the newer code. The critical issue is one storage policy, and it's quick to fix. After P0/P1 the expected verdict is **CONDITIONALLY READY**.

**Limitations:** static review only for signed-in flows; Supabase dashboard settings, production infrastructure, backups and real WhatsApp traffic were not tested; the storage finding was confirmed from policy definitions, not by listing a live bucket.

# 18 — Research sources and references

Accessed 20 November 2026.

## Frameworks

| Reference | Used for |
|---|---|
| [OWASP Top 10 (2021, current edition at time of audit)](https://owasp.org/Top10/) | A01–A10 mapping |
| [OWASP API Security Top 10 (2023)](https://owasp.org/API-Security/editions/2023/en/0x11-t10/) | API1–API10 mapping |
| [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/) | Control checklist |
| [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) | BFLA/BOLA guidance |
| [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html) | Storage review |
| [OWASP Top 10 for LLM Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/) | AI assistant review |
| [CVSS v4.0 specification (FIRST)](https://www.first.org/cvss/v4.0/specification-document) | Severity reasoning |
| [Supabase Storage access control docs](https://supabase.com/docs/guides/storage/security/access-control) | `storage.objects` SELECT governs listing; public buckets serve objects without RLS |

## Advisories

| Source | Supports |
|---|---|
| [Next.js August 2026 security release](https://nextjs.org/blog/august-2026-security-release) | CVE-2026-75604 (Windows RCE) and AVIF RCE; fixed in 16.3.3 |
| [Vercel changelog](https://vercel.com/changelog/nextjs-august-2026-security-release) | Same |
| [CSA research note](https://labs.cloudsecurityalliance.org/research/csa-research-note-nextjs-avif-windows-rce-cve-2026-75604-202/) | Exploit conditions |
| [The Hacker News: Oct 2026 out-of-band patch](https://thehackernews.com/2026/10/nextjs-ships-out-of-band-patch-for-two.html?hl=ru) | 16.4.1 critical fixes |
| [GitLab advisory GHSA-2xp9-vwfh-vxw4](https://advisories.gitlab.com/npm/next/GHSA-2xp9-vwfh-vxw4/) | AVIF advisory |
| `npm audit --omit=dev --json` (local, 20 Nov 2026) | Dependency table |

## Privacy law

| Source | Supports |
|---|---|
| [PIB: DPDP Rules 2025 notified](https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf) | Official notification, 18-month phase-in |
| [Taxmann analysis](https://www.taxmann.com/post/blog/analysis-indias-dpdp-act-and-rules) | Fiduciary duties |
| [Corpus Juris timeline](https://www.corpusjurislegal.com/resources/legal-updates/dpdp-rules-notification-2026) | ~May 2027 core obligations |

## Code evidence

Paths are cited inline in each report. Key files: `supabase/migrations/023_chat_media.sql`, `039_inbound_media_mirror.sql`, `src/app/api/whatsapp/templates/[id]/route.ts`, `src/lib/auth/permission-guard.ts`, `src/lib/rate-limit.ts`, `next.config.ts`, `Dockerfile`, `package.json`.
