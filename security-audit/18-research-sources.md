# 18 — Research sources and references

Accessed 20 November 2026.

## Frameworks

| Reference | Used for |
|---|---|
| [OWASP Top 10 (2021, current edition at time of audit)](https://owasp.org/Top10/) | A01–A10 mapping |
| [OWASP API Security Top 10 (2023)](https://owasp.org/API-Security/editions/2023/en/0x11-t10/) | API1–API10 mapping |
| [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/) | Control checklist |
| [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) | BFLA/BOLA guidance |
| [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html) | Storage review |
| [OWASP Top 10 for LLM Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/) | AI assistant review |
| [CVSS v4.0 specification (FIRST)](https://www.first.org/cvss/v4.0/specification-document) | Severity reasoning |
| [Supabase Storage access control docs](https://supabase.com/docs/guides/storage/security/access-control) | `storage.objects` SELECT governs listing; public buckets serve objects without RLS |

## Advisories

| Source | Supports |
|---|---|
| [Next.js August 2026 security release](https://nextjs.org/blog/august-2026-security-release) | CVE-2026-75604 (Windows RCE) and AVIF RCE; fixed in 16.3.3 |
| [Vercel changelog](https://vercel.com/changelog/nextjs-august-2026-security-release) | Same |
| [CSA research note](https://labs.cloudsecurityalliance.org/research/csa-research-note-nextjs-avif-windows-rce-cve-2026-75604-202/) | Exploit conditions |
| [The Hacker News: Oct 2026 out-of-band patch](https://thehackernews.com/2026/10/nextjs-ships-out-of-band-patch-for-two.html?hl=ru) | 16.4.1 critical fixes |
| [GitLab advisory GHSA-2xp9-vwfh-vxw4](https://advisories.gitlab.com/npm/next/GHSA-2xp9-vwfh-vxw4/) | AVIF advisory |
| `npm audit --omit=dev --json` (local, 20 Nov 2026) | Dependency table |

## Privacy law

| Source | Supports |
|---|---|
| [PIB: DPDP Rules 2025 notified](https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf) | Official notification, 18-month phase-in |
| [Taxmann analysis](https://www.taxmann.com/post/blog/analysis-indias-dpdp-act-and-rules) | Fiduciary duties |
| [Corpus Juris timeline](https://www.corpusjurislegal.com/resources/legal-updates/dpdp-rules-notification-2026) | ~May 2027 core obligations |

## Code evidence

Paths are cited inline in each report. Key files: `supabase/migrations/023_chat_media.sql`, `039_inbound_media_mirror.sql`, `src/app/api/whatsapp/templates/[id]/route.ts`, `src/lib/auth/permission-guard.ts`, `src/lib/rate-limit.ts`, `next.config.ts`, `Dockerfile`, `package.json`.
