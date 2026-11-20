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
