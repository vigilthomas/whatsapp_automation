# 05 — Market research

Research date: **20 November 2026**. Labels: **[F]** verified fact (multiple consistent sources or official), **[R]** research finding from third-party pages (may conflict), **[E]** estimate, **[A]** assumption, **[O]** strategic opinion. Sources: [17-research-sources.md](17-research-sources.md).

## 1. Market size

**Not quoted.** No primary, reliable figure was found for "WhatsApp clinic software in India" or "WhatsApp CRM in India". The numbers circulating on vendor blogs are unsourced. Instead of inventing one, this audit sizes the opportunity bottom-up in [10-pricing-monetization.md](10-pricing-monetization.md) (a reachable-clinic count × ARPU) and labels it as an estimate.

## 2. What the market looks like

| Finding | Label | Notes |
|---|---|---|
| The Indian WhatsApp-CRM market is crowded with BSP-led tools: Interakt, WATI, AiSensy, Gallabox, DoubleTick and many smaller ones | [R] | Every comparison page lists 9–11 vendors |
| Entry plans cluster at **₹1,500–₹3,800/month**; mid tiers ₹3,200–₹6,500; top tiers ₹13,000–₹18,500 | [R] | Prices conflict between sources by 10–25%; see 06 |
| Meta's per-message fees are billed on top: marketing ≈ **₹0.86/message**, utility/authentication ≈ **₹0.115** for +91 numbers (from 1 July 2026 card) | [R] | Consistent across 5+ pages; not checked against Meta's own page |
| From **1 Oct 2026**, free-form replies inside the 24-hour service window are charged at the utility rate, with **1,000 free service messages per month per number** | [R] | Directly affects AI-bot replies' running cost |
| BSPs add markups on Meta fees (e.g. ~15% reported for Gallabox) and charge extra for chatbots/AI (₹2,000–₹3,000/month add-ons) | [R] | Hidden cost is a common complaint |
| Clinic management software in India is priced low: Practo Ray ~₹999–₹1,999/month (reported), Eka Care ₹16,999–₹1,00,000/year, Clinicea ₹1,999–₹3,999/month per practitioner, dental tools ₹8k–₹38k/year | [R] | Mostly competitor comparison blogs |
| Comparison pages describe mainstream clinic tools' WhatsApp support as **reminders only or limited**; native WhatsApp self-booking is rare | [R] | This is the gap Clinicoro fills, but the claim comes from interested parties |
| DPDP Rules notified Nov 2025; core data-fiduciary obligations apply ~**May 2027** (18-month phase-in) | [F] | PIB release + legal firms |

## 3. Customer pain points (clinic front desk)

From the competitor positioning and complaint themes on comparison pages **[R]**, combined with the workflow the code models **[O]**:

1. **Missed enquiries** after hours and during rush periods, when patients message WhatsApp and nobody answers for hours.
2. **Phone tag to fix a time.** "Is 4 pm free?" takes 5–8 messages.
3. **Double-booking and doctor leave clashes.** Paper or WhatsApp-on-one-phone has no calendar truth.
4. **No-shows.** Reminders are manual if they happen at all.
5. **One shared phone.** No way to see who replied, and staff turnover loses history.
6. **Hidden costs in WhatsApp tools.** Per-message markups and chatbot add-ons appear repeatedly as complaints about BSP tools [R].
7. **Too-complex tools.** Generic CRMs (pipelines, campaigns) don't map to "today's appointments".

## 4. Trends and opportunities

| Trend | Label | Implication for Clinicoro |
|---|---|---|
| BSPs bundling "AI agents" at ₹3,000/month add-ons | [R] | Include a capped AI assistant in the mid plan instead of an add-on |
| Meta charging service-window replies from Oct 2026 | [R] | Bot replies now cost ~₹0.115 each after 1,000/month. Budget it; cap replies per chat (already built) |
| DPDP compliance deadline 2027 | [F] | Selling point: consent, deletion, export and audit log built in |
| Clinics already use Practo for discovery | [R] | Position as **complementary** (front desk on WhatsApp), not a Practo replacement |

## 5. Global vs India: where to start

| | India | Global (UK/EU/US/Middle East) |
|---|---|---|
| WhatsApp centrality | Very high [A, widely reported] | High in Middle East/LatAm/EU; lower in US |
| Price tolerance | Low (₹1–4k/month) | Higher ($50–200/month) |
| Competition | Very crowded for CRMs; less for WhatsApp-native clinic booking | Clinic software mature; WhatsApp-native less so outside US |
| Regulation | DPDP (2027) | GDPR/HIPAA: heavier |
| Founder access | In person, local language | Remote only |

**[O] Start in India (Kerala first, where you can visit clinics), dental and outpatient specialties.** Treat the Gulf (large Malayali-run clinic networks, WhatsApp-heavy, higher prices) as the second market. It's reachable through the same networks and the same product.

## 6. Barriers to adoption

- Meta Business verification and WhatsApp number migration (clinics fear losing their existing number/chats).
- Trust: patient data, uptime and "what if the bot says something wrong" (the handoff design answers this).
- Staff training time; resistance from the receptionist whose job changes.
- Price anchoring to free WhatsApp Business app.
