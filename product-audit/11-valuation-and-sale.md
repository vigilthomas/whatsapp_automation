# 11 — Valuation and sale

> **Disclaimer.** These are estimates for planning, not a formal valuation. Multiples come from third-party broker and marketplace summaries (2026), which often recycle the same data. Indian buyers of small software assets typically pay at or below the low end of global ranges. Treat every figure as ±50%.

## 1. What is being valued

| Component | Exclusive to you? | Notes |
|---|---|---|
| Base CRM (inbox, broadcasts, automations, Flows, API, MCP) | **No**: MIT-licensed public template (wacrm, © Arnas Donauskas). Anyone can fork it free | Must keep the MIT notice in any sale |
| Clinic layer (appointments, booking assistant, slot engine, master data, designations/access control, branding, clinic hours, AI handoff), ~40% of the custom code by our reading | **Yes** | The real IP |
| Brand "Clinicoro", domain, design | Yes, if registered | Trademark not checked |
| Customers / revenue | None | The main value driver is missing |

## 2. Scenario A — source code only (no customers)

Method: **replacement cost of the exclusive layer, discounted** for buyer risk (untested in market, solo-built, public base). Replacement estimate [E]: 2–3 developer-months for the clinic layer at Indian rates (₹1–1.5 lakh/month) is ₹2–4.5 lakh. Buyers typically pay 40–80% of replacement for code without traction.

| Package | Realistic value |
|---|---|
| Source code only | **₹1–2.5 lakh** |
| + documentation (this audit, `docs/`, migrations notes) | ₹1.5–3 lakh |
| + deployment config (Docker, CI, migration runner) | ₹1.5–3.5 lakh |
| + polished product (Phase 0–1 of the roadmap done, demo instance) | ₹3–6 lakh |
| + domain + brand + landing page + demo video | ₹4–8 lakh |

**Buyers:** Indian dev agencies selling to clinics, healthcare marketing agencies, a WhatsApp BSP wanting a clinic vertical. **Risks they price in:** public base code, no customers, solo-maintainer knowledge, critical dependency advisory, half-finished data scope.

## 3. Scenario B — finished SaaS, no customers

- **Market value:** ₹3–8 lakh (as above). Strategic value to a BSP can be higher (₹8–15 lakh) *if* they need a clinic vertical now, but expect a long negotiation.
- **Quick-sale price:** ₹1.5–2.5 lakh (marketplace listing, 2–4 weeks).
- **Realistic asking price:** ₹6–8 lakh with a live demo and docs.
- **Sale barriers:** no revenue proof; MIT base lowers exclusivity; buyer needs Meta/WhatsApp know-how.
- **What increases value most:** 10 paying clinics with 3+ months of retention. That roughly 3–5× the price.

## 4. Scenario C — with revenue

Method: **ARR multiple**, the small-SaaS convention. Multiples applied: **Low 1.5×** (high founder dependency, churn unknown), **Base 2.5×**, **High 4×** (low churn, growth >50%/yr, documented processes). Third-party summaries put micro-SaaS at roughly 2–4× ARR, with marketplaces at 3–5× for strong bootstrapped businesses ([17](17-research-sources.md)). An asset floor (Scenario A) applies at small MRR.

| MRR | ARR | Low (1.5×) | Base (2.5×) | High (4×) |
|---|---|---|---|---|
| ₹10,000 | ₹1.2 L | ₹1.8 L (floor ~₹3 L) | ₹3 L | ₹4.8 L |
| ₹25,000 | ₹3 L | ₹4.5 L | ₹7.5 L | ₹12 L |
| ₹50,000 | ₹6 L | ₹9 L | ₹15 L | ₹24 L |
| ₹1,00,000 | ₹12 L | ₹18 L | ₹30 L | ₹48 L |
| ₹2,00,000 | ₹24 L | ₹36 L | ₹60 L | ₹96 L |
| ₹5,00,000 | ₹60 L | ₹90 L | ₹1.5 Cr | ₹2.4 Cr |

**Assumptions:** monthly logo churn ≤3% for base/high; no single customer >15% of MRR; gross margin >70% (needs shared hosting); founder hands over runbooks. For profitable businesses below ~₹40 lakh ARR, buyers often switch to 2.5–4× annual profit (SDE), which can come out lower than the revenue multiples.

## 5. Scenario D — strategic acquirers

| Acquirer | Why they'd buy | Due-diligence asks |
|---|---|---|
| WhatsApp BSPs (Interakt/WATI/AiSensy tier, or smaller BSPs) | Ready clinic vertical, booking engine | Customer list, churn, Meta compliance, code ownership (MIT notice), security review |
| Clinic software vendors (Practo-like, dental tools) | Native WhatsApp booking they lack (reported) | Integration effort, data model fit, DPDP posture |
| Healthcare marketing agencies | White-label product for their clinic clients | Branding/multi-clinic, support load |
| Entrepreneurs / indie buyers | Cash-flowing micro-SaaS | Revenue proof, hours/week to run |

## 6. Final valuation opinion

| | Conservative | Realistic | Optimistic |
|---|---|---|---|
| Current value (as is) | ₹1 L | ₹2.5 L | ₹4 L |
| Quick-sale value | ₹1 L | ₹1.5–2.5 L | ₹3 L |
| Recommended asking price (after Phase 0–1 + demo) | — | **₹6–8 L** | — |
| Strategic buyer price | ₹5 L | ₹8 L | ₹15 L |
| With 10 paying clinics (~₹30k MRR, 3+ months) | ₹6 L | ₹9 L | ₹14 L |
| At ₹50,000 MRR | ₹9 L | ₹15 L | ₹24 L |
| At ₹1 lakh MRR | ₹18 L | ₹30 L | ₹48 L |

**Honest summary:** commercially it's worth little today, because the code that is exclusively yours is a few months of work on top of a free template. The fastest way to multiply the value is to add paying clinics, not more features.
