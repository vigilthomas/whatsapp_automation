# 00 — Executive summary

**Product:** Clinicoro (repository `whatsapp_automation`, package `wacrm` v0.8.0)
**Audit date:** 20 November 2026 · **Branch audited:** `feat/migrations-and-booking` plus uncommitted work in the working tree
**Auditor stance:** skeptical, commercial. Code findings were read directly from the source. Market figures come from third-party pages (dated in [17-research-sources.md](17-research-sources.md)) and are labelled as such.

## What you actually have

Clinicoro is a **WhatsApp-first front desk for small clinics**. It is built on the MIT-licensed open-source template **wacrm** (Arnas Donauskas; 601 of the 739 commits in this repository are upstream). On top of that template you added a clinic vertical:

| Layer | Origin | Evidence |
|---|---|---|
| Shared inbox, contacts, broadcasts, templates, automations, Flows, public REST API, outbound webhooks, API keys, MCP server | **Upstream template** (free, public) | `git log` authorship; `LICENSE` (MIT) |
| Appointments (calendar, list, dialog, slots), Master data (branches, doctors, services, doctor-services, leaves, users, roles), WhatsApp **booking assistant**, designation-based **Access control**, **Branding** (logo, colours, sidebar menu, lockscreen), **Settings → Clinic** (hours, holidays, closed dates), **AI assistant** with a Human/Bot switch per chat | **Your work** (migrations 041–061) | `src/lib/booking/*`, `src/lib/appointments/*`, `src/lib/auth/permissions.ts`, `src/lib/clinic/*`, `src/lib/ai-chat/*` |

The engineering quality is **above average for a solo product**. The code is typed throughout, there are 929 unit tests across 86 files, every route checks permissions, and the doc comments explain why things are done. It is **not a business yet**. There is no billing, no self-serve onboarding, no customers, and no landing page. One production-relevant dependency (`next` 16.2.12) is in a critical advisory range.

## Rating

| Dimension | Score /10 |
|---|---:|
| Technical quality | **6.6** |
| UI/UX | **6.4** |
| Product (fit, completeness, usefulness) | **6.0** |
| Market competitiveness | **4.6** |
| Commercial readiness | **2.4** |
| **Overall (weighted)** | **5.1 / 10** |

**Stage: late MVP / private beta.** It is feature-rich but commercially unproven. See [04-technical-audit.md](04-technical-audit.md) and the scorecard in [16-final-verdict.md](16-final-verdict.md).

## The five things that matter most

1. **The real asset is the clinic workflow, not the WhatsApp CRM.** Indian WhatsApp CRMs are crowded and cheap, at roughly ₹1,500–₹3,800/month entry plans (Interakt, WATI, AiSensy, Gallabox, DoubleTick). Clinic software is cheap too (Practo Ray, Eka Care, Clinicea). Third-party comparisons say the clinic tools are weak at **booking inside WhatsApp**, and that gap is what Clinicoro already does.
2. **Too much generic surface.** Pipelines and deals, Flows, Automations, broadcasts, the public API, outbound webhooks and the MCP server all come from a horizontal CRM template. A receptionist doesn't need them, and every one adds support and security load. Hide them behind an "Advanced" switch ([08-remove-simplify.md](08-remove-simplify.md)).
3. **Fix before anyone pays:** close the **public `chat-media` storage bucket**. Inbound patient photos and documents are mirrored there, and its read policy is open to anyone holding the public anon key (security F-01, Critical). Also upgrade `next` (critical advisories), stop any member deleting WhatsApp templates on Meta (F-03), run migrations 058–061 in order, finish or remove the half-built data-scope feature (058 is reserved but missing), and add billing.
4. **Price for clinics, not marketers.** Recommended: **₹1,999 / ₹3,499 / ₹6,999 per month per clinic** (Starter, Clinic, Multi-branch). Meta message fees pass through at cost. Details in [10-pricing-monetization.md](10-pricing-monetization.md).
5. **Valuation today is modest and honest.** As is, roughly **₹1–4 lakh** (realistic about ₹2.5 lakh), because the base template is free and public. As a polished product with a domain and a demo, **₹4–8 lakh**. At ₹1 lakh MRR with low churn, about **₹18–48 lakh** (base about ₹30 lakh). Revenue is the only lever that moves this number much ([11-valuation-and-sale.md](11-valuation-and-sale.md)).

## Recommendation

**Continue. Narrow the product, fix the critical items, and launch a paid pilot with 5–10 dental and outpatient clinics in one Indian city within 60 days.** Don't sell now: a pre-revenue fork of a public template fetches little, and the vertical layer is worth far more once there are paying clinics.

## What was not verified

- Signed-in screens were **not exercised in a browser** during this audit (sign-in requires the owner's password). The UI findings come from source review plus the public sign-in pages.
- No production deployment, database, or traffic was examined. No load tests were run.
- Competitor prices come from **third-party comparison pages, not vendors' live pricing pages**, and sometimes conflict. Ranges are shown.
- No market size is quoted, because no reliable, primary figure was found.
