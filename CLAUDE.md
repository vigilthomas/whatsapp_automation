# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

**Clinicoro** — a self-hostable clinic management CRM for the official WhatsApp
Business API (Meta Cloud API): shared inbox, contacts, clinic master data,
sales pipelines, broadcasts, no-code automations/flows, and an AI reply
assistant. Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4,
backed by Supabase (Postgres + Auth + Storage + RLS).

A rebrand and extension of **wacrm**, adding healthcare-specific features:
clinic master data management (clinics, doctors, clinic admins), access
control for clinic hierarchies, and healthcare-focused workflows.

This is a **template repo**, not a collaborative product — see
CONTRIBUTING.md. Feature PRs generally belong in forks, not upstream; bug
fixes and security fixes are welcome. Keep that in mind when a task looks
like "add a feature" vs. "fix a bug."

## Commands

```bash
npm run dev            # Turbopack dev server, port 3000
npm run build           # production build (Next also typechecks here)
npm run typecheck       # tsc --noEmit — fast TS-only pass
npm run lint             # ESLint
npm test                 # vitest run (single pass)
npm run test:watch       # vitest watch mode
npx vitest run path/to/file.test.ts   # run a single test file
npm run format           # prettier --write .
npm run format:check     # prettier --check . (CI mode)
```

CI (`.github/workflows/ci.yml`) runs lint → typecheck → test → build on
every PR/push to `main`, with dummy env vars — replicate that env locally
if a build/test step behaves differently than expected:
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`ENCRYPTION_KEY`, `META_APP_SECRET` (see `vitest.config.ts` for the exact
dummy values tests expect).

Tests live next to the code they test (`foo.ts` / `foo.test.ts`), run in
Node environment, no network/DB — pure unit tests with mocked I/O.

The `mcp-server/` package is a separate npm package (own
`package.json`/`tsconfig.json`) published standalone as `wacrm-mcp`; it is
not part of the root workspace scripts.

## Architecture

### Two parallel auth systems

The app has two distinct ways a request gets an account context, and
picking the right one matters:

- **Dashboard (cookie session)** — `getCurrentAccount()` /
  `requireRole(min)` in `src/lib/auth/account.ts`. Reads the Supabase SSR
  client (`src/lib/supabase/server.ts`, cookie-backed), resolves
  `auth.uid()` → `profiles` → `accounts`, and returns an RLS-scoped
  client. Throws `UnauthorizedError`/`ForbiddenError`, caught with
  `toErrorResponse(err)`.
- **Public API (`/api/v1/*`, API keys)** — `requireApiKey(request, scope)`
  in `src/lib/auth/api-context.ts`. Resolves a `Bearer wacrm_live_…` key
  to an account and returns a **service-role** client (RLS-bypassing,
  because there's no user session for RLS to key off). Every downstream
  query in this path **must** be explicitly filtered by `ctx.accountId` —
  there's no RLS safety net. Throws `ApiError`, caught with
  `toApiErrorResponse(err)`. See `docs/public-api.md` for the wire format
  (envelope, scopes, pagination, webhooks, rate limits).

Roles (`owner > admin > agent > viewer`) and their capability predicates
(`canManageMembers`, `canEditSettings`, `canSendMessages`, …) live in
`src/lib/auth/roles.ts` — call the predicates, don't compare role strings
inline; the ordinal ranking mirrors the `is_account_member` SQL helper so
TS guards and Postgres RLS stay in sync.

### Multi-tenancy is `account_id` everywhere

Every domain table is scoped by `account_id`. RLS enforces this for the
cookie-session path; the service-role path (API keys, background jobs)
relies on every query manually filtering by `accountId` — this is the
main thing to double check when adding a new API-key or admin-client code
path. Accounts support multiple team members (`account_role_enum`,
migration `017_account_sharing.sql`) with invite-by-link.

### Service-role ("admin") clients

Background/webhook code that can't carry a user session uses a lazy
singleton service-role client, e.g. `src/lib/flows/admin-client.ts` and
`src/lib/automations/admin-client.ts` — both named `supabaseAdmin()` with
the identical shape by convention; follow that pattern for any new engine
that needs one rather than inventing a different shape.

### Domain modules under `src/lib/`

- `whatsapp/` — Meta Cloud API integration: sending (`send-message.ts`,
  `meta-api.ts`), templates (`template-*.ts`), broadcasts
  (`broadcast-core.ts`), token encryption (`encryption.ts`, AES-256-GCM,
  keyed by `ENCRYPTION_KEY`), inbound webhook signature verification
  (`webhook-signature.ts`, HMAC via `META_APP_SECRET`).
- `automations/` — the no-code automation engine (`engine.ts`, trigger →
  condition → action tree, `steps-tree.ts`).
- `flows/` — the visual flow builder engine (separate from automations;
  built on `@xyflow/react` + `@dagrejs/dagre` for layout).
- `ai/` — AI reply assistant: provider-agnostic generation
  (`generate.ts`, `providers/`), knowledge base retrieval (`knowledge.ts`,
  `chunk.ts`, `embeddings.ts` — hybrid Postgres full-text / pgvector),
  auto-reply with handoff (`auto-reply.ts`, `handoff.ts`), per-account
  usage caps (`usage.ts`).
- `master/` — clinic master data registry (`entities.ts`, pure schema
  definitions), server-side validation and queries (`server.ts`). Drives
  both the API and UI. See "Clinic master data system" above.
- `api/v1/` — shared logic for public API routes (serialization,
  `pagination.ts` — keyset cursors, `respond.ts` — the `{data}`/`{error}`
  envelope + `ApiError`/`toApiErrorResponse`).
- `api-keys/` — API key hashing/lookup (`keys.ts`, `store.ts`) and scope
  checks (`scopes.ts`).
- `webhooks/` — **outbound** event webhooks to third parties (register,
  sign with HMAC, deliver with SSRF protection in `ssrf.ts` — blocks
  private/link-local/metadata targets). Don't confuse with the
  **inbound** WhatsApp webhook in `whatsapp/webhook-signature.ts`.
- `rate-limit.ts` — in-memory, per-process limiter. Fine for
  single-instance deploys; swap for a shared store (Redis/Upstash) before
  scaling to multiple instances (noted at the top of the file).

### Route groups

`src/app/(auth)/*` — unauthenticated pages. `src/app/(dashboard)/*` — the
authenticated app shell. `src/app/api/*` — internal routes used by the
dashboard UI (cookie auth via middleware). `src/app/api/v1/*` — the
public, API-key-authenticated REST API (bypasses the cookie-auth check in
middleware, does its own auth via `requireApiKey`).

`src/middleware.ts` handles auth redirects and **must** copy any cookies
Supabase refreshed (`supabaseResponse`) onto every response it returns —
see the comment there re: issue #288 (session wedging on token refresh)
before touching this file.

### Clinic master data system

Clinicoro adds a declarative, reusable system for managing clinic master
data (clinics, doctors, clinic admins) — `src/lib/master/entities.ts`. Each
entity has a schema describing fields, types, validation, and which columns
show in the list view. One entity definition drives:

- API route validation (`src/app/api/master/[entity]/route.ts`)
- UI list columns and add/edit forms (`src/components/master/master-records-panel.tsx`)
- i18n keys (strings under `Master.entities` and `Master.fields` in messages)

New fields: add an entry to the entity in `entities.ts`, add the column to
migration `038_clinic_master_data.sql`, and add i18n strings. The system
regenerates the UI from the schema. Field types: `text`, `textarea`, `boolean`,
`clinic` (select a clinic). See `src/lib/master/entities.test.ts` for schema
examples.

### Access control and clinic hierarchy

Role-based access (`owner > admin > agent > viewer`) applies per account.
Clinicoro layers clinic-level access on top: users with `clinic_id` are
scoped to that clinic's data. The access control panel (`Settings → Access
Control`) shows which users can manage specific clinics. Check
`src/components/settings/access-control-panel.tsx` for the UI, and
`src/lib/auth/roles.ts` for the capability predicates.

### Supabase migrations

`supabase/migrations/*.sql`, sequentially numbered, applied in order. New
schema changes are a new numbered file, never edit a past migration.
Several features gate on a specific migration being applied (e.g.
outbound webhooks need `028_webhook_endpoints.sql`, clinic master data
needs `038_clinic_master_data.sql`) — check `docs/` and existing route
comments for such dependencies before assuming a table/column exists.

### i18n

`next-intl`, config at `src/i18n/request.ts`, translation strings in
`messages/{en,ko}.json`.

### Docker deployment

`Dockerfile` and `docker-compose.yml` enable containerized deployment. The
build uses `next build` with `output: "standalone"` in `next.config.ts`,
producing a self-contained image that doesn't need the full Next.js source
in the container. For local testing:

```bash
docker-compose up   # Runs the app on port 3000
```

Environment variables are passed via `.env` or the container runtime. The
image runs `next start` (production mode), not `npm run dev`. See the
Dockerfile for details on Node version, layers, and health checks.

## Conventions worth knowing

- Path alias `@/*` → `./src/*` (`tsconfig.json`).
- Prettier + `prettier-plugin-tailwindcss` (class sorting) — run
  `npm run format` rather than hand-sorting Tailwind classes.
- Security headers/CSP are centralized in `next.config.ts`
  (`SECURITY_HEADERS`) — CSP currently ships as
  `Content-Security-Policy-Report-Only`, not yet enforcing.
- Files in this codebase favor long doc-comment headers explaining *why*
  (calling conventions, gotchas, past-incident context like "issue
  #288"/"issue #294") — match that style rather than terse comments when
  adding non-obvious server-side logic.
- Master data entities: schema-driven, declarative. Changes to entity
  definitions must be reflected in both `src/lib/master/entities.ts` and
  the migration file (`038_clinic_master_data.sql` or later). Add the
  i18n keys under `Master.entities` / `Master.fields` in messages files
  so the UI renders labels correctly.
- Branding: logo and theme colors centralized in `src/components/brand/logo.tsx`
  and `src/lib/themes`. Update these, not hardcoded values in individual
  components, to keep branding consistent.
