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
