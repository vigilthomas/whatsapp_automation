# 06 — Tokens, sessions and cookies

| Credential | Generation | Storage | Validation | Lifetime/rotation | Assessment |
|---|---|---|---|---|---|
| Supabase access JWT + refresh token | Supabase Auth | `sb-*` cookies via `@supabase/ssr` (JS-readable) | Server `auth.getUser()` re-validates with Supabase (not just decoding) ✅ | Supabase defaults (1 h access; rotating refresh) | Good; the XSS impact is amplified because cookies aren't HttpOnly (F-07) |
| API keys `wacrm_live_…` | 32 random bytes, base64url | SHA-256 hash in DB | timing-safe compare, scopes | Revocable; no expiry by default | Good; recommend optional expiry |
| Invitation tokens | random | SHA-256 hash | hash lookup, expiry | single-use redeem | Good |
| WhatsApp access token | from Meta (user-supplied) | AES-256-GCM (`ENCRYPTION_KEY`) | decrypted server-side only | manual rotation | Good; ciphertext readable by members (F-05) |
| AI provider key (new) | user-supplied | AES-256-GCM | server-side only; never returned | replace by re-entering | Good |
| Webhook verify token | user-chosen | plaintext column | compared on GET handshake | static | Low risk; readable by members |
| Outbound webhook secrets | generated | stored for signing | HMAC on delivery | rotatable | Good |
| `CRON_SECRET` | env | env | header compare | static | Ensure ≥32 random chars; compare in constant time |

## Cookie attributes

`@supabase/ssr` sets `SameSite=Lax`, `Secure` in production, `Path=/`. Not `HttpOnly`, because the browser client reads them. Middleware refreshes and copies cookies on every response (prevents the session wedge in issue #288) ✅.

## Logout and revocation

- Sign-out clears local cookies; "sign out of other devices" exists in Settings → Login & security.
- **Gap:** changing a member's designation or removing them doesn't revoke their live session. The next API call re-reads permissions (`loadPermissions` on each request), so authorization changes take effect immediately ✅, but a removed member's JWT stays valid until expiry. Profile/account lookups then fail closed (no account) ✅.

## JWT-specific checks

Algorithm confusion, weak secrets, and audience/issuer checks are delegated to Supabase (`getUser` calls the Auth server). There is no custom JWT handling in the code ✅.
