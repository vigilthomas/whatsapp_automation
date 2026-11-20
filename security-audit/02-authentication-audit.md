# 02 — Authentication

| Area | Implementation | Assessment |
|---|---|---|
| Registration | Supabase Auth `signUp` (`(auth)/signup`) | Standard. Email confirmation setting **not tested** (dashboard config) |
| Login | `signInWithPassword` then full-page redirect (`login/page.tsx`) | Errors show Supabase's message ("Invalid login credentials"), which is generic and doesn't enumerate accounts |
| Password storage | Supabase (bcrypt) | Never handled by app code ✅ |
| Password policy | Supabase dashboard | **NOT TESTED**. Recommend min 10 chars + leaked-password check (Supabase Pro feature) |
| Password reset | `forgot-password` → Supabase recovery link | Token lifetime/one-time use handled by Supabase; **not tested** |
| Brute force | Supabase Auth rate limits | **NOT TESTED** (not in repo); app adds none on sign-in |
| Logout / session revocation | Supabase `signOut`; Settings → Login & security offers sign-out of devices | ✅ (UI present) |
| Session handling | `@supabase/ssr` cookies, refreshed in `middleware.ts` (copies refreshed cookies onto every response, issue #288) | Correct pattern. Cookies are JS-readable by design (see F-07) |
| MFA | None | **F-08 (Medium)**: owners, admins and the super admin should require TOTP |
| Invitations | Random token, SHA-256 at rest, rate-limited peek/redeem | ✅ |
| Staff created by admin (Master → Users) | `api/account/users` with `requirePermission('users','write')`, service role creates the auth user with a password set by the admin | Admin knows the staff password. Recommend forcing a password change at first login |
| Super admin | `super_admins` table, no app write path, `is_super_admin()` SECURITY DEFINER | ✅ Strong: can't be self-granted |
| Privilege columns | Trigger blocks members changing `account_role`, `designation_id`, `branch_id`, etc. on their own profile | ✅ |
| Re-authentication for sensitive actions | None (ownership transfer, member removal, WhatsApp token change) | Medium: require recent sign-in or MFA |

**Recommendations:** enable MFA (AAL2) for admin-class actions; set the Supabase password policy and leaked-password protection; force a password change for admin-created staff; add re-auth before ownership transfer and WhatsApp/AI key changes.
