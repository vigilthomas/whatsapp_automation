# 07 — Input validation, XSS, injection

## Validation by entry point

| Input | Validation | Verdict |
|---|---|---|
| Appointment body | `validateAppointmentInput`: whitelisted keys, ISO dates, end > start, status enum | ✅ |
| Master records | `sanitizeMasterInput` per field type; refs checked in account | ✅ |
| Designation permissions JSON | `parsePermissions`: known modules/actions only, de-duplicated | ✅ |
| Clinic settings (new) | `parseClinicSettings`: time/date regexes, length caps, list caps | ✅ |
| AI settings (new) | provider enum, model regex, key length, 1–20 cap, instructions ≤4,000 | ✅ |
| Booking config | `parseBookingConfig` with limits | ✅ |
| Branding | hex colours, logo type sniffing (`sniffImage`), 512 KB cap, https-only links | ✅ |
| Sidebar menu JSON | `resolveMenu`/`customGroupsOf` sanitise on read (ids, labels, icon allow-list) | ✅ Written from the browser under RLS (`can_edit_branding`) |
| WhatsApp config POST | presence checks; PIN regex | Partial (F-05) |
| Contacts CSV import | client-side parse, server insert under RLS | Acceptable |
| Search boxes | see F-12 | Low |

## XSS

- React escapes all rendered strings. **No user-controlled `dangerouslySetInnerHTML`**: the four uses render static theme boot code (`layout.tsx`) and developer-authored translation strings (`whatsapp-config.tsx`, `import-modal.tsx`).
- Message bubbles render text as text. Links are formatted without raw HTML (spot-checked `message-bubble.tsx`).
- The logo can be an SVG uploaded as a data URL and is rendered via `<img src>`, so scripts inside the SVG don't execute in `<img>` context ✅.
- CSP is report-only (F-07).

**Result: no exploitable XSS found (code review, not fuzzed).**

## Other injection classes

| Class | Finding |
|---|---|
| Command injection | No `child_process` use in app code ✅ |
| Path traversal | Storage paths built by `buildMediaPath` from sanitised names (`[^a-zA-Z0-9_-]` stripped) under `account-<id>/` ✅ |
| SSRF | Outbound webhooks validated by `lib/webhooks/ssrf.ts` (private, link-local, metadata blocked). Logo links are https-only but fetched by the *browser*, not the server ✅. AI and Meta URLs are constants ✅ |
| Open redirect | Login redirects to `/dashboard` or `/join/<encoded token>` only ✅ |
| Template injection | None (no server templating of user strings) |
| Prompt injection (AI) | Possible to make the bot say odd things to the same patient; no tools or data to exfiltrate; output must parse as JSON or it hands off (F-13, Low) |
| Header/CRLF injection | No user input in response headers found |
| Unsafe deserialisation | Only `JSON.parse` of trusted/validated payloads ✅ |
