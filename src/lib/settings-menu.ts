/**
 * The Settings page's own side list, made editable from the Sidebar menu
 * screen like the sidebar itself: rename a section, change its icon, hide
 * it from the list, and reorder it within its group (Account, Preferences,
 * Workspace). Stored inside the sidebar menu JSON (`app_branding.menu.settings`)
 * so it's saved, reset and permissioned together with the sidebar.
 *
 * Hiding only takes a section out of the list; who may open a section is
 * still decided by roles and Access control. Overview is always shown.
 * Pure: the section ids come in as arguments so this file needs nothing
 * from the components.
 */
import { BRAND_ICON_KEYS } from "./branding-icon-keys";
import { MENU_LABEL_MAX } from "./branding-menu";

export type SettingsItemOverride = { label?: string; icon?: string; hidden?: boolean };
export type SettingsMenu = {
  items?: Record<string, SettingsItemOverride>;
  /** Rail group → section ids in the order to show them. */
  order?: Record<string, string[]>;
};

/** Always listed, never hidden. */
export const LOCKED_SETTINGS = ["overview"];

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** `ids` in the saved order for `group`; unknown ids dropped, new ones at the end. */
export function orderSettingsSections(ids: readonly string[], group: string, menu: SettingsMenu | undefined): string[] {
  const saved = menu?.order?.[group];
  if (!Array.isArray(saved)) return [...ids];
  const kept = saved.filter((id) => ids.includes(id));
  return [...kept, ...ids.filter((id) => !kept.includes(id))];
}

/** One section's override, trusted: a real icon key, a trimmed name, never hidden when locked. */
export function settingsItemOf(menu: SettingsMenu | undefined, id: string): SettingsItemOverride {
  const o = menu?.items?.[id];
  if (!o || typeof o !== "object") return {};
  const out: SettingsItemOverride = {};
  if (typeof o.label === "string" && o.label.trim()) out.label = o.label.trim().slice(0, MENU_LABEL_MAX);
  if (typeof o.icon === "string" && BRAND_ICON_KEYS.includes(o.icon)) out.icon = o.icon;
  if (o.hidden === true && !LOCKED_SETTINGS.includes(id)) out.hidden = true;
  return out;
}

/**
 * Drop empty and default values so the saved JSON stays small and
 * comparable. `groups` is every rail group with its sections in default
 * order; an order is only kept where it differs from that.
 */
export function tidySettingsMenu(raw: unknown, groups: Record<string, readonly string[]>): SettingsMenu | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const menu = raw as SettingsMenu;
  const known = new Set(Object.values(groups).flat());
  const items: NonNullable<SettingsMenu["items"]> = {};
  for (const id of Object.keys(menu.items ?? {})) {
    if (!known.has(id)) continue;
    const clean = settingsItemOf(menu, id);
    if (Object.keys(clean).length) items[id] = clean;
  }
  const order: NonNullable<SettingsMenu["order"]> = {};
  for (const [group, ids] of Object.entries(groups)) {
    const full = orderSettingsSections(ids, group, menu);
    if (!same(full, ids)) order[group] = full;
  }
  const out: SettingsMenu = {
    ...(Object.keys(items).length ? { items } : {}),
    ...(Object.keys(order).length ? { order } : {}),
  };
  return Object.keys(out).length ? out : undefined;
}
