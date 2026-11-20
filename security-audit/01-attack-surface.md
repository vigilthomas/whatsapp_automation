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
