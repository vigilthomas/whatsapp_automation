# Dashboards per business type — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each business type (clinic / salon / agency / general) its own dashboard, with a filter bar (date range defaulting to Today, plus branch), scope-respecting data, comparison with the previous period, and per-role card switches on a new Dashboard tab in Access Control.

**Architecture:** Pure libs carry the decisions: ranges in the business timezone, metric maths, sector layouts, card visibility and the `dashboard_cards` sanitizer. Each lib is unit-tested. The browser loads data through the RLS-scoped Supabase client, as today, so data scope (migration 058/063) applies on its own. Migration 069 adds `designations.dashboard_cards`, which is saved through the existing generic master PATCH.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase JS, next-intl, vitest, react-grid-layout (static), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-11-21-sector-dashboards-design.md`

## Global Constraints

- The default range is **Today**. The presets are `today | yesterday | week | month | last30 | custom`.
- The week starts on **Monday**. All day boundaries use the **business timezone** from `booking_settings.config.timezone` (parsed by `parseBookingConfig`; the default is `"Asia/Kolkata"`).
- Custom range is capped at **12 months** (366 days). Chart buckets are `day` for ≤ 31 days, `week` for ≤ 182 days, and `month` above that.
- Filter state lives in the URL only (`?range=&from=&to=&branch=`). Nothing is saved per user.
- On Today: refetch every **60 s** and on window focus. Other ranges have no auto-refresh.
- Card switches are stored as `{ "disabled": string[] }`. NULL or missing means all on.
- Card visible = in the sector layout **&&** (no module **||** `can(module,'read')`) **&&** not disabled for the role.
- A card is "scoped" only when its module is `appointments`. Unscoped cards show a "Whole business" tag whenever the viewer's appointments scope type ≠ `all`.
- Estimated takings is labelled "Estimated" and hidden when no active service has price > 0.
- No user customisation (drag, resize, templates) comes back.
- Every new string goes in both `messages/en.json` and `messages/ko.json` (ko may repeat the English for now).
- Migrations are numbered and never edited after they ship. This plan adds `069_designation_dashboard_cards.sql`.

## Review Focus

1. **Times near midnight in the business timezone vs the browser timezone.** "Today" must follow the business zone. Test: a browser at 23:30 UTC with the zone Asia/Kolkata (already the next day) → Today is the Kolkata date. Task 1.
2. **Custom range with `from > to`, missing dates, or > 366 days.** Swap or clamp; never throw or produce an empty dashboard. Task 1.
3. **A stored `dashboard_cards` that is malformed or has unknown ids** (old card ids, junk, null). The sanitizer drops it silently and all known cards stay on. Task 4.
4. **A role scoped to "Assigned branch" whose member has no branch set.** Data scope fails closed. The branch filter must show none and not "All branches". Task 2.
5. **Percent change when the previous value is 0.** Show no arrow and no "Infinity%". Task 1.

---

### Task 1: Date ranges in the business timezone

**Files:**
- Create: `src/lib/dashboard/range.ts`
- Test: `src/lib/dashboard/range.test.ts`

**Interfaces:**
- Consumes: `localDay(date, tz)`, `zonedInstant(day, minutes, tz)`, `addDays(day, n)`, `weekdayOf(day)` from `src/lib/booking/slots.ts`
- Produces:
  ```ts
  export const RANGE_PRESETS = ["today","yesterday","week","month","last30","custom"] as const
  export type RangePreset = (typeof RANGE_PRESETS)[number]
  export interface DateRange { preset: RangePreset; fromDay: string; toDay: string /* inclusive YYYY-MM-DD */; from: Date; to: Date /* exclusive instant */; days: number; tz: string }
  export function resolveRange(preset: RangePreset, now: Date, tz: string, custom?: { from?: string; to?: string }): DateRange
  export function previousRange(r: DateRange): DateRange   // same length, ends where r starts; preset kept
  export function bucketFor(r: DateRange): "day" | "week" | "month"
  export function percentChange(cur: number, prev: number): number | null  // null when prev === 0
  export const MAX_RANGE_DAYS = 366
  ```

- [ ] **Step 1: Write failing tests** in `range.test.ts`:
  - `resolveRange("today", new Date("2026-11-21T23:30:00Z"), "Asia/Kolkata")` gives `fromDay === "2026-11-22"`, `toDay === "2026-11-22"` and `days === 1`.
  - `"week"` on Saturday 2026-11-21 (UTC zone) gives `fromDay "2026-11-16"` (Monday) and `toDay "2026-11-21"`. On a Monday, `fromDay` is that Monday.
  - `"month"` → `fromDay "2026-11-01"`. `"last30"` → `days === 30`, ending today. `"yesterday"` → `days === 1`.
  - Custom: `{from:"2026-11-10", to:"2026-11-01"}` is swapped (`fromDay "2026-11-01"`). A missing `from` or `to` falls back to `today`. A span over 366 days is clamped so `days === 366`, ending at `to`.
  - `previousRange(today)` is yesterday. `previousRange(week Mon–Sat, 6 days)` is the 6 days before it.
  - `bucketFor`: 31 days → `"day"`, 32 → `"week"`, 182 → `"week"`, 183 → `"month"`.
  - `percentChange(12, 10) === 20`, `percentChange(5, 0) === null`, `percentChange(0, 4) === -100`.
- [ ] **Step 2:** Run `npx vitest run src/lib/dashboard/range.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement `range.ts`. Work in `YYYY-MM-DD` day strings via `localDay`/`addDays`; `from = zonedInstant(fromDay, 0, tz)` and `to = zonedInstant(addDays(toDay,1), 0, tz)`. Monday start: `weekdayOf` returns 0 = Sunday, so step back `(wd + 6) % 7` days.
- [ ] **Step 4:** Run the test again. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(dashboard): date ranges in the business timezone`.

### Task 2: Filter state, URL and branch choices

**Files:**
- Create: `src/lib/dashboard/filters.ts`
- Test: `src/lib/dashboard/filters.test.ts`

**Interfaces:**
- Consumes: `RangePreset`, `RANGE_PRESETS` (Task 1); `DataScope` from `@/lib/auth/permissions`
- Produces:
  ```ts
  export interface DashboardFilters { preset: RangePreset; from?: string; to?: string; branch: string | null }
  export function parseFilters(params: URLSearchParams): DashboardFilters        // unknown preset → "today"; bad dates dropped
  export function filtersToQuery(f: DashboardFilters): string                     // omits defaults; "" for Today + no branch
  export interface BranchOption { id: string; name: string }
  export function branchChoices(scope: DataScope, myBranchId: string | null, all: BranchOption[]): { options: BranchOption[]; showAll: boolean; hidden: boolean }
  ```

- [ ] **Step 1: Write failing tests:**
  - `parseFilters(new URLSearchParams(""))` gives `{preset:"today", branch:null}`. `?range=bogus` → `"today"`. `?range=custom&from=2026-11-01&to=nope` keeps `from` and drops `to`.
  - `filtersToQuery` round-trips through `parseFilters`. `filtersToQuery({preset:"today",branch:null}) === ""`.
  - `branchChoices`:
    - `{type:"all"}` with 3 branches → 3 options, `showAll: true`, `hidden: false`.
    - `{type:"branch"}` with my branch b2 → `[b2]`, `showAll: false`, `hidden: true` (only one choice).
    - `{type:"branch"}` with no branch → `options: []`, `showAll: false`, `hidden: true`.
    - `{type:"custom", branches:[b1,b3]}` → `[b1,b3]`, `showAll: true`.
    - `{type:"own"}` → `hidden: true`.
    - One branch total under `"all"` → `hidden: true`.
  - A `branch` URL param outside `options` must be ignored by the caller. Add the test `clampBranch(f, options)` returning `null`, and export `clampBranch(f: DashboardFilters, options: BranchOption[]): string | null`.
- [ ] **Step 2:** Run `npx vitest run src/lib/dashboard/filters.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(dashboard): filter state and scope-limited branch choices`.

### Task 3: Metric maths

**Files:**
- Create: `src/lib/dashboard/metrics.ts`
- Test: `src/lib/dashboard/metrics.test.ts`

**Interfaces:**
- Consumes: `DateRange`, `bucketFor` (Task 1); `DayHours`, `Weekday`, `minutesOf` from `@/lib/booking/settings`; `localDay`, `weekdayOf`, `addDays` from `@/lib/booking/slots`
- Produces (all pure; rows are minimal shapes, not full `Appointment`):
  ```ts
  export interface ApptRow { starts_at: string; ends_at: string; status: string; service: string | null; doctor_id: string | null; contact_id: string | null; source?: string | null }
  export function noShowRate(rows: ApptRow[]): number | null            // no_show / (completed + no_show) * 100; null if denominator 0
  export function returningClients(rangeRows: ApptRow[], completedCountByContact: Map<string, number>): number  // distinct contacts in range with ≥2 completed ever
  export function estimatedTakings(rows: ApptRow[], priceByService: Map<string, number>): number | null  // completed only; match service name case-insensitively, trimmed; null if map has no price > 0
  export function utilisation(rows: ApptRow[], hours: Record<Weekday, DayHours>, range: DateRange, staffCount: number): number | null  // booked minutes of non-cancelled / (open minutes × staff) * 100, rounded; null if open minutes or staff is 0
  export function countBy<K extends string>(rows: ApptRow[], key: (r: ApptRow) => K | null): { key: K; count: number }[]  // sorted desc
  export function bucketSeries(rows: { at: string }[], range: DateRange): { key: string; label: string; count: number }[]  // one entry per bucket, zeros included
  ```

- [ ] **Step 1: Write failing tests** with fixture rows:
  - 3 completed + 1 no_show + 2 cancelled → `noShowRate === 25`. All cancelled → `null`.
  - Contacts A (3 completed ever) and B (1 completed ever), both in range → `returningClients === 1`.
  - Takings: completed "Haircut" (500) + completed "haircut " + cancelled "Haircut" → 1000. A price map with all zeros → `null`.
  - Utilisation: Mon 09:00–18:00 open (540 min), 2 staff, 270 booked minutes on that Monday, range = that day → `25`. A closed day → `null`.
  - `countBy` by doctor_id gives descending counts and skips null keys.
  - `bucketSeries` over 7 days → 7 day buckets, including empty days at 0. Over 60 days → week buckets starting Monday.
- [ ] **Step 2:** Run `npx vitest run src/lib/dashboard/metrics.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. Utilisation counts open minutes per day of the range using `hours[weekdayOf(day)]`, and skips `open: false` days.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(dashboard): no-show, returning, takings and utilisation maths`.

### Task 4: Card registry, sector layouts, visibility and migration 069

**Files:**
- Modify: `src/lib/dashboard/cards.ts`. Add new `CARDS` entries and `href`. Rewrite the header comment: customisation is gone, and layouts come from sectors.
- Create: `src/lib/dashboard/sectors.ts`
- Create: `src/lib/dashboard/card-switches.ts`
- Create: `supabase/migrations/069_designation_dashboard_cards.sql`
- Modify: `src/lib/master/entities.ts`. Add field type `"dashboard-cards"` and the designations field `{ key: "dashboard_cards", labelKey: "dashboardCards", type: "dashboard-cards", form: false }`; add a sanitizer case.
- Test: `src/lib/dashboard/sectors.test.ts`, `src/lib/dashboard/card-switches.test.ts`, and add cases to `src/lib/master/entities.test.ts` and `src/app/api/master/[entity]/[id]/route.test.ts`.

**Interfaces:**
- Consumes: `Sector`, `SECTORS` from `@/lib/vocabulary`; `ModuleId`
- Produces:
  ```ts
  // cards.ts — CardDef gains:
  href?: (q: { fromDay: string; toDay: string; branch: string | null }) => string
  // New ids (all module "appointments" unless noted):
  // "stat-no-show-rate", "stat-takings", "stat-utilisation", "stat-returning",
  // "staff-bookings", "top-services",
  // "stat-pipeline-value" (deals), "stat-deals-won-lost" (deals), "broadcast-results" (broadcasts)
  export function isScopedCard(def: CardDef): boolean   // def.module === "appointments"

  // sectors.ts
  export const SECTOR_CARDS: Record<Sector, readonly string[]>
  export function sectorLayout(sector: Sector): DashboardLayout   // packs SECTOR_CARDS[sector] left→right in 12 cols using each CardDef w/h; derives md/sm/xs/xxs with existing deriveLayout
  export function visibleCards(ids: readonly string[], can: (m: ModuleId) => boolean, disabled: ReadonlySet<string>): string[]

  // card-switches.ts
  export interface DashboardCardSwitches { disabled: string[] }
  export function parseDashboardCards(raw: unknown): DashboardCardSwitches   // known CARD_IDS only, dedup, order kept; anything else → { disabled: [] }
  ```
- `SECTOR_CARDS`, exactly in this order:
  - clinic: `stat-bookings-today, stat-pending, stat-no-show-rate, metric-new-contacts, today-bookings, staff-availability, bookings-trend, recent-chats`
  - salon: `stat-bookings-today, stat-takings, stat-utilisation, stat-returning, stat-no-show-rate, staff-bookings, top-services, today-bookings, recent-chats`
  - agency: `stat-pipeline-value, stat-deals-won-lost, stat-bookings-today, response-time, pipeline, broadcast-results, recent-chats`
  - general: `stat-bookings-today, metric-new-contacts, stat-open-chats, metric-open-deals, today-bookings, conversations-chart, activity`
- `href`s:
  - Booking cards → `/appointments?from=…&to=…&branch=…`; no-show adds `&status=no_show`; pending adds `&status=scheduled`.
  - Chat cards → `/inbox`. Contacts → `/contacts`. Deals → `/pipelines`. Broadcasts → `/broadcasts`.
- Migration 069:
  ```sql
  ALTER TABLE designations ADD COLUMN IF NOT EXISTS dashboard_cards JSONB;
  NOTIFY pgrst, 'reload schema';
  ```
  Add a header comment (NULL = all on; disabled-list rationale; the app falls back when the column is missing). No column grant is needed, because designations writes go through the service-role admin client (check that `[entity]/[id]/route.ts` uses `supabaseAdmin()` for PATCH). If it doesn't, add `GRANT UPDATE (dashboard_cards) ON designations TO authenticated;`.

- [ ] **Step 1: Write failing tests:**
  - sectors: every id in every `SECTOR_CARDS` list is in `CARD_IDS`. `sectorLayout(s).lg` has no overlapping items and every item's `x + w ≤ 12`.
  - `visibleCards`: a card with a module the role can't read is dropped; a disabled card is dropped; `quick-actions`-style no-module cards are kept.
  - card-switches: `parseDashboardCards(null)` → `{disabled:[]}`. `{disabled:["pipeline","pipeline","nope",3]}` → `{disabled:["pipeline"]}`. `"junk"` → `{disabled:[]}`.
  - `entities.test.ts`: sanitizing designations `{ dashboard_cards: { disabled: ["pipeline","x"] } }` gives `{ disabled: ["pipeline"] }`, and a non-object gives an error `"dashboard_cards must be an object"`.
  - `route.test.ts`: PATCH designations with `dashboard_cards` passes the sanitized value to `.update()`.
- [ ] **Step 2:** Run `npx vitest run src/lib/dashboard src/lib/master "src/app/api/master"`. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement the cards, sectors, switches, the entity field and the migration. Leave `templateLayout`/templates exported only if something still imports them; otherwise delete them along with their tests (`grep -rn templateLayout src`).
- [ ] **Step 4:** Run the same tests plus `npm run typecheck`. Expected: PASS and clean.
- [ ] **Step 5:** Commit: `feat(dashboard): sector card sets and per-role card switches (069)`.

### Task 5: Load the switches in useAuth

**Files:**
- Modify: `src/hooks/use-auth.tsx`. `fetchDesignation` selects `designation:designations(permissions, dashboard_cards)` and retries with the current select when the error mentions `dashboard_cards` (069 not applied). Return `{ permissions, dashboardCards }`.

**Interfaces:**
- Consumes: `parseDashboardCards` (Task 4)
- Produces on `AuthContextValue`:
  ```ts
  dashboardDisabled: ReadonlySet<string>   // empty Set for no designation / owner / pre-069
  ```

- [ ] **Step 1:** Implement. Keep a stable empty `Set` constant so the identity doesn't change every render. In the `useAuth` fallback object (≈ line 609), add `dashboardDisabled: EMPTY_SET`.
- [ ] **Step 2:** Run `npm run typecheck && npm test`. Expected: clean, all pass.
- [ ] **Step 3:** Commit: `feat(auth): expose the role's disabled dashboard cards`.

### Task 6: Range-aware data loading with live refresh

**Files:**
- Create: `src/lib/dashboard/range-queries.ts`. Browser loaders that take `(db, range: DateRange, branch: string | null)`.
- Modify: `src/components/dashboard/dashboard-cards.tsx`. Change the `useDashboardData` signature, the groups and the refresh.
- Test: `src/lib/dashboard/range-queries.test.ts`, using a mocked Supabase chain that records the filters.

**Interfaces:**
- Consumes: `DateRange`, `previousRange` (Task 1); `ApptRow` and the maths (Task 3); `parseBookingConfig`
- Produces:
  ```ts
  export async function loadAppointmentsIn(db, range, branch): Promise<ApptRow[]>     // starts_at ∈ [from,to), .eq("branch_id", branch) when set; select only ApptRow columns
  export async function loadCompletedCountByContact(db, contactIds: string[]): Promise<Map<string, number>>
  export async function loadServicePrices(db): Promise<Map<string, number>>            // active services, lower-cased trimmed name → price
  export async function loadBookingHours(db): Promise<{ tz: string; hours: Record<Weekday, DayHours> }>  // booking_settings.config via parseBookingConfig; defaults on error
  export async function loadActiveStaffCount(db, branch): Promise<number>              // active bookable doctors
  export async function countIn(db, table: "contacts"|"conversations"|"messages", range, extra?: (q) => q): Promise<number>
  export async function loadDealsSummary(db, range): Promise<{ openValue: number; won: number; lost: number }>  // won/lost by status + updated_at in range (no closed_at column — note in a comment)
  export async function loadBroadcastResults(db, range): Promise<{ sent: number; delivered: number; read: number }>  // sum *_count of broadcasts created in range
  // dashboard-cards.tsx
  export function useDashboardData(cards: readonly string[], range: DateRange, branch: string | null): DashboardData
  // DashboardData gains: appts, prevAppts, takings inputs, deals, prevDeals, broadcasts, counts { newContacts, prevNewContacts, openChats }, tz
  ```

- [ ] **Step 1: Write failing tests:** `loadAppointmentsIn` calls `.gte("starts_at", range.from.toISOString())`, `.lt("starts_at", range.to.toISOString())`, and `.eq("branch_id","b1")` only when a branch is given. `loadServicePrices` lower-cases and trims names. `loadBookingHours` returns `DEFAULT_CONFIG` hours/timezone when the query errors.
- [ ] **Step 2:** Run `npx vitest run src/lib/dashboard/range-queries.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the loaders, then rewrite `useDashboardData`:
  - Keyed by `range.fromDay|range.toDay|branch|groups`. A key change refetches everything that's visible, and the previous-period loads run in parallel for number cards.
  - Drop the `started` once-only set and the 7/30/90 `series` state. The conversations chart uses `bucketSeries` over the range.
  - When `range.preset === "today"`: `setInterval(refetch, 60_000)` plus a `visibilitychange`/`focus` listener, both cleared on unmount or key change.
  - Old in-flight results must not overwrite new ones (use a request counter).
  - `loadBookingHours` runs once. The page needs `tz` before it can build the range, so expose `useBusinessTimezone(): string | null` from the same file (it returns null while loading).
- [ ] **Step 4:** Run `npx vitest run src/lib/dashboard && npm run typecheck`. Expected: PASS and clean.
- [ ] **Step 5:** Commit: `feat(dashboard): load cards for the chosen range and branch, live on Today`.

### Task 7: Card components — new cards, deltas, tags, links

**Files:**
- Modify: `src/components/dashboard/dashboard-cards.tsx` (`DashboardCard` switch)
- Modify: `src/components/dashboard/clinic-widgets.tsx`. `StatTile` gains `delta?: number | null`, `deltaLabel?: string`, `tag?: string` and `href?: string`.
- Modify: `src/components/dashboard/dashboard-grid.tsx`. Pass `range`, `branch`, `wholeBusinessTag: boolean` and `terms` through.
- Modify: `messages/en.json`, `messages/ko.json` (`Dashboard.cards.*`, `Dashboard.range.*`, `Dashboard.vsYesterday|vsLastWeek|vsPrevious`, `Dashboard.wholeBusiness`, `Dashboard.estimated`)

**Interfaces:**
- Consumes: `DashboardData` (Task 6); maths (Task 3); `cardDef(id).href`, `isScopedCard` (Task 4); `percentChange` (Task 1)
- Produces: `<DashboardCard id data range branch wholeBusinessTag />`

- [ ] **Step 1:** Implement the new cases:
  - stat-no-show-rate (%), stat-takings (`formatCurrency`, "Estimated" sub, render nothing → the card hides when `null`), stat-utilisation (%), stat-returning.
  - staff-bookings (horizontal bars by doctor name), top-services (top 5).
  - stat-pipeline-value, stat-deals-won-lost ("12 won · 3 lost"), broadcast-results (sent/delivered/read with % of sent).
  - Titles follow the range: `t('cards.stat-bookings-today', { range: t('range.'+preset) })` — "Bookings {range}".
  - Point-in-time cards (`today-bookings`, `staff-availability`) show `range.fromDay` with the caption "Showing {day}" when the preset isn't today.
- [ ] **Step 2:** Deltas: each number card computes `percentChange(cur, prev)`. The label is from the preset (today → "vs yesterday", week → "vs last week", otherwise "vs previous {days} days"). Show no arrow for `null`. Below 0 uses the danger colour, except for no-show rate, where down is good (flip the colour).
- [ ] **Step 3:** Scoped (booking) cards get the subtitle "Your bookings" when the appointments scope is `own`, and "Your branch" when it is `branch` or `custom` (pass `scopeType` down with `wholeBusinessTag`). The tag is "Whole business" on `!isScopedCard(def)` cards when `wholeBusinessTag` is true. The whole card is a `Link` to `def.href(...)` when `href` is set. Keep focus rings and use `aria-label` = the title.
- [ ] **Step 4:** Run `npm run typecheck && npm run lint`. Expected: clean (the pre-existing branding-preview warning is allowed).
- [ ] **Step 5:** Commit: `feat(dashboard): sector cards with period comparison and drill-down links`.

### Task 8: Filter bar and page wiring

**Files:**
- Create: `src/components/dashboard/filter-bar.tsx`
- Modify: `src/app/(dashboard)/dashboard/page.tsx`. Use `useSearchParams` inside a `Suspense` boundary (see the appointments page comment at line 48).

**Interfaces:**
- Consumes: `parseFilters`, `filtersToQuery`, `branchChoices`, `clampBranch` (Task 2); `resolveRange` (Task 1); `sectorLayout`, `SECTOR_CARDS`, `visibleCards` (Task 4); `dashboardDisabled`, `permissions` (Task 5); `useBusinessTimezone`, `useDashboardData` (Task 6); `parseVocabulary`, `defaultSector`, `isSector`
- Produces: `<FilterBar filters options={branchChoices(...)} onChange={(f) => router.replace('?'+filtersToQuery(f))} />`

- [ ] **Step 1:** Build `FilterBar`:
  - Preset buttons: Today, Yesterday, This week, This month, Last 30 days, Custom…
  - Custom opens two `<input type="date">` with `max` = today in the business timezone.
  - Branch `<select>` is hidden when `hidden` is set. It has an "All my branches" option when `showAll`.
  - It wraps on phones.
- [ ] **Step 2:** In the page:
  - `sector` = `isSector(parseVocabulary(branding.vocabulary).sector)`, else `defaultSector()`.
  - `layout = sectorLayout(sector)`.
  - `ids = visibleCards(SECTOR_CARDS[sector], m => can(m,'read'), dashboardDisabled)`.
  - The scope comes from `scopeOf(permissions,'appointments')`. Branches come from the `branches` table (active, not deleted).
  - `wholeBusinessTag = scope.type !== 'all'`.
  - Until `tz` is known, render the grid skeleton.
  - Keep the greeting, the date (now shown in the business timezone) and the Add booking button.
  - Remove `templateLayout('classic')`.
- [ ] **Step 3:** Run `npm run typecheck && npm run lint && npm test`. Expected: clean, all pass.
- [ ] **Step 4:** Commit: `feat(dashboard): filter bar and per-business-type dashboard`.

### Task 9: Dashboard tab in Access Control

**Files:**
- Modify: `src/components/settings/access-control-panel.tsx`
- Modify: `messages/en.json`, `messages/ko.json` (`AccessControl.tabPermissions`, `tabDashboard`, `dashboardNote`, `needsRead`, `wholeBusinessNumbers`)

**Interfaces:**
- Consumes: `SECTOR_CARDS`, `cardDef`, `isScopedCard` (Task 4); `parseDashboardCards` (Task 4); the existing `nameOf(module)`, `editable`, draft/history and save flow
- Produces: one PATCH body `{ permissions: draft, dashboard_cards: cardsDraft }`

- [ ] **Step 1:** Add a `cardsDraft: DashboardCardSwitches` state, seeded from `parseDashboardCards(selected?.dashboard_cards)` next to `saved`. `dirty` covers both. Undo/history covers both, so store `{permissions, cards}` snapshots.
- [ ] **Step 2:** Add tabs, Permissions (the existing grid, unchanged) and Dashboard. The Dashboard tab:
  - One line of copy: "Choose what this role sees on the dashboard. This doesn't hide data — use Permissions and data scope for that."
  - One row per card of the current sector: icon, title (`Dashboard.cards.*`), module name and a switch.
  - When `draft` lacks read on the module: the row is greyed, the switch is disabled, and it says "Needs {module} → Read".
  - On unscoped cards: a muted "Shows whole-business numbers".
  - Switches are disabled when `!editable`.
- [ ] **Step 3:** Run `npm run typecheck && npm run lint`. Expected: clean.
- [ ] **Step 4:** Commit: `feat(access-control): per-role dashboard card switches`.

### Task 10: Appointments deep-link params

**Files:**
- Modify: `src/app/(dashboard)/appointments/page.tsx`

**Interfaces:**
- Consumes: the `href` query from Task 4: `from`, `to` (YYYY-MM-DD), `branch`, `status`
- Produces: Appointments opening filtered on those values

- [ ] **Step 1:** On mount:
  - `from` → switch to the week view at `startOfWeek(from)`, or the day view when `from === to`.
  - `branch` → `setBranchId` if it's in the loaded branches.
  - `status` → add a status filter (a new `statusFilter` state, applied in the existing `.filter((a) => …)` at ≈ line 213). Show it as a removable chip "Status: No-show ✕".
  - Unknown values are ignored.
- [ ] **Step 2:** Run `npm run typecheck && npm run lint`. Expected: clean.
- [ ] **Step 3:** Commit: `feat(appointments): open filtered from dashboard links`.

### Task 11: Verify end to end

- [ ] **Step 1:** Run `npm run lint && npm run typecheck && npm test && npm run build`. Expected: all pass.
- [ ] **Step 2:** Ask the user to run `069_designation_dashboard_cards.sql` in Supabase. Until they do, confirm the app works without it (the switches stay all on and saving the tab gives a clear error).
- [ ] **Step 3:** In the browser at localhost:3000 (the user's Chrome), check:
  - Each of the 4 business types shows its card set.
  - The filter presets change the URL and the numbers, and a refresh keeps them.
  - Custom range clamps.
  - Card links open filtered Appointments.
  - Switching a card off for a role hides it for a member of that role.
  - An "Own"-scoped member sees only their bookings and the "Whole business" tag.
- [ ] **Step 4:** Report the results. **Do not deploy** until the user confirms.
