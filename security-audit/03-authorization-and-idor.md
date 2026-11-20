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
