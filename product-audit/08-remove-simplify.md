# 08 — Remove, merge, simplify

Principle: **hide, don't delete**. Most of these features are working upstream code, and removing them would make it harder to pull template updates and would close off the agency/white-label edition. The aim is a clinic edition that shows about 6 destinations instead of about 20.

| Feature | Current purpose | Problem for clinics | Recommendation | Expected benefit | Risk |
|---|---|---|---|---|---|
| Pipelines / deals | Sales funnel | Not a clinic concept | **HIDE** (feature flag) | Less confusion | Low: re-enable for agencies |
| "Currency" settings | Deal values | Only used by deals | **HIDE** with pipelines | Cleaner settings | None |
| Flows (beta visual builder) | Chatbot menus | Overlaps the booking assistant + AI; beta; heavy deps (`@xyflow/react`, `dagre`) | **HIDE**; keep for Advanced | Less overlap, smaller bundle | Low |
| Automations | Trigger/condition/action | Overlaps booking, reminders; 1,596-line builder | **MAKE OPTIONAL** under Advanced; expose reminders as a switch instead | One obvious way to remind | Medium: some clinics may want custom rules |
| Broadcasts | Bulk template sends | Useful for recalls, but framed as marketing | **SIMPLIFY** into "Recalls & announcements" | Clear purpose | Low |
| Fields & tags | Custom contact fields | Rarely set up by clinics | **MOVE TO ADVANCED** | Simpler patient view | Low |
| Public API v1, API keys, outbound webhooks | Integrations | Not used by ICP; adds attack surface | **MAKE OPTIONAL** (off by default per install) | Smaller attack surface | Low |
| MCP server (`mcp-server/`) | AI agents controlling the CRM | Irrelevant to clinics | **REMOVE from clinic distribution** (keep in repo) | Less to secure/support | None |
| Korean locale | i18n demo | Not the market | **REPLACE** with Malayalam/Hindi | Adoption | Low |
| Sidebar menu editor (incl. custom sections) | Rename/move/hide nav | Power feature; most clinics need presets | **MOVE TO ADVANCED** (keep) | Fewer settings | Low |
| Access control matrix (6 actions × 25 modules) | Fine-grained roles | Confusing; owners misconfigure | **SIMPLIFY**: preset roles first, matrix under "Customise" | Fewer lock-outs | Low |
| Data scope (half-built) | Branch-level data limits | Partially enforced = false sense of security | **FINISH** (if multi-branch clinics are a target) or **REVERT** | Correctness | Medium either way |
| Lockscreen templates | Branded sign-in | Nice-to-have | **KEEP** (done, cheap) | Brand polish | None |
| Template manager (1,140 lines) | Meta templates | Hard for clinics to write templates | **SIMPLIFY**: ship approved clinic template presets; keep editor under Advanced | Faster approval | Low |

## Trade-offs of the important ones

- **Hiding Automations** removes flexibility for power users. Mitigation: keep it under Advanced, and build reminders, confirmations and reviews as first-class switches that cover about 90% of clinic needs.
- **Hiding Flows** means the booking assistant + AI becomes the only bot. That's a deliberate choice: two bot systems in one inbox confuse staff and create precedence bugs (the webhook already has to order booking → Flows → automations → AI).
- **Turning off the API/webhooks by default** may annoy a technical clinic group. Re-enable per install on request.
- **Reverting data scope** gives up a feature multi-branch chains want. Finish it only if the first customers have several branches with separate staff.
