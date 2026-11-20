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
