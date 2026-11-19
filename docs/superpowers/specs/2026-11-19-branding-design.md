# Branding and sidebar menu controls (short design)

**Why:** each Clinicoro install serves one clinic. The clinic wants its own name, logo and colours, and its own menu
wording. The base template (`whatsapp_appointment_bot`, Access control → Branding / Sidebar menu) already does this;
port it to Clinicoro.

**Scope: one per install.** One clinic per project, so branding and menu settings are a single row for the whole
install. They are shown to everyone, including the login, sign-up and forgot-password pages (before sign-in).
Owners and admins of any account (`canManageMembers`) can edit them.

## What gets built
1. **Branding** (new Settings section, admin only), ported from the base template's `BrandingManager`:
   - **Identity:**
     - clinic name (title) and subtitle;
     - a logo, either uploaded (PNG, JPG, SVG or WebP, at most 512 KB, stored as a data URL) or given as an https link;
     - empty means the built-in Clinicoro logo.
     - The name and logo are used in the sidebar, the mobile header, the browser tab title and the auth pages.
   - **Sidebar colours:** background, text, highlight, name colour and subtitle colour, with the base template's
     ready-made styles.
   - **Page colours:** main (primary), text, muted text, background, cards and danger, with ready-made themes.
     - They apply in **light** mode by overriding Clinicoro's CSS variables.
     - **Dark** mode keeps Clinicoro's navy surfaces and uses your main colour as the accent.
     - The per-device light/dark switch stays.
     - The per-device accent picker is replaced by the clinic's main colour.
   - A **live preview**, "Use default colours", and a save confirm that lists what changed, as in the base template.
2. **Sidebar menu** (new Settings section, admin only), ported from the base template's `SidebarMenuManager`:
   - rename any item and any group;
   - change an item's icon (from a curated lucide set);
   - move an item into another group;
   - hide an item for everyone;
   - **Reset** to defaults.
   - **Dashboard, Settings and Access control can't be hidden.**
   - **Order inside a group stays as it is today:** set per designation in Access control. This screen doesn't
     duplicate that.
   - Hiding only tidies the menu. Access rights (designations) still decide who can open a page.
3. **Storage:** migration `046_app_branding.sql` (Clinicoro numbering, after `045`) adds the table `app_branding`:
   - it holds a single row (`id = 1`, checked) with the colour columns, `title`, `subtitle`, `logo` and
     `menu jsonb` (`{items: {href: {label?, icon?, group?, hidden?}}, groups: {id: {label?}}}`);
   - **RLS:** anyone (including anonymous users) can select; update and insert only when the user is owner or admin
     in some account (`account_members`);
   - the seed row has the Clinicoro defaults.
   - You run the migration in the Supabase SQL Editor (Claude doesn't apply it).
4. **Loading:**
   - a `BrandingProvider` reads the row once and caches it in `localStorage`, so the first paint doesn't flash;
   - the root layout applies the colours as CSS variables on `<html>` and sets the title;
   - saving updates every open tab on the next load.

## Approaches
- **Single install row (chosen):** the owner said "one project for one clinic". It's the simplest, and the login
  page can show the brand.
- **Per account:** rejected. With one clinic per install it adds no value, and the login page couldn't know which
  brand to show.
- **Branding as a code/theme file:** rejected. Every change would need a developer and a redeploy, while the base
  template lets the admin change it in the app.

## Not now
- per-designation menu labels;
- custom favicon files (the logo is used for the tab icon only when it's an https URL);
- email templates branding.

## Left to the builder
- exact placement of the preview;
- which lucide icons go in the picker (about 40, matching Clinicoro's current ones plus common extras).
