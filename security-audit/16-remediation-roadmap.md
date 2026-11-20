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
