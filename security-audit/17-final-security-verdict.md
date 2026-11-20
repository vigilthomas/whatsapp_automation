# 17 — Final security verdict

## Scorecard

Scores account for untested areas (they cap the score) and uncertainty.

| Category | Score | Evidence | Risk |
|---|---:|---|---|
| Authentication | 6 | Supabase Auth, generic errors, invitations hashed; no MFA; dashboard settings untested | Medium |
| Authorization | 5 | Strong matrix + RLS on new code; BFLA on templates; designation bypass on upstream routes | High |
| Session management | 7 | Correct SSR cookie refresh, `getUser` validation | Low |
| Token security | 8 | Hashed API/invite tokens, AES-GCM secrets, keys never returned | Low |
| API security | 6 | v1 solid; session routes uneven | Medium |
| SQL injection prevention | 9 | PostgREST + static SQL; minor filter-string issue | Low |
| Input validation | 8 | Whitelisting parsers throughout new code | Low |
| XSS protection | 7 | No user HTML sinks; CSP not enforced | Medium |
| CSRF protection | 7 | SameSite + JSON; no explicit tokens | Low |
| Rate limiting | 4 | In-memory; missing on costly routes; auth limits untested | Medium |
| Tenant isolation | 4 | RLS good for tables; **storage listing breaks it** | Critical |
| File security | 3 | Patient media in a publicly listable bucket | Critical |
| Business logic security | 5 | Booking race, broadcast cost abuse | Medium |
| Secrets management | 8 | No leaks; env-only; no rotation tooling | Low |
| Infrastructure | 6 | Non-root container, headers; Node 20 EOL; TLS/backups untested | Medium |
| Dependency security | 4 | Critical Next.js range; CLI deps in production | High |
| Logging & monitoring | 3 | No audit log, no alerting | Medium |
| Privacy & data protection | 3 | No export/erasure/retention; media exposure | High |

**Application security 5.4 · Authentication 6.0 · API security 6.0 · Data protection 3.3 · Infrastructure 5.0 → Overall 5.0 / 10. Overall risk: HIGH.**
Method: the unweighted mean of the 18 categories is 5.7. It's reduced to 5.0 because an unfixed Critical finding caps the score, and because Supabase Auth settings, infrastructure and backups were not tested.

## Answers

1. **Safe to deploy publicly?** Not with real patient data until F-01 is fixed and Next.js is upgraded.
2. **Safe with paying customers?** After the P0 + P1 items (about one week of work) and a privacy policy/DPA.
3. **Biggest weakness:** storage policies. Patient media can be listed with the public anon key (F-01).
4. **Authentication sufficient?** Basically yes for a pilot; add MFA for owners/admins.
5. **Authorization sufficient?** No: F-03 and F-04.
6. **Realistic IDOR risk?** Low for table records (well filtered); **high for storage objects**.
7. **Tenant isolation risk?** Yes, through storage (F-01). Tables are well isolated.
8. **SQL injection possible?** No path found.
9. **APIs properly protected?** v1 yes; several session routes need permission checks.
10. **Access/refresh tokens secure?** Yes (Supabase-managed); XSS would expose them (enforce CSP).
11. **Rate limiting sufficient?** For one instance and authenticated users, partially; not for send/broadcast cost abuse.
12. **Can users escalate privileges?** Not their role; but they can perform functions their designation forbids on upstream routes (F-04) and delete templates (F-03).
13. **Can sensitive information leak?** Yes: F-01 (media); members can read encrypted WhatsApp token ciphertext (F-05, low impact).
14. **File upload/download secure?** Uploads yes; downloads/listing no.
15. **Vulnerable to common OWASP attacks?** A01 (access control) and A06 (components) yes; A03 injection no; A07 partial (no MFA).
16. **Fix immediately:** F-01.
17. **Fix before public launch:** F-02, F-03, F-04 (+ privacy documents).
18. **After launch:** F-05–F-16 per the roadmap.
19. **Missing controls:** MFA, audit logging, enforced CSP, DB overlap constraint, data export/erasure, shared rate limiting, CI security gates.
20. **Score:** **5.0 / 10**.

## Final verdict: **HIGH RISK — major fixes required**

The foundations are better than average: RLS everywhere, hashed keys, encrypted secrets, HMAC webhooks, careful service-role filtering in the newer code. The critical issue is one storage policy, and it's quick to fix. After P0/P1 the expected verdict is **CONDITIONALLY READY**.

**Limitations:** static review only for signed-in flows; Supabase dashboard settings, production infrastructure, backups and real WhatsApp traffic were not tested; the storage finding was confirmed from policy definitions, not by listing a live bucket.
