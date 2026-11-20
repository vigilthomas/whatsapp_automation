# 10 — Pricing and monetization

All figures are **estimates [E]** unless sourced. Competitor prices are third-party reported ([06](06-competitor-analysis.md)). GST (18%) is extra everywhere.

## 1. Cost to serve (per clinic per month) [E]

| Item | Assumption | ₹/month |
|---|---|---|
| Hosting (shared VPS + Supabase Pro share) | 20 clinics per instance; Supabase Pro ~$25 + VPS ~$20 shared | 200–350 |
| Single-tenant install (if one per clinic) | Small VPS + Supabase project | 1,200–2,500 |
| Meta fees | **Pass through at cost**; 300 utility reminders × ₹0.115 ≈ ₹35; service replies free up to 1,000 | 0 to you |
| AI tokens | Clinic's own key (BYO) by default; or bundled: ~600 replies × ~₹0.15 | 0–100 |
| Payment gateway | ~2% of subscription | 40–140 |
| Support (your time) | 1 hour/clinic/month valued at ₹500 | 500 |
| **Total (shared)** | | **~₹750–1,100** |

Implication: below ₹1,500/month the business barely covers support. **Shared multi-tenant hosting is needed for margins.** Single-tenant installs should carry a setup fee and a higher price.

## 2. Model options

| Model | Fit | Verdict |
|---|---|---|
| Freemium | High support cost, low intent in clinics | ❌ |
| **Free trial (14 days, card not required) + paid pilot** | Clinics need to see bookings happen | ✅ |
| **Per-clinic (per-location) monthly** | Matches buyer mental model | ✅ primary |
| Per-user | Penalises adding the doctor | ❌ (include 3–5 seats) |
| Usage-based | Meta fees already usage-based; don't add more | Only Meta pass-through |
| Annual prepay | Indian SMBs accept 2 months free | ✅ |
| Setup fee | Covers WhatsApp migration + data import | ✅ (₹3,000–10,000) |
| White-label/agency | Positioning C | ✅ later |

## 3. Three strategies

**A — Low-cost entry:** ₹999 / ₹1,999. *Pros:* easy yes. *Cons:* margin close to zero after support; signals "cheap tool"; can't afford in-person onboarding. *Risk:* stuck in AiSensy's price band.

**B — Balanced (recommended):** ₹1,999 / ₹3,499 / ₹6,999. *Pros:* at or below WATI/Interakt + AI add-on totals, but includes booking + AI; covers support. *Cons:* above Practo Ray's entry. *Risk:* must prove value in the trial (reports).

**C — Premium:** ₹4,999 / ₹9,999 / custom. *Pros:* fewer, serious clinics; funds a support hire. *Cons:* long sales; needs case studies you don't have. *Risk:* low conversion early.

## 4. Recommended price table (Strategy B)

| Plan | Target | Features | Limits | Monthly | Annual (2 months free) |
|---|---|---|---|---|---|
| **Starter** | 1–2 doctor clinic | Inbox, appointments, WhatsApp booking assistant, reminders & confirmations, clinic hours | 1 branch, 3 staff seats, 2 doctors | **₹1,999** | ₹19,990 |
| **Clinic** (most popular) | 3–5 doctors | Starter + AI assistant with handoff (BYO key or 1,000 bundled replies), reports, review requests, roles | 1 branch, 8 seats, 6 doctors | **₹3,499** | ₹34,990 |
| **Multi-branch** | Groups | Clinic + branches, data scope per branch, branding/lockscreen, priority support | 3 branches (+₹1,500 each extra), 20 seats | **₹6,999** | ₹69,990 |
| **Agency / white-label** | Agencies | Multiple clinics, own brand, sidebar/menu presets | Per clinic | ₹1,200–1,800 per clinic (min 10) + ₹25k setup | Custom |

- **Meta fees:** passed through at cost (show the meter). Say "no markup" loudly. Markups are a common complaint about BSPs [R].
- **Setup:** ₹4,999 one-off (waived on annual), covering WhatsApp migration, doctors/services import and staff training.
- **Trial:** 14 days, or a 30-day paid pilot at ₹999 for the first 10 clinics (validates willingness to pay better than free).
- **Upgrade triggers:** 3rd doctor, 2nd branch, AI bundle exhausted, staff seats.
- **Add-ons:** extra branch ₹1,500; AI reply packs (₹499 per 1,000 bundled replies); Embedded Signup assistance.

## 5. Bottom-up opportunity [E]

| Step | Value | Basis |
|---|---|---|
| Clinics reachable in year 1 (Kerala + 2 metros, dental/derm/physio/eye, 2+ staff) | ~3,000 | [A] founder-reachable estimate, not a census |
| Realistic paying in 12 months | 30–80 | 1–3% of reachable via direct sales |
| Blended ARPU | ~₹3,000 | Mix of plans |
| **MRR at 12 months** | **₹0.9–2.4 lakh** | 30–80 × ₹3,000 |

That's a realistic solo-founder outcome, not a venture-scale market claim.
