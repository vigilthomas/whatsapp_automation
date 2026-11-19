/**
 * Sidebar menu overrides (stored in `app_branding.menu`), ported from the base
 * template's Sidebar menu screen: names, icons, groups, hiding and order.
 * Who may see a page still comes from designations. A section with no saved
 * order follows the designation's order (Access control).
 */
import { BRAND_ICON_KEYS } from "./branding-icon-keys";

export type BrandMenu = {
  items?: Record<string, { label?: string; icon?: string; group?: string; hidden?: boolean }>;
  groups?: Record<string, { label?: string }>;
  /** Section id → item hrefs in the order to show them. */
  order?: Record<string, string[]>;
  /** Collapsible group ids in the order to show them. */
  groupOrder?: string[];
  /**
   * Sections the clinic added itself ("Add section" on the Sidebar menu
   * screen). Each is a collapsible group like Master or Controls that
   * starts empty; items are moved into it with their Group picker. Deleting
   * one sends its items back to their usual group (an item's `group` that
   * points at a missing section is ignored by `resolveMenu`).
   */
  customGroups?: CustomGroup[];
};

export type CustomGroup = { id: string; label: string; icon?: string };

/** Always in the menu, and never moved. */
export const LOCKED_HREFS = ["/dashboard", "/settings", "/access-control", "/workspace/menu"];
/** Sections whose items stay put and that nothing can be moved into. */
export const FIXED_SECTIONS = ["after", "bottom"];
export const MENU_LABEL_MAX = 40;
/** Enough for any real menu; keeps a stray loop from filling the sidebar. */
export const MAX_CUSTOM_GROUPS = 10;
const CUSTOM_GROUP_ID = /^custom-[a-z0-9]{1,24}$/;

const cleanLabel = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, MENU_LABEL_MAX) : undefined;

type BaseItem = { href: string; module?: string; adminOnly?: boolean };
export type MenuSection<T extends BaseItem> = { id: string; items: T[] };
export type ResolvedItem<T extends BaseItem> = T & { label?: string; iconKey?: string };
/** `ordered`: the menu sets this section's order, so the designation's order doesn't apply. */
/** `iconKey`: an added section's icon (built-in groups keep their own). */
export type ResolvedSection<T extends BaseItem> = {
  id: string;
  label?: string;
  iconKey?: string;
  items: ResolvedItem<T>[];
  ordered?: boolean;
};

/** True for the id of a section added on the Sidebar menu screen. */
export function isCustomGroupId(id: string): boolean {
  return CUSTOM_GROUP_ID.test(id);
}

/** A fresh id for a new section; unique enough within one clinic's menu. */
export function newCustomGroupId(): string {
  return `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * The menu's added sections, cleaned: well-formed ids only, no duplicates,
 * a name (falls back to "Section" so a blank one never renders empty), a
 * known icon or none, at most MAX_CUSTOM_GROUPS. The menu JSON is written
 * from the browser, so the resolver is where it gets trusted.
 */
export function customGroupsOf(menu: BrandMenu): CustomGroup[] {
  const raw = menu?.customGroups;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: CustomGroup[] = [];
  for (const g of raw) {
    if (!g || typeof g !== "object" || typeof g.id !== "string" || !isCustomGroupId(g.id) || seen.has(g.id)) continue;
    seen.add(g.id);
    const group: CustomGroup = { id: g.id, label: cleanLabel(g.label) ?? "Section" };
    if (typeof g.icon === "string" && BRAND_ICON_KEYS.includes(g.icon)) group.icon = g.icon;
    out.push(group);
    if (out.length >= MAX_CUSTOM_GROUPS) break;
  }
  return out;
}

/** The sections with the added ones slotted in after the built-in groups (before the fixed tail). */
export function withCustomGroups<T extends BaseItem>(sections: MenuSection<T>[], menu: BrandMenu): MenuSection<T>[] {
  const extra = customGroupsOf(menu)
    .filter((g) => !sections.some((s) => s.id === g.id))
    .map((g) => ({ id: g.id, items: [] as T[] }));
  if (!extra.length) return sections;
  const at = sections.findIndex((s) => FIXED_SECTIONS.includes(s.id));
  const cut = at < 0 ? sections.length : at;
  return [...sections.slice(0, cut), ...extra, ...sections.slice(cut)];
}

/** Sort by `order` (hrefs); anything not listed keeps its place relative to the rest, after the listed ones. */
function applyOrder<T extends { href: string }>(items: T[], order: unknown): T[] {
  if (!Array.isArray(order)) return items;
  const at = new Map<string, number>();
  order.forEach((h, i) => typeof h === "string" && !at.has(h) && at.set(h, i));
  return items
    .map((item, i) => ({ item, key: at.get(item.href) ?? order.length + i }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.item);
}

/**
 * Group ids in the menu's saved order, the menu's added sections included
 * (after `ids` unless ordered otherwise); unknown ids are ignored and
 * unlisted ones keep their place at the end.
 */
export function orderGroupIds(ids: string[], menu: BrandMenu): string[] {
  const all = [...ids, ...customGroupsOf(menu).map((g) => g.id).filter((id) => !ids.includes(id))];
  return applyOrder(all.map((href) => ({ href })), menu?.groupOrder).map((x) => x.href);
}

/** Apply the overrides. Permission filtering is separate (`visibleAfterOverrides`). */
export function resolveMenu<T extends BaseItem>(base: MenuSection<T>[], menu: BrandMenu): ResolvedSection<T>[] {
  const sections = withCustomGroups(base, menu);
  const custom = new Map(customGroupsOf(menu).map((g) => [g.id, g]));
  const items = menu?.items ?? {};
  const groups = menu?.groups ?? {};
  const targets = new Set(sections.map((s) => s.id).filter((id) => !FIXED_SECTIONS.includes(id)));
  const out: ResolvedSection<T>[] = sections.map((s) => {
    const added = custom.get(s.id);
    const section: ResolvedSection<T> = { id: s.id, label: added?.label ?? cleanLabel(groups[s.id]?.label), items: [] };
    if (added?.icon) section.iconKey = added.icon;
    return section;
  });
  const moved: { to: string; item: ResolvedItem<T> }[] = [];

  sections.forEach((section, i) => {
    for (const item of section.items) {
      const o = items[item.href] ?? {};
      const locked = LOCKED_HREFS.includes(item.href) || FIXED_SECTIONS.includes(section.id);
      if (o.hidden && !locked) continue;
      const resolved: ResolvedItem<T> = { ...item };
      const label = cleanLabel(o.label);
      if (label) resolved.label = label;
      if (o.icon && BRAND_ICON_KEYS.includes(o.icon)) resolved.iconKey = o.icon;
      if (!locked && o.group && o.group !== section.id && targets.has(o.group)) moved.push({ to: o.group, item: resolved });
      else out[i].items.push(resolved);
    }
  });
  for (const { to, item } of moved) out.find((s) => s.id === to)!.items.push(item);
  const order = menu?.order ?? {};
  for (const section of out) {
    if (FIXED_SECTIONS.includes(section.id) || !Array.isArray(order[section.id])) continue;
    section.items = applyOrder(section.items, order[section.id]);
    section.ordered = true;
  }
  return out;
}

/** The sidebar's permission rule, unchanged by any override. */
export function visibleAfterOverrides<T extends BaseItem>(items: T[], sidebarModules: string[], canManage: boolean): T[] {
  return items.filter((item) => (!item.module || sidebarModules.includes(item.module)) && (!item.adminOnly || canManage));
}

/** How the mobile tab bar shows the page at `href`: the same hiding, name and icon as the sidebar. */
export function mobileTab(href: string, menu: BrandMenu): { hidden: boolean; label?: string; iconKey?: string } {
  const o = menu?.items?.[href] ?? {};
  const out: { hidden: boolean; label?: string; iconKey?: string } = { hidden: !!o.hidden && !LOCKED_HREFS.includes(href) };
  const label = cleanLabel(o.label);
  if (label) out.label = label;
  if (o.icon && BRAND_ICON_KEYS.includes(o.icon)) out.iconKey = o.icon;
  return out;
}
