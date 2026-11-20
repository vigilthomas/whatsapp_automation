# 05 — Database security and SQL injection

## SQL injection

| Location | Pattern | Verdict |
|---|---|---|
| All app queries | Supabase JS (PostgREST): parameters sent as URL-encoded filter values, not SQL | No SQL injection path found |
| Raw SQL | Only in migrations (static) and `rpc()` calls with typed arguments (`claim_ai_reply_slot`, `can_edit_branding`, …) | Safe |
| Dynamic SQL in functions | `055` uses `EXECUTE format('… %I …', tbl)` over a **hard-coded** table list | Safe (identifiers quoted, no user input) |
| PostgREST `.or()` strings | `contacts/page.tsx`, `appointment-dialog.tsx` interpolate search text; `/api/v1/contacts` sanitises first | **Filter injection (not SQL)**, bounded by RLS to the caller's own account: **Low (F-12)** |
| Sorting / pagination | Fixed columns; v1 keyset cursors are opaque and validated | Safe |
| Master entity table names | Chosen from a server-side registry (`MASTER_ENTITIES[slug]`) after `isMasterEntitySlug` | Safe |

**Safe reproduction for F-12 (local):** search contacts for `x,name.neq.zzz`. More rows return than the literal text should match, but only your own account's rows. Fix: reuse `sanitizeSearch`.

## Database privileges and RLS

| Check | Result |
|---|---|
| RLS enabled on every tenant table | ✅ (migration review) |
| Membership helper `is_account_member` SECURITY DEFINER with `search_path` pinned, owned by postgres | ✅ |
| `super_admins` unreadable by clients (no policies, privileges revoked) | ✅ |
| New tables `clinic_settings` (060): SELECT members only; INSERT/UPDATE/DELETE revoked; writes via API | ✅ |
| `conversations.ai_mode` (061): column added under existing RLS | ✅ |
| Service-role key only on the server (`SUPABASE_SERVICE_ROLE_KEY`, never `NEXT_PUBLIC_`) | ✅ |
| App DB user privileges | The service role bypasses RLS by design; every service-role query must filter `account_id`. Spot-checked: appointments, master, AI runner, clinic, booking runner ✅ |
| **Storage RLS** | **FAIL**: public SELECT policies on `chat-media`, `avatars`, `flow-media` (F-01, F-14) |
| Error leakage | Routes return `error.message` from PostgREST (e.g. constraint names) | Low: acceptable for an internal app; avoid on public v1 (already enveloped) |

## Integrity

- No overlap constraint for a doctor's appointments (race between desk and bot): **F-11**.
- Soft delete on master data keeps referential history ✅. Hard delete on appointments (`DELETE /api/appointments/:id`) loses history; prefer status `cancelled` plus an audit row.
- Migration 058 is missing from the sequence (reserved for data scope). The runner must not assume contiguous numbering.

## Backups

Not in the repository. **NOT TESTED.** Supabase Pro offers daily backups and PITR as an add-on. For health data, enable PITR and test a restore quarterly.
