# 10 — Business logic security

| # | Workflow | Abuse / failure | Evidence | Impact | Severity | Fix |
|---|---|---|---|---|---|---|
| BL-1 | Booking (desk + WhatsApp bot) | Two bookings for the same doctor and time when booked concurrently; availability is checked in app code only | `booking/slots.ts` `isFree` then insert; no DB constraint | Double-booked patients, clinic trust | Medium (F-11) | Exclusion constraint + retry message |
| BL-2 | Broadcasts | A low-privilege agent (designation without Broadcasts) sends to all patients | `whatsapp/broadcast` uses `requireRole('agent')` | Marketing fees (~₹0.86/msg), spam reports, number quality rating drop | High (F-04) | `requirePermission('broadcasts','write')`, per-plan caps, confirmation for >500 recipients |
| BL-3 | Templates | Viewer deletes an approved reminder template at Meta | F-03 | Reminders stop; re-approval takes days | High | Permission before Meta call |
| BL-4 | AI assistant | Patient floods chat → token cost; or provokes off-policy replies | Reply cap per chat ✅, facts-only prompt, JSON-or-handoff ✅ | Cost, reputational | Low | Daily account cap; log AI decisions |
| BL-5 | AI handoff | Handoff assigns to a member who later leaves | `handoff_agent_id` FK `ON DELETE SET NULL`; membership checked on save, not at handoff time | Chat assigned to a non-member, no notification | Low | Re-check membership at handoff; fall back to owner |
| BL-6 | Appointment status | Any editor can move completed → scheduled, or delete history | No transition rules; hard DELETE route | Data integrity / dispute evidence | Medium | Allowed transitions; soft delete; audit log |
| BL-7 | Invitations | Reusing or forwarding links | Hashed, expiring, single-use ✅ | — | Info | — |
| BL-8 | Clinic hours | Staff book on a closed day (intended override) | Dialog warns, server accepts | Intentional | Info | Optionally require edit permission to book on closed days |
| BL-9 | Ownership transfer | Hijacked owner session transfers ownership | `requireRole('owner')`, no re-auth | Account takeover persistence | Medium | Re-auth/MFA before transfer |
| BL-10 | Subscription/trial | n/a: no billing yet | — | — | — | Design plan limits server-side when billing ships (never trust the client's plan) |
| BL-11 | Chat Human/Bot switch | Agent turns Bot on for a chat the clinic wanted human-only | Requires `ai-assistant:edit` ✅ | Low | Low | Log mode changes |
