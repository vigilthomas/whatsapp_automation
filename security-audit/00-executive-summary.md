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
