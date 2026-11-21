# Dashboards per business type — design

Date: 2026-11-21 · Status: draft, awaiting approval

## Intent

Today everyone gets the same fixed "Bookings" dashboard, whatever the
business is. A clinic, a salon and an agency look at very different numbers.
Each business type (Settings → Business type: Clinic, Salon & spa, Agency,
Any business) should open on its own professional dashboard, and changing
the type should change the dashboard.

The dashboard opens on **Today**, with filters to look at other periods.
People only ever see data their role allows, and admins can switch each
card on or off per role in Access Control.

## Goals

- One curated dashboard (card set + layout) per sector, chosen from
  `app_branding.vocabulary.sector` and switching live when the sector changes.
- Filter bar: date range (default **Today**) and branch. Every card follows it.
- Data limits come from the existing per-module **read** permission and
  **data scope** (All / Assigned branch / Own / Custom). Nothing new there.
- Per-role card switches on a new **Dashboard** tab in Access Control
  (Option A, picked by the user).

## Non-goals

- Bringing back user customisation (drag/resize/hide, templates). That
  was removed on purpose and stays removed.
- Payments or invoices. "Estimated takings" is computed from service
  prices and is labelled as an estimate.
- A server-side analytics API. Cards keep reading in the browser through RLS.

## Anti-goals

- A booking or leave card that counts rows the role's data scope hides.
  For example, a doctor with "Own" scope must not see clinic-wide booking
  totals. For modules that have no scope yet, see §3.
- Existing roles losing cards after the deploy. Everything must default to on.
- An Access Control switch that looks like a security control but isn't.
  See "What the switch is", below.

## Constraints (from the code)

- Cards live in `src/lib/dashboard/cards.ts` (`CARDS`, each with an optional
  `module`). Data loads in `useDashboardData` (`components/dashboard/dashboard-cards.tsx`),
  grouped into bundles (`today`, `trend`, `metrics`, …), browser-side.
- Data scope is enforced in RLS by migration 058 (`data_scope_allows`) for
  appointments and user_leaves. Browser reads are already scoped, so a card
  computing over appointments automatically respects scope.
- Roles are `designations` rows. `permissions` is saved with
  PATCH /api/master/designations/:id through the generic master entity
  route (`lib/master/entities.ts` fields + sanitizer). `useAuth` loads the
  member's designation (`designation:designations(permissions)`) with a
  fallback when 043 isn't applied.
- Migrations are numbered. The next is **069**. Lesson from 068: if a table
  uses column-level UPDATE grants, a new column needs its own grant.

## Approaches considered (card switches)

- **A. Dashboard tab per role (picked).** A new nullable column
  `designations.dashboard_cards` holds the disabled card ids. The role
  editor gets a Dashboard tab with a switch per card of the current
  business type. It keeps the module grid clean, and null/empty means
  every card is on, so existing roles keep everything.
- **B. Cards as rows in the module grid.** This reuses the save path. But
  it adds about 20 rows, and "absent = denied" would hide every card for
  existing roles until a data migration. Rejected.

## Design

### 1. Sector dashboards

A new file, `src/lib/dashboard/sectors.ts`, maps each sector to an ordered
layout (card ids + grid positions), built on the existing `CARDS`
registry. New cards are added to `CARDS` with their `module`.

| Sector | Cards (top to bottom) |
|---|---|
| Clinic | Bookings · Waiting/confirmed · No-show rate · New patients · Today's patient queue · Doctors on leave / availability · Bookings trend · Unread chats |
| Salon & spa | Bookings · Estimated takings · Chair utilisation · Returning clients · No-show rate · Bookings by stylist · Top services · Today's queue · Unread chats |
| Agency | Open pipeline value · Deals won / lost · Consultations booked · Lead response time · Pipeline by stage · Broadcast results · Recent chats |
| Any business | Bookings · New contacts · Open chats · Open deals · Today's bookings · Conversations chart · Activity |

The page reads the sector from `useBranding()`. Changing the business
type in Settings re-renders with the new layout, with no reload needed.
Card titles use the sector vocabulary (Patient/Client/Customer,
Doctor/Stylist/Consultant) where they name a term.

New cards and their data (all from existing tables):

- **No-show rate:** no_show ÷ (completed + no_show) for bookings in the range.
- **New patients/contacts:** contacts created in the range.
- **Returning clients:** contacts with more than one completed booking ever, among the range's bookings.
- **Bookings by staff:** count per doctor/staff in the range.
- **Chair utilisation (salon):** booked minutes ÷ (open minutes from booking
  settings' opening hours × active bookable staff) over the range. Shown
  as a percentage. Hidden if opening hours aren't set.
- **Top services:** the 5 most-booked services in the range.
- **Estimated takings:** sum of `services.price` over completed bookings in the range. Shown as "Estimated", hidden if no service has a price.
- **Deals won / lost:** deals that moved to a won or lost stage in the range.
- **Broadcast results:** sent / delivered / read for broadcasts in the range.

### 2. Filter bar

```
[ Today ▾ ]  Yesterday · This week · This month · Last 30 days · Custom…     [ All my branches ▾ ]
```

- The default is **Today**. The state lives in the URL (`?range=week&branch=<id>`),
  so a refresh or a shared link keeps it. Nothing is saved per user.
- Ranges use the **business timezone** from booking settings
  (`lib/booking/settings.ts`, `timezone`, default Asia/Kolkata), not the
  browser's, so "Today" always means the business's today. The week
  starts on Monday (my call).
- **Custom** is capped at 12 months. Charts bucket by day up to 31 days,
  then by week up to 26 weeks, then by month.
- **Compare with previous period:** each number card shows the change
  against the same-length period just before ("▲ 12% vs yesterday",
  "vs last week", "vs previous 30 days"). Custom compares with the
  equal-length span before it. There's no arrow when the previous value is 0.
- **Live while on Today:** when the range is Today, the queue and counts
  refetch every 60 seconds and when the tab regains focus. Other ranges
  don't auto-refresh.
- **Cards open the filtered list:** clicking a card opens the matching page
  with the same range and branch, e.g. No-shows → `/appointments?status=no_show&from=…&to=…&branch=…`,
  Unread chats → `/inbox?filter=unread`, Pipeline stage → that pipeline.
  A target page that doesn't take a param yet ignores it (builder adds
  the params that are cheap: appointments status/date/branch).
- Every card queries with the range. Titles follow it ("Bookings today"
  becomes "Bookings this week"). Point-in-time cards ("Doctors on leave",
  "Today's queue") show the range's first day when the range isn't Today,
  and say so.
- **Branch:** lists only the branches the member's appointments scope
  allows (All → every branch; Assigned → their branch; Custom → those
  branches). It's hidden when there is only one choice. Picking a branch
  narrows queries further and can never widen them (RLS still applies).

### 3. Which role sees which data

There's no new mechanism; the dashboard follows Access Control as it stands:

1. **Module read.** A card whose `module` the role can't read is never shown
   (today's rule, kept).
2. **Data scope.** Counts and lists are computed over rows RLS returns, so
   "Own" counts only your bookings and "Assigned branch" only your
   branch. Card subtitles say "Your bookings" / "Your branch" when the
   scope isn't All, so a doctor doesn't mistake their numbers for clinic totals.
3. **Card switch.** This is the new part, below.

**The gap: chats and contacts have no data scope.** Scope exists only for
appointments and user_leaves (`scopesFor`). Cards built on inbox,
contacts, deals or broadcasts therefore show **whole-business** numbers to
anyone who can read that module, including a doctor whose bookings scope is
"Own". The design handles this openly instead of pretending:
- Each `CardDef` gets `scoped: boolean` (true only for appointments/leave cards).
- Unscoped cards carry a small "Whole business" tag on the dashboard
  whenever the viewer's appointments scope isn't All.
- On the Dashboard tab in Access Control, unscoped cards are marked
  "Shows whole-business numbers", so the admin can switch them off for
  doctors and stylists.
- Adding branch scope to contacts and chats is a separate, later change.

This replaces the anti-goal wording above: the guarantee is that **booking
and leave** numbers never pass the role's scope.

### 4. Card switches in Access Control (Option A)

- **Migration 069:** `ALTER TABLE designations ADD COLUMN IF NOT EXISTS
  dashboard_cards jsonb` stores `{ "disabled": ["card-id", …] }`. NULL
  means all on. It stores disabled ids, not enabled ones, so new cards and
  a sector change default to on. If `designations` uses column grants,
  add the grant (check 043 first). It ends with `NOTIFY pgrst, 'reload schema'`.
- **Save path:** add a `dashboard_cards` field to the designations entity
  (`form: false`). The sanitizer keeps only known card ids, deduplicated,
  capped at the size of the registry. It goes through the same PATCH,
  guarded by `designations` edit permission.
- **Load:** `useAuth` also selects `dashboard_cards` with the designation,
  falling back to the current select if 069 isn't applied (all cards on).
  It exposes `cardEnabled(id)`.
- **UI:** the role editor in `access-control-panel.tsx` gets two tabs:
  **Permissions** (today's grid) and **Dashboard**. The Dashboard tab lists
  the current business type's cards as switches, with title, icon and
  module. A card whose module this role can't read shows greyed out with
  "Needs Appointments → Read", and its switch is disabled. It uses the
  same Save/Discard/undo as the grid, one PATCH carrying both fields.
- Members with no designation (role defaults) and owners see all cards
  their modules allow.

**What the switch is:** it decides what appears on the dashboard. It
doesn't hide data. A role that can read Appointments can still open
Appointments. The Dashboard tab says this in one line, so admins use
module permissions and data scope for real restrictions.

### 5. Visible card = all three

```
visible(card) = sector layout contains card
             && (!card.module || can(card.module, 'read'))
             && cardEnabled(card.id)
```

When nothing is visible, the existing empty message shows:
"There are no dashboard cards you have access to."

## Testing

Unit tests (vitest, next to the code):
- Range presets → start/end dates in the business timezone, including
  Monday week start, month edges and the 12-month cap.
- The previous-period range and % change, including the zero case.
- Chart bucket size by range length.
- The utilisation calculation against opening hours.
- Sector → layout, ensuring every id exists in `CARDS`.
- The visibility function.
- The `dashboard_cards` sanitizer.
- The no-show, returning-client and takings calculations on fixture rows.
- The designation PATCH accepting and cleaning `dashboard_cards`.

Manual check in the browser: switch the sector; switch a card off for a
role; sign in as a role with "Own" scope and see only own numbers; check
filter URL persistence.

## Calls I made (check these)

- Disabled-list storage with NULL meaning all on.
- Monday week start; business timezone from booking settings.
- No per-user saved filter; the URL only.
- Point-in-time cards use the first day of a non-Today range.
- Estimated takings hidden when no service has a price.
- Chair utilisation uses booking-settings opening hours × active bookable
  staff (staff leave isn't subtracted in v1).
- 60-second refresh, only on Today.
- Unscoped cards are labelled "Whole business" rather than hidden.
- No per-doctor filter in v1; the branch filter plus "Bookings by staff"
  covers it.

## Left to the builder

The exact grid positions per sector, card visuals (within the existing
StatTile / chart components), copy and translations (en + ko), and how
`useDashboardData` takes the range (a new parameter on each bundle loader).
