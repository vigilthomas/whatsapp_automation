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
