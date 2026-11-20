# Clinicoro — Security audit (20 November 2026)

**Verdict: HIGH RISK — major fixes required · Score 5.0/10 · 1 Critical, 3 High, 7 Medium, 5 Low**

**Update:** F-01, F-02, F-03, F-04, F-09, F-12 and F-14 are fixed in code (see [19](19-remediation-status.md)); migration 062 and the media move script still need running.

Fix first: **F-01**, the `chat-media` storage bucket. Its SELECT policy is open to anyone holding the public anon key, and inbound patient media is mirrored into it.

| # | Report |
|---|---|
| 00 | [Executive summary](00-executive-summary.md) |
| 01 | [Attack surface](01-attack-surface.md) |
| 02 | [Authentication](02-authentication-audit.md) |
| 03 | [Authorization, IDOR, tenant isolation](03-authorization-and-idor.md) |
| 04 | [API security](04-api-security.md) |
| 05 | [Database & SQL injection](05-database-security.md) |
| 06 | [Tokens & sessions](06-token-and-session-security.md) |
| 07 | [Input/output, XSS, injection](07-input-and-output-security.md) |
| 08 | [Rate limiting & abuse](08-rate-limiting-and-abuse.md) |
| 09 | [File upload & storage](09-file-upload-and-storage.md) |
| 10 | [Business logic](10-business-logic-security.md) |
| 11 | [Infrastructure & secrets](11-infrastructure-and-secrets.md) |
| 12 | [Dependencies](12-dependency-security.md) |
| 13 | [Privacy & data protection](13-privacy-and-data-protection.md) |
| 14 | [Test matrix (50 tests)](14-security-test-matrix.md) |
| 15 | [Vulnerability register](15-vulnerability-register.md) |
| 16 | [Remediation roadmap](16-remediation-roadmap.md) |
| 17 | [Final verdict](17-final-security-verdict.md) |
| 18 | [Sources](18-research-sources.md) |
| 19 | [Remediation status: what was fixed](19-remediation-status.md) |

**Report:** [SaaS_Security_Audit_Report.pdf](SaaS_Security_Audit_Report.pdf) (source: [SaaS_Security_Audit_Report.md](SaaS_Security_Audit_Report.md)).

**Scope and limits:** static review of the full repository and migrations, plus a dependency audit and unit tests. No live exploitation, no production access, and no signed-in dynamic testing. Supabase dashboard settings were not reviewed. No fixes were applied during the audit itself.
