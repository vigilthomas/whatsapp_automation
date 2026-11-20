# 08 — Rate limiting and abuse protection

**Implementation:** `src/lib/rate-limit.ts`, a fixed-window in-memory Map per process (documented as single-instance only).

| Endpoint group | Limited? | Abuse risk | Recommended limit |
|---|---|---|---|
| Supabase sign-in/sign-up/reset | Supabase Auth (not in repo) | Credential stuffing, email bombing | **NOT TESTED**: confirm in the Supabase dashboard (e.g. 30 sign-ins/5 min/IP, 3 reset emails/hour/address); enable CAPTCHA on sign-up |
| Account, members, invitations, API keys | ✅ | Low | — |
| Invitation peek/redeem (public) | ✅ | Token guessing (infeasible, 32-byte tokens) | — |
| `/api/v1/*` | ✅ per key | Scraping | Keep |
| `whatsapp/broadcast` | ❌ | **Cost abuse**: thousands of marketing messages at ~₹0.86 each | 5 broadcasts/hour/account; recipient cap per plan |
| `whatsapp/send`, `react` | ❌ | Spam from a compromised agent account | 60/min/user |
| AI assistant (webhook-driven) | Per-chat reply cap via `claim_ai_reply_slot` ✅ | Token cost if a patient floods the chat | Also cap per account per day |
| `conversations/:id/ai-mode` | ❌ | Low | 30/min/user |
| `appointments`, `master`, `clinic-settings` | ❌ | Low (authenticated) | 120/min/user |
| `whatsapp/webhook` | ❌ (HMAC protects authenticity) | Replay of valid deliveries: duplicates are deduplicated by the `(conversation_id, message_id)` unique index (037) ✅ | — |
| Cron routes | Secret | — | — |

## Bypass considerations

- In-memory limits reset on restart and aren't shared across instances. Use Upstash/Redis before horizontal scaling.
- IP-based keys behind a proxy depend on trusting `X-Forwarded-For` only from your proxy. Configure the reverse proxy to overwrite, not append, client-supplied values.

No high-volume tests were run (by rule).
