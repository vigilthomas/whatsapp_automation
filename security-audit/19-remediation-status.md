# 19 — Remediation status (20 November 2026)

Fixes applied after the audit, at the owner's request. Nothing is committed or deployed yet.

| Finding | Status | What changed |
|---|---|---|
| **F-01** Patient media publicly listable (Critical) | **Fixed in code; needs migration + one-off script** | New private bucket `patient-media` (migration `062_private_patient_media.sql`). The webhook mirror now writes there and stores `/api/whatsapp/media/stored/<path>`. That route checks for a signed-in user with Inbox read, that the path is the caller's own `account-<id>` folder (no traversal), and the bucket's members-only SELECT policy. `chat-media` SELECT is now members-only for their own folder, so anonymous listing returns nothing; public object URLs Meta needs still work. Old inbound files are moved by `node --env-file=.env.local scripts/move-inbound-media.mjs` (dry run first, then `--apply`). |
| **F-14** `avatars`, `flow-media` listable | **Fixed (migration 062)** | Their SELECT (list) policies are restricted to the member's own folder. Public URLs unchanged. |
| **F-02** Next.js advisories (High) | **Fixed** | `next` and `eslint-config-next` 16.2.12 → 16.4.6. `npm audit --omit=dev`: **0 vulnerabilities** (was 2 critical, 11 high). |
| **F-09** CLI deps in production | **Fixed** | `shadcn` moved to devDependencies; `npm audit fix` updated `sharp` and `source-map-js`; CI now runs `npm audit --omit=dev --audit-level=high`. Root `tsconfig.json` excludes the separate `mcp-server/` package (it had only compiled because the old `shadcn` hoisted the MCP SDK). |
| **F-03** Template edit/delete on Meta by any member (High) | **Fixed** | `PATCH/DELETE /api/whatsapp/templates/[id]` require admin + Templates edit/delete **before** any Meta call. Test: refused callers never reach Meta. |
| **F-04** Access control not enforced on upstream routes (High) | **Fixed** | New `requireRoleAndPermission(role, module, action)`. It keeps the old role floor and adds the designation matrix on send and react (Inbox write), broadcast and resume (Broadcasts write), automations (write/edit/delete, plus engine edit), flows (write/edit/delete, plus activate edit), quick replies, contact tags (Contacts edit), template submit/sync (Templates write) and flow run history (Flows read). |
| **F-05** WhatsApp config write path | **Partly fixed** | `POST/DELETE /api/whatsapp/config` require admin before Meta `/register` or any write. **Open:** members can still read the encrypted token column (needs moving the server-side token reads to the service role first). |
| **F-15** Silent success on RLS-blocked writes | **Fixed for WhatsApp config** (the role check now runs first). Other update paths unchanged. |
| **F-12** PostgREST filter strings from search boxes | **Fixed** | Shared `sanitizeSearch` (`src/lib/search/sanitize.ts`) used by the contacts page, the appointment patient picker and `/api/v1/contacts`. This also fixed a bug: the old sanitiser stripped Indic vowel signs, which broke Malayalam/Hindi name searches. |
| **F-10** Rate limits | **Register corrected** | `whatsapp/send` (60/min) and `whatsapp/broadcast` and resume (60/min) were already limited; the audit overstated this. Still per-process only. |
| Node 20 EOL | **Fixed** | Docker base and CI → Node 22. |
| F-06 data scope | **Fixed in code; needs migration 063** | Access control has a Data access dropdown per module (all, assigned branch, assigned to them, custom branches). The API routes for Appointments and Leaves enforce it, and migration 063 adds restrictive RLS so browser reads follow it too. Not yet tested by saving a role against live data. |
| F-07 CSP enforcement | Open | Needs a week of report-only data first. |
| F-08 MFA | Open | Feature work (Supabase TOTP + AAL2 checks). |
| F-11 booking race / audit log | **Partly fixed** | Appointment create/edit now refuse an overlap with the same doctor's booking in any branch (409), and the booking dialog reads busy times from `/api/appointments/busy`, which ignores Data access and returns times only. Without that, a role limited to one branch saw another branch's bookings as free slots. **Open:** two requests at the same instant can still both pass (needs a DB exclusion constraint once existing overlaps are cleaned up); no audit log yet. |
| F-13, F-16 privacy | Open | Disclosure, export/erasure and retention are product work. |

## Behaviour changes to tell admins

- **Agents without a designation can no longer delete** automations, flows or quick replies. This matches what Access control has always shown: the agent default has no Delete. Grant Delete in Access control where it's wanted.
- A designation with Inbox, Broadcasts, Automations, Flows, Quick replies, Contacts or Templates switched off now really blocks those actions through the API, not just in the menu.
- Inbound attachments now load through the app (signed-in only). Links copied out of the inbox no longer work outside the app; this is intended.

## Deploy steps

1. Apply migrations 059, 060, 061 and **062** in order.
2. Deploy the new build (Next.js 16.4.6, Node 22 image). Restart any running dev server so it picks up the new Next.js.
3. Run `node --env-file=.env.local scripts/move-inbound-media.mjs` to see what would move, then run it again with `--apply`.
4. Verify: an anonymous `POST /storage/v1/object/list/chat-media` returns `[]`; an inbox photo received before and after the move still opens.

## Verification done

Typecheck clean; lint 0 errors (83 warnings, all pre-existing style rules); **940/940 tests pass** (new: stored-path validation, template authorization, sanitizer, contact-tag 403); production build succeeds; unauthenticated calls to the new media route and to template PATCH/DELETE return 401 on the local server. **Not tested:** signed-in flows in a browser, and migration 062 against a real Supabase project.
