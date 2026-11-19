/**
 * Sidebar menu overrides (stored in `app_branding.menu`), ported from the base
 * template's Sidebar menu screen. Only names, icons, groups and hiding: the
 * order inside a group and who may see a page still come from designations.
 */
import { BRAND_ICON_KEYS } from "./branding-icon-keys";

export type BrandMenu = {
  items?: Record<string, { label?: string; icon?: string; group?: string; hidden?: boolean }>;
  groups?: Record<string, { label?: string }>;
};

/** Always in the menu, and never moved. */
export const LOCKED_HREFS = ["/dashboard", "/settings", "/access-control"];
/** Sections whose items stay put and that nothing can be moved into. */
export const FIXED_SECTIONS = ["after", "bottom"];
export const MENU_LABEL_MAX = 40;

type BaseItem = { href: string; module?: string; adminOnly?: boolean };
export type MenuSection<T extends BaseItem> = { id: string; items: T[] };
export type ResolvedItem<T extends BaseItem> = T & { label?: string; iconKey?: string };
export type ResolvedSection<T extends BaseItem> = { id: string; label?: string; items: ResolvedItem<T>[] };

const cleanLabel = (v: unknown) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, MENU_LABEL_MAX) : undefined;

/** Apply the overrides. Permission filtering is separate (`visibleAfterOverrides`). */
export function resolveMenu<T extends BaseItem>(sections: MenuSection<T>[], menu: BrandMenu): ResolvedSection<T>[] {
  const items = menu?.items ?? {};
  const groups = menu?.groups ?? {};
  const targets = new Set(sections.map((s) => s.id).filter((id) => !FIXED_SECTIONS.includes(id)));
  const out: ResolvedSection<T>[] = sections.map((s) => ({ id: s.id, label: cleanLabel(groups[s.id]?.label), items: [] }));
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
  return out;
}

/** The sidebar's permission rule, unchanged by any override. */
export function visibleAfterOverrides<T extends BaseItem>(items: T[], sidebarModules: string[], canManage: boolean): T[] {
  return items.filter((item) => (!item.module || sidebarModules.includes(item.module)) && (!item.adminOnly || canManage));
}
